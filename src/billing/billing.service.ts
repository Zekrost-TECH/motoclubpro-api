import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AlegraService } from './alegra.service';
import type {
  TransactionRow,
  SubscriptionRow,
  SubscriptionRetryRow,
  UsageRow,
  CountRow,
  PlanRow,
  OveragePlanRow,
} from './billing.types';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly alegraService: AlegraService,
  ) { }

  async confirmPayment(wompiTransactionId: string, reference: string): Promise<void> {
    const { rows } = await this.db.query<TransactionRow>(
      `SELECT id, subscription_id, club_id, status, plan_amount_cents, overage_amount_cents
       FROM payment_transactions
       WHERE wompi_reference = $1`,
      [reference],
    );

    if (rows.length === 0) {
      this.logger.warn(`Transaction with reference ${reference} not found`);
      return;
    }

    const tx = rows[0];

    if (tx.status === 'approved') {
      this.logger.log(`Transaction ${reference} already approved`);
      return;
    }

    const client = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE payment_transactions
         SET status = 'approved', paid_at = NOW(), wompi_transaction_id = $1
         WHERE id = $2`,
        [wompiTransactionId, tx.id],
      );

      const { rows: subs } = await client.query<SubscriptionRow>(
        `SELECT id, current_period_end, billing_cycle, plan_id
         FROM club_subscriptions
         WHERE id = $1`,
        [tx.subscription_id],
      );

      if (subs.length === 0) {
        await client.query('ROLLBACK');
        this.logger.error(`Subscription ${tx.subscription_id} not found for transaction ${reference}`);
        return;
      }

      const sub = subs[0];
      const now = new Date();
      const nextPeriodEnd = this.calculateNextPeriodEnd(
        sub.current_period_end ?? now,
        sub.billing_cycle,
      );

      await client.query(
        `UPDATE club_subscriptions
         SET status = 'active',
             current_period_start = COALESCE(current_period_end, NOW()),
             current_period_end = $1,
             retry_count = 0,
             updated_at = NOW()
         WHERE id = $2`,
        [nextPeriodEnd, sub.id],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => { });
      throw err;
    } finally {
      client.release();
    }

    const { rows: planRows } = await this.db.query<{ name: string }>(
      `SELECT p.name
         FROM club_subscriptions s
         JOIN plans p ON s.plan_id = p.id
         WHERE s.id = $1`,
      [tx.subscription_id],
    );

    await this.alegraService.generateInvoice(
      tx.club_id,
      tx.id,
      planRows[0]?.name ?? 'Suscripcion',
      tx.plan_amount_cents,
      tx.overage_amount_cents,
    );

    this.logger.log(`Payment confirmed and subscription extended: ${reference}`);
  }

  async markPaymentFailed(
    wompiTransactionId: string,
    reference: string,
    statusMessage?: string,
  ): Promise<void> {
    const { rows } = await this.db.query<Pick<TransactionRow, 'subscription_id'>>(
      `UPDATE payment_transactions
       SET status = 'declined', status_message = $1, wompi_transaction_id = $2
       WHERE wompi_reference = $3
       RETURNING subscription_id`,
      [statusMessage ?? null, wompiTransactionId, reference],
    );

    if (rows.length === 0) {
      this.logger.warn(`Transaction with reference ${reference} not found for failure marking`);
      return;
    }

    const { rows: subs } = await this.db.query<SubscriptionRetryRow>(
      `UPDATE club_subscriptions
       SET retry_count = retry_count + 1,
           last_payment_attempt_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING retry_count, status`,
      [rows[0].subscription_id],
    );

    if (subs.length > 0 && subs[0].retry_count >= 3) {
      await this.db.query(
        `UPDATE club_subscriptions
         SET status = 'suspended', updated_at = NOW()
         WHERE id = $1`,
        [rows[0].subscription_id],
      );
      this.logger.warn(`Subscription ${rows[0].subscription_id} suspended after 3 failed payments`);
    }

    this.logger.log(`Payment marked as failed: ${reference}`);
  }

  async handleVoidedTransaction(wompiTransactionId: string, reference: string): Promise<void> {
    await this.db.query(
      `UPDATE payment_transactions
       SET status = 'voided', wompi_transaction_id = $1
       WHERE wompi_reference = $2`,
      [wompiTransactionId, reference],
    );
    this.logger.log(`Transaction voided: ${reference}`);
  }

  async calculateMonthlyUsage(clubId: string, periodStart: Date): Promise<{
    member_count: number;
    event_count: number;
    overage_members: number;
  }> {
    const yearMonth = this.formatYearMonth(periodStart);

    const { rows: usageRows } = await this.db.query<UsageRow>(
      `SELECT member_count, event_count, overage_members
       FROM club_usage
       WHERE club_id = $1 AND year_month = $2`,
      [clubId, yearMonth],
    );

    if (usageRows.length > 0) {
      return usageRows[0];
    }

    const { rows: memberRows } = await this.db.query<CountRow>(
      `SELECT COUNT(*)::int AS count
       FROM club_members
       WHERE club_id = $1 AND is_active = TRUE`,
      [clubId],
    );

    const { rows: eventRows } = await this.db.query<CountRow>(
      `SELECT COUNT(*)::int AS count
       FROM events
       WHERE club_id = $1
         AND created_at >= $2
         AND created_at < $2 + INTERVAL '1 month'`,
      [clubId, periodStart],
    );

    const memberCount = memberRows[0]?.count ?? 0;
    const eventCount = eventRows[0]?.count ?? 0;

    const { rows: planRows } = await this.db.query<PlanRow>(
      `SELECT p.max_members
       FROM club_subscriptions s
       JOIN plans p ON s.plan_id = p.id
       WHERE s.club_id = $1`,
      [clubId],
    );

    const maxMembers = planRows[0]?.max_members ?? 0;
    const overageMembers = Math.max(0, memberCount - maxMembers);

    await this.db.query(
      `INSERT INTO club_usage (club_id, year_month, member_count, event_count, overage_members)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (club_id, year_month) DO UPDATE
       SET member_count = $3, event_count = $4, overage_members = $5, calculated_at = NOW()`,
      [clubId, yearMonth, memberCount, eventCount, overageMembers],
    );

    return { member_count: memberCount, event_count: eventCount, overage_members: overageMembers };
  }

  async calculateOverageCharge(planId: string, overageMembers: number): Promise<number> {
    if (overageMembers <= 0) return 0;

    const { rows } = await this.db.query<OveragePlanRow>(
      `SELECT overage_member_cents FROM plans WHERE id = $1`,
      [planId],
    );

    if (rows.length === 0) return 0;
    return overageMembers * (rows[0].overage_member_cents ?? 0);
  }

  private calculateNextPeriodEnd(currentPeriodEnd: Date, billingCycle: string): Date {
    const date = new Date(currentPeriodEnd);
    if (billingCycle === 'yearly') {
      date.setFullYear(date.getFullYear() + 1);
    } else {
      date.setMonth(date.getMonth() + 1);
    }
    return date;
  }

  private formatYearMonth(date: Date): string {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
