import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { WompiService } from './wompi.service';
import { BillingService } from './billing.service';
import { AlegraService } from './alegra.service';
import type { CronSubscriptionRow, FailedTxRow, PendingInvoiceRow } from './billing.types';

@Injectable()
export class BillingCronService {
  private readonly logger = new Logger(BillingCronService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly wompiService: WompiService,
    private readonly billingService: BillingService,
    private readonly alegraService: AlegraService,
  ) { }

  @Cron('0 1 * * *')
  async processRecurringPayments(): Promise<void> {
    this.logger.log('Starting recurring payment processing');

    const today = new Date().toISOString().split('T')[0];

    // B-17: precio según billing_cycle (yearly → price_yearly_cents, que ya
    // incluye el descuento de 2 meses = 10× el mensual).
    // Bug A: también cobra trials vencidos (trial_ends_at <= hoy).
    // Bug B: guard anti doble-cobro (webhook lento → no crear 2nd pending).
    // B-04: el downgrade diferido (pending_plan_id) se cobra y aplica al vencer.
    const { rows: subscriptions } = await this.db.query<CronSubscriptionRow>(
      `SELECT s.id, s.club_id, COALESCE(s.pending_plan_id, s.plan_id) AS plan_id,
              s.status, s.current_period_start, s.current_period_end, s.pending_plan_id,
              c.wompi_customer_email, c.wompi_payment_source_id, c.wompi_payment_method_type,
              c.wompi_payment_phone, c.wompi_payment_source_status,
              CASE WHEN s.billing_cycle = 'yearly' THEN p.price_yearly_cents
                   ELSE p.price_monthly_cents END AS price_cents,
              p.overage_member_cents
       FROM club_subscriptions s
       JOIN clubs c ON s.club_id = c.id
       JOIN plans p ON p.id = COALESCE(s.pending_plan_id, s.plan_id)
       WHERE s.cancel_at_period_end = FALSE
         AND (
              (s.status IN ('active', 'past_due') AND s.current_period_end::date <= $1::date)
           OR (s.status = 'trial' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at::date <= $1::date)
         )
         AND c.wompi_payment_source_id IS NOT NULL
         AND (c.wompi_payment_source_status IS NULL OR c.wompi_payment_source_status = 'AVAILABLE')
         AND NOT EXISTS (
              SELECT 1 FROM payment_transactions pt
              WHERE pt.subscription_id = s.id AND pt.status = 'pending'
                AND pt.created_at > NOW() - INTERVAL '7 days'
         )`,
      [today],
    );

    for (const sub of subscriptions) {
      try {
        await this.chargeSubscription(sub);
      } catch (err) {
        this.logger.error(`Failed to charge subscription ${sub.id}`, err);
      }
    }

    // B-05: materializar cancelaciones cuando vence el período pagado
    await this.db.query(
      `UPDATE club_subscriptions
       SET status = 'canceled', updated_at = NOW()
       WHERE cancel_at_period_end = TRUE
         AND current_period_end IS NOT NULL
         AND current_period_end::date < $1::date`,
      [today],
    );

    this.logger.log(`Processed ${subscriptions.length} subscriptions`);
  }

  @Cron('0 2 * * *')
  async retryFailedPayments(): Promise<void> {
    this.logger.log('Starting retry of failed payments');

    // B-12: respeta retry_count de la SUSCRIPCIÓN (suspende a las 3)
    // Bug C: cada reintento inserta su propia fila para que el webhook la encuentre.
    const { rows: failed } = await this.db.query<FailedTxRow>(
      `SELECT pt.id, pt.club_id, pt.subscription_id, pt.amount_cents, pt.retry_count,
              c.wompi_customer_email, c.wompi_payment_source_id, c.wompi_payment_method_type,
              c.wompi_payment_phone, c.wompi_payment_source_status,
              s.retry_count AS sub_retry_count
       FROM payment_transactions pt
       JOIN clubs c ON pt.club_id = c.id
       JOIN club_subscriptions s ON pt.subscription_id = s.id
       WHERE pt.status = 'declined'
         AND pt.retry_count < 3
         AND s.retry_count < 3
         AND pt.created_at > NOW() - INTERVAL '3 days'`,
    );

    for (const tx of failed) {
      try {
        const reference = `MCP-RETRY-${tx.club_id}-${Date.now()}`;
        const methodType = (tx.wompi_payment_method_type ?? 'CARD').toUpperCase() as 'CARD' | 'NEQUI' | 'PSE';

        await this.wompiService.createTransaction({
          amount_in_cents: tx.amount_cents,
          currency: 'COP',
          customer_email: tx.wompi_customer_email,
          reference,
          payment_source_id: tx.wompi_payment_source_id,
          payment_method:
            methodType === 'NEQUI'
              ? { type: 'NEQUI', phone_number: tx.wompi_payment_phone ?? undefined }
              : { type: 'CARD', installments: 1 },
        });

        // Bug C: insertar la fila ANTES de que llegue el webhook del retry,
        // así confirmPayment/markPaymentFailed la encuentran por referencia.
        await this.db.query(
          `INSERT INTO payment_transactions
           (club_id, subscription_id, wompi_reference, amount_cents, plan_amount_cents,
            overage_amount_cents, currency, status, payment_method, retry_count)
           VALUES ($1, $2, $3, $4, $4, 0, 'COP', 'pending', $5, $6)`,
          [tx.club_id, tx.subscription_id, reference, tx.amount_cents, tx.wompi_payment_method_type ?? 'CARD', tx.retry_count + 1],
        );

        await this.db.query(
          `UPDATE payment_transactions SET retry_count = retry_count + 1 WHERE id = $1`,
          [tx.id],
        );
      } catch (err) {
        this.logger.error(`Retry failed for transaction ${tx.id}`, err);
        // B-12: el fallo en crear el reintento también cuenta contra la suscripción
        await this.billingService.incrementRetryAndMaybeSuspend(tx.subscription_id).catch(() => { });
      }
    }

    this.logger.log(`Retried ${failed.length} failed payments`);
  }

  @Cron('0 4 * * *')
  async reconcilePendingTransactions(): Promise<void> {
    this.logger.log('Starting reconciliation of pending transactions');

    // Si el webhook de Wompi no llegó (raro pero posible), el pago queda
    // 'pending' para siempre. Este cron consulta el estado real y cierra el
    // ciclo: APPROVED → confirmPayment, DECLINED/ERROR → markPaymentFailed.
    const { rows } = await this.db.query<{ id: string; wompi_transaction_id: string; wompi_reference: string }>(
      `SELECT id, wompi_transaction_id, wompi_reference
       FROM payment_transactions
       WHERE status = 'pending'
         AND wompi_transaction_id IS NOT NULL
         AND created_at < NOW() - INTERVAL '15 minutes'
         AND created_at > NOW() - INTERVAL '7 days'`,
    );

    let reconciled = 0;
    for (const tx of rows) {
      try {
        const state = await this.wompiService.getTransaction(tx.wompi_transaction_id);
        if (state.status === 'APPROVED') {
          await this.billingService.confirmPayment(tx.wompi_transaction_id, tx.wompi_reference);
          reconciled++;
        } else if (state.status === 'DECLINED' || state.status === 'ERROR') {
          await this.billingService.markPaymentFailed(
            tx.wompi_transaction_id,
            tx.wompi_reference,
            state.status_message,
          );
          reconciled++;
        } else if (state.status === 'VOIDED') {
          await this.billingService.handleVoidedTransaction(tx.wompi_transaction_id, tx.wompi_reference);
          reconciled++;
        }
      } catch (err) {
        this.logger.error(`Reconciliation failed for transaction ${tx.id}`, err);
      }
    }

    if (rows.length > 0) {
      this.logger.log(`Transactions reconciled: ${reconciled}/${rows.length}`);
    }
  }

  @Cron('0 3 * * *')
  async retryPendingInvoices(): Promise<void> {
    this.logger.log('Starting retry of pending invoices (Alegra)');

    // B-13: pagos aprobados sin factura (Alegra falló o el timbre quedó en
    // borrador) → se reintenta; generateInvoice es idempotente por tx id.
    const { rows } = await this.db.query<PendingInvoiceRow>(
      `SELECT pt.id, pt.club_id, pt.plan_amount_cents, pt.overage_amount_cents,
              COALESCE(p.name, 'Suscripcion') AS plan_name
       FROM payment_transactions pt
       JOIN club_subscriptions s ON pt.subscription_id = s.id
       JOIN plans p ON s.plan_id = p.id
       WHERE pt.status = 'approved'
         AND pt.invoice_generated = FALSE
         AND pt.created_at > NOW() - INTERVAL '60 days'
       ORDER BY pt.created_at
       LIMIT 50`,
    );

    let ok = 0;
    for (const tx of rows) {
      try {
        const result = await this.alegraService.generateInvoice(
          tx.club_id,
          tx.id,
          tx.plan_name,
          tx.plan_amount_cents,
          tx.overage_amount_cents,
        );
        if (result) ok++;
      } catch (err) {
        this.logger.error(`Invoice retry failed for transaction ${tx.id}`, err);
      }
    }

    if (rows.length > 0) {
      this.logger.log(`Invoices retried: ${ok}/${rows.length}`);
    }
  }

  private async chargeSubscription(sub: CronSubscriptionRow): Promise<void> {
    const usage = await this.billingService.calculateMonthlyUsage(
      sub.club_id,
      sub.current_period_start ?? new Date(),
    );

    const totalCents = sub.price_cents + usage.overage_charge_cents;
    const reference = `MCP-${sub.club_id}-${Date.now()}`;
    const methodType = (sub.wompi_payment_method_type ?? 'CARD').toUpperCase() as 'CARD' | 'NEQUI' | 'PSE';

    await this.wompiService.createTransaction({
      amount_in_cents: totalCents,
      currency: 'COP',
      customer_email: sub.wompi_customer_email,
      reference,
      payment_source_id: sub.wompi_payment_source_id,
      payment_method:
        methodType === 'NEQUI'
          ? { type: 'NEQUI', phone_number: sub.wompi_payment_phone ?? undefined }
          : { type: 'CARD', installments: 1 },
    });

    const client = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO payment_transactions
         (club_id, subscription_id, wompi_reference, amount_cents, plan_amount_cents,
          overage_amount_cents, currency, status, payment_method)
         VALUES ($1, $2, $3, $4, $5, $6, 'COP', 'pending', $7)`,
        [
          sub.club_id,
          sub.id,
          reference,
          totalCents,
          sub.price_cents,
          usage.overage_charge_cents,
          sub.wompi_payment_method_type ?? 'CARD',
        ],
      );

      // Bug A: el trial se cobra y transiciona a active en el mismo acto
      if (sub.status === 'trial') {
        await client.query(
          `UPDATE club_subscriptions SET status = 'active', updated_at = NOW() WHERE id = $1`,
          [sub.id],
        );
      }

      // B-04: materializar el downgrade diferido al cobrar el nuevo período
      if (sub.pending_plan_id) {
        await client.query(
          `UPDATE club_subscriptions
           SET plan_id = $2, pending_plan_id = NULL, updated_at = NOW()
           WHERE id = $1`,
          [sub.id, sub.plan_id],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => { });
      throw err;
    } finally {
      client.release();
    }

    this.logger.log(`Created pending transaction ${reference} for club ${sub.club_id}`);
  }
}
