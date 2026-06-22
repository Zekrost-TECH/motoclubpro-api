import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { WompiService } from './wompi.service';
import { BillingService } from './billing.service';
import type { CronSubscriptionRow, FailedTxRow } from './billing.types';

@Injectable()
export class BillingCronService {
  private readonly logger = new Logger(BillingCronService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly wompiService: WompiService,
    private readonly billingService: BillingService,
  ) { }

  @Cron('0 1 * * *')
  async processRecurringPayments(): Promise<void> {
    this.logger.log('Starting recurring payment processing');

    const today = new Date().toISOString().split('T')[0];

    const { rows: subscriptions } = await this.db.query<CronSubscriptionRow>(
      `SELECT s.id, s.club_id, s.plan_id, s.current_period_start, s.current_period_end,
              c.wompi_customer_email, c.wompi_payment_source_id, c.wompi_payment_method_type,
              p.price_monthly_cents, p.overage_member_cents
       FROM club_subscriptions s
       JOIN clubs c ON s.club_id = c.id
       JOIN plans p ON s.plan_id = p.id
       WHERE s.status IN ('active', 'past_due')
         AND s.current_period_end::date <= $1::date
         AND s.cancel_at_period_end = FALSE`,
      [today],
    );

    for (const sub of subscriptions) {
      try {
        await this.chargeSubscription(sub);
      } catch (err) {
        this.logger.error(`Failed to charge subscription ${sub.id}`, err);
      }
    }

    this.logger.log(`Processed ${subscriptions.length} subscriptions`);
  }

  @Cron('0 2 * * *')
  async retryFailedPayments(): Promise<void> {
    this.logger.log('Starting retry of failed payments');

    const { rows: failed } = await this.db.query<FailedTxRow>(
      `SELECT pt.id, pt.club_id, pt.subscription_id, pt.amount_cents,
              c.wompi_customer_email, c.wompi_payment_source_id
       FROM payment_transactions pt
       JOIN clubs c ON pt.club_id = c.id
       WHERE pt.status = 'declined'
         AND pt.retry_count < 3
         AND pt.created_at > NOW() - INTERVAL '3 days'`,
    );

    for (const tx of failed) {
      try {
        const reference = `MCP-RETRY-${tx.club_id}-${Date.now()}`;

        await this.wompiService.createTransaction({
          amount_in_cents: tx.amount_cents,
          currency: 'COP',
          customer_email: tx.wompi_customer_email,
          reference,
          payment_method: {
            type: 'CARD',
            token: tx.wompi_payment_source_id,
          },
        });

        await this.db.query(
          `UPDATE payment_transactions SET retry_count = retry_count + 1 WHERE id = $1`,
          [tx.id],
        );
      } catch (err) {
        this.logger.error(`Retry failed for transaction ${tx.id}`, err);
      }
    }

    this.logger.log(`Retried ${failed.length} failed payments`);
  }

  private async chargeSubscription(sub: CronSubscriptionRow): Promise<void> {
    const usage = await this.billingService.calculateMonthlyUsage(
      sub.club_id,
      sub.current_period_start ?? new Date(),
    );

    const overageCharge = await this.billingService.calculateOverageCharge(
      sub.plan_id,
      usage.overage_members,
    );

    const totalCents = sub.price_monthly_cents + overageCharge;
    const reference = `MCP-${sub.club_id}-${Date.now()}`;

    await this.wompiService.createTransaction({
      amount_in_cents: totalCents,
      currency: 'COP',
      customer_email: sub.wompi_customer_email,
      reference,
      payment_method: {
        type: ((sub.wompi_payment_method_type ?? 'CARD').toUpperCase() as 'CARD' | 'NEQUI' | 'PSE'),
        token: sub.wompi_payment_source_id,
      },
    });

    await this.db.query(
      `INSERT INTO payment_transactions
       (club_id, subscription_id, wompi_reference, amount_cents, plan_amount_cents,
        overage_amount_cents, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'COP', 'pending')`,
      [
        sub.club_id,
        sub.id,
        reference,
        totalCents,
        sub.price_monthly_cents,
        overageCharge,
      ],
    );

    this.logger.log(`Created pending transaction ${reference} for club ${sub.club_id}`);
  }
}
