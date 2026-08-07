import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AlegraService } from './alegra.service';
import { WompiService } from './wompi.service';
import { MailService } from '../notifications/mail.service';
import { CreatePaymentSourceDto } from './dto/create-payment-source.dto';
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
    private readonly wompiService: WompiService,
    private readonly mailService: MailService,
  ) { }

  async attachPaymentSource(
    clubId: string,
    dto: CreatePaymentSourceDto,
  ): Promise<{ sourceId: string; type: string; status: string; last4: string | null; dryRun: boolean }> {
    if (dto.type === 'PSE') {
      throw new BadRequestException(
        'PSE no se puede guardar para cobros recurrentes: usa CARD o NEQUI para suscripciones',
      );
    }

    const { rows: clubRows } = await this.db.query<{ billing_contact_email: string | null }>(
      `SELECT billing_contact_email FROM clubs WHERE id = $1`,
      [clubId],
    );

    if (clubRows.length === 0) {
      throw new NotFoundException('Club no encontrado');
    }

    const customerEmail = dto.customerEmail ?? clubRows[0].billing_contact_email ?? null;
    if (!customerEmail) {
      throw new BadRequestException('Se requiere customerEmail (o billing_contact_email del club)');
    }

    if (dto.type !== 'CARD' && !dto.customerData) {
      throw new BadRequestException(
        `customerData (fullName, phoneNumber, legalId, legalIdType) es requerido para ${dto.type}`,
      );
    }

    if (dto.type === 'NEQUI' && !dto.customerData?.phoneNumber) {
      throw new BadRequestException('phoneNumber es requerido para NEQUI');
    }

    // NEQUI: la fuente de pago solo se puede crear cuando el token está APPROVED
    // (el usuario debió aceptar la suscripción en la app Nequi — docs Wompi).
    let nequiTokenStatus: string | null = null;
    if (dto.type === 'NEQUI') {
      nequiTokenStatus = await this.wompiService.getNequiTokenStatus(dto.token);
      if (nequiTokenStatus && nequiTokenStatus !== 'APPROVED') {
        throw new BadRequestException(
          `El token Nequi está en estado ${nequiTokenStatus}. El usuario debe aceptar la suscripción en la app Nequi antes de guardar el método de pago.`,
        );
      }
    }

    // CARD → acceptance de términos de usuario.
    // NEQUI → AMBOS: acceptance_token (términos) + accept_personal_auth (datos personales)
    const acceptanceToken = dto.acceptanceToken ?? (await this.wompiService.getAcceptanceToken());
    const personalDataAuthToken =
      dto.type === 'NEQUI' ? await this.wompiService.getPersonalDataAuthToken() : undefined;

    const res = await this.wompiService.createPaymentSource({
      type: dto.type,
      token: dto.token,
      customer_email: customerEmail,
      acceptance_token: acceptanceToken,
      accept_personal_auth: personalDataAuthToken,
      customer_data: dto.customerData
        ? {
            full_name: dto.customerData.fullName ?? '',
            phone_number: dto.customerData.phoneNumber ?? '',
            legal_id: dto.customerData.legalId ?? '',
            legal_id_type: dto.customerData.legalIdType ?? 'CC',
          }
        : undefined,
    });

    const last4 = res.data.public_data?.last_four ?? null;
    // El teléfono autoritativo es el que devuelve Wompi en public_data (NEQUI)
    const phone =
      dto.type === 'NEQUI'
        ? (res.data.public_data?.phone_number ?? dto.customerData?.phoneNumber ?? null)
        : null;

    const { rowCount } = await this.db.query(
      `UPDATE clubs
       SET wompi_payment_source_id = $1,
           wompi_payment_method_type = $2,
           wompi_customer_email = COALESCE($3, wompi_customer_email),
           wompi_payment_source_status = $4,
           wompi_payment_last4 = COALESCE($5, wompi_payment_last4),
           wompi_payment_phone = COALESCE($6, wompi_payment_phone),
           updated_at = NOW()
       WHERE id = $7`,
      [res.data.id, res.data.type, customerEmail, res.data.status, last4, phone, clubId],
    );

    if (rowCount === 0) {
      throw new NotFoundException('Club no encontrado');
    }

    this.logger.log(`Payment source asociada al club ${clubId} (${res.data.type}, status=${res.data.status})`);

    return {
      sourceId: res.data.id,
      type: res.data.type,
      status: res.data.status,
      last4: last4 ?? null,
      dryRun: this.wompiService.dryRun,
    };
  }

  async clearPaymentSource(clubId: string): Promise<void> {
    await this.db.query(
      `UPDATE clubs
       SET wompi_payment_source_id = NULL,
           wompi_payment_method_type = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [clubId],
    );
    this.logger.log(`Payment source eliminada del club ${clubId}`);
  }

  async createSubscription(
    clubId: string,
    planId: string,
    billingCycle: 'monthly' | 'yearly',
  ): Promise<{ transactionId: string; reference: string; status: string; dryRun: boolean }> {
    const { rows: clubRows } = await this.db.query<{
      wompi_payment_source_id: string | null;
      wompi_payment_method_type: string | null;
      wompi_customer_email: string | null;
      wompi_payment_phone: string | null;
      wompi_payment_source_status: string | null;
    }>(
      `SELECT wompi_payment_source_id, wompi_payment_method_type, wompi_customer_email,
              wompi_payment_phone, wompi_payment_source_status
       FROM clubs WHERE id = $1`,
      [clubId],
    );

    const club = clubRows[0];
    if (!club) {
      throw new NotFoundException('Club no encontrado');
    }
    if (!club.wompi_payment_source_id || !club.wompi_customer_email) {
      throw new ConflictException('PAYMENT_SOURCE_REQUIRED: agrega un método de pago antes de suscribirte');
    }
    if (club.wompi_payment_source_status && club.wompi_payment_source_status !== 'AVAILABLE') {
      throw new ConflictException(
        `El método de pago no está disponible (${club.wompi_payment_source_status})`,
      );
    }

    const { rows: planRows } = await this.db.query<{
      id: string;
      name: string;
      is_active: boolean;
      price_monthly_cents: number;
      price_yearly_cents: number | null;
    }>(`SELECT id, name, is_active, price_monthly_cents, price_yearly_cents FROM plans WHERE id = $1`, [planId]);

    const plan = planRows[0];
    if (!plan || !plan.is_active) {
      throw new NotFoundException('Plan no encontrado o inactivo');
    }

    const { rows: subRows } = await this.db.query<SubscriptionRow>(
      `SELECT id, current_period_end, billing_cycle, plan_id
       FROM club_subscriptions WHERE club_id = $1`,
      [clubId],
    );

    const sub = subRows[0];
    if (!sub) {
      throw new ConflictException('El club no tiene una suscripción inicial');
    }

    const { rows: pendingRows } = await this.db.query<CountRow>(
      `SELECT COUNT(*)::int AS count
       FROM payment_transactions
       WHERE subscription_id = $1 AND status = 'pending'
         AND created_at > NOW() - INTERVAL '7 days'`,
      [sub.id],
    );

    if ((pendingRows[0]?.count ?? 0) > 0) {
      throw new ConflictException('Ya existe un pago pendiente para esta suscripción');
    }

    const priceCents =
      billingCycle === 'yearly'
        ? plan.price_yearly_cents ?? plan.price_monthly_cents * 10
        : plan.price_monthly_cents;

    const periodStart = sub.current_period_end ?? new Date();
    const usage = await this.calculateMonthlyUsage(clubId, periodStart);
    const overageCharge = await this.calculateOverageCharge(plan.id, usage.overage_members);
    const totalCents = priceCents + overageCharge;
    const reference = `MCP-${clubId}-${Date.now()}`;

    const paymentMethodType = (club.wompi_payment_method_type ?? 'CARD').toUpperCase() as 'CARD' | 'NEQUI' | 'PSE';

    const wompiRes = await this.wompiService.createTransaction({
      amount_in_cents: totalCents,
      currency: 'COP',
      customer_email: club.wompi_customer_email,
      reference,
      payment_source_id: club.wompi_payment_source_id,
      payment_method:
        paymentMethodType === 'NEQUI'
          ? { type: 'NEQUI', phone_number: club.wompi_payment_phone ?? undefined }
          : { type: 'CARD', installments: 1 },
    });

    const txId = wompiRes.data.id;
    const status = this.wompiService.dryRun ? 'approved' : 'pending';

    await this.db.query(
      `INSERT INTO payment_transactions
       (club_id, subscription_id, wompi_reference, wompi_transaction_id, amount_cents,
        plan_amount_cents, overage_amount_cents, currency, status, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'COP', $8, $9)`,
      [
        clubId,
        sub.id,
        reference,
        txId,
        totalCents,
        priceCents,
        overageCharge,
        status,
        club.wompi_payment_method_type ?? 'CARD',
      ],
    );

    if (billingCycle !== sub.billing_cycle || planId !== sub.plan_id) {
      await this.db.query(
        `UPDATE club_subscriptions
         SET plan_id = $2, billing_cycle = $3, updated_at = NOW()
         WHERE id = $1`,
        [sub.id, planId, billingCycle],
      );
    }

    if (this.wompiService.dryRun) {
      await this.confirmPayment(txId, reference);
    }

    this.logger.log(`Suscripción ${sub.id} → plan ${plan.id} (${billingCycle}), tx ${reference} (${status})`);

    return { transactionId: txId, reference, status, dryRun: this.wompiService.dryRun };
  }

  async cancelSubscription(clubId: string, reason?: string): Promise<void> {
    const { rowCount } = await this.db.query(
      `UPDATE club_subscriptions
       SET cancel_at_period_end = TRUE,
           cancellation_reason = $1,
           canceled_at = NOW(),
           updated_at = NOW()
       WHERE club_id = $2`,
      [reason ?? null, clubId],
    );

    if (rowCount === 0) {
      throw new NotFoundException('Suscripción no encontrada para este club');
    }

    this.logger.log(`Suscripción del club ${clubId} marcada para cancelar al final del período`);
  }

  async changeSubscription(
    clubId: string,
    planId?: string,
    billingCycle?: 'monthly' | 'yearly',
  ): Promise<{
    type: 'upgrade' | 'downgrade' | 'cycle' | 'none';
    amountCents: number;
    reference?: string;
    transactionId?: string;
    pendingPlanId?: string | null;
    dryRun: boolean;
  }> {
    if (!planId && !billingCycle) {
      throw new BadRequestException('Nada que cambiar: envía planId y/o billingCycle');
    }

    const { rows: clubRows } = await this.db.query<{
      wompi_payment_source_id: string | null;
      wompi_payment_method_type: string | null;
      wompi_customer_email: string | null;
      wompi_payment_phone: string | null;
      wompi_payment_source_status: string | null;
    }>(
      `SELECT wompi_payment_source_id, wompi_payment_method_type, wompi_customer_email,
              wompi_payment_phone, wompi_payment_source_status
       FROM clubs WHERE id = $1`,
      [clubId],
    );

    const club = clubRows[0];
    if (!club) throw new NotFoundException('Club no encontrado');

    const { rows: subRows } = await this.db.query<{
      id: string;
      plan_id: string;
      billing_cycle: string;
      current_period_start: Date | null;
      current_period_end: Date | null;
      pending_plan_id: string | null;
    }>(
      `SELECT id, plan_id, billing_cycle, current_period_start, current_period_end, pending_plan_id
       FROM club_subscriptions WHERE club_id = $1`,
      [clubId],
    );

    const sub = subRows[0];
    if (!sub) throw new NotFoundException('El club no tiene una suscripción');

    const newPlanId = planId ?? sub.plan_id;
    const newCycle = billingCycle ?? sub.billing_cycle;

    if (sub.billing_cycle === 'yearly' && newCycle === 'monthly') {
      throw new BadRequestException(
        'Cambiar de ciclo anual a mensual no está soportado aún: contacta a soporte para migrarlo manualmente',
      );
    }

    if (newPlanId === sub.plan_id && newCycle === sub.billing_cycle) {
      return { type: 'none', amountCents: 0, pendingPlanId: sub.pending_plan_id, dryRun: this.wompiService.dryRun };
    }

    const { rows: newPlanRows } = await this.db.query<{
      id: string;
      is_active: boolean;
      price_monthly_cents: number;
      price_yearly_cents: number | null;
    }>(
      `SELECT id, is_active, price_monthly_cents, price_yearly_cents FROM plans WHERE id = $1`,
      [newPlanId],
    );
    const newPlan = newPlanRows[0];
    if (!newPlan || !newPlan.is_active) {
      throw new NotFoundException('Plan no encontrado o inactivo');
    }

    const currentPrice =
      sub.billing_cycle === 'yearly'
        ? await this.getPlanPrice(sub.plan_id, 'yearly')
        : await this.getPlanPrice(sub.plan_id, 'monthly');

    const newPrice =
      newCycle === 'yearly'
        ? newPlan.price_yearly_cents ?? newPlan.price_monthly_cents * 10
        : newPlan.price_monthly_cents;

    // Fracción no usada del período actual (prorrateo)
    const now = new Date();
    const periodDays = this.daysBetween(sub.current_period_start ?? now, sub.current_period_end ?? now);
    const daysRemaining = this.daysBetween(now, sub.current_period_end ?? now);
    const unusedFraction = daysRemaining / periodDays;

    // 1) Cambio de ciclo monthly → yearly: se cobra el año completo menos el
    //    crédito por los días no usados del mes en curso.
    // 2) Upgrade: se cobra la diferencia prorrateada y el plan cambia ya.
    // 3) Downgrade: se difiere con pending_plan_id (el cron lo aplica al cobrar).
    let type: 'upgrade' | 'downgrade' | 'cycle' | 'none';
    let chargeCents = 0;
    let applyPending: string | null = null;

    if (sub.billing_cycle === 'monthly' && newCycle === 'yearly') {
      type = 'cycle';
      const credit = Math.round(currentPrice * unusedFraction);
      chargeCents = Math.max(0, newPrice - credit);
    } else if (newPrice > currentPrice) {
      type = 'upgrade';
      chargeCents = Math.max(0, Math.round((newPrice - currentPrice) * unusedFraction));
    } else if (newPrice < currentPrice) {
      type = 'downgrade';
      applyPending = newPlanId;
    } else {
      type = 'none';
      chargeCents = 0;
    }

    if (chargeCents > 0) {
      if (!club.wompi_payment_source_id || !club.wompi_customer_email) {
        throw new ConflictException('PAYMENT_SOURCE_REQUIRED: agrega un método de pago antes de cambiar de plan');
      }
      if (club.wompi_payment_source_status && club.wompi_payment_source_status !== 'AVAILABLE') {
        throw new ConflictException(`El método de pago no está disponible (${club.wompi_payment_source_status})`);
      }

      const reference = `MCP-CHG-${clubId}-${Date.now()}`;
      const methodType = (club.wompi_payment_method_type ?? 'CARD').toUpperCase() as 'CARD' | 'NEQUI' | 'PSE';

      const wompiRes = await this.wompiService.createTransaction({
        amount_in_cents: chargeCents,
        currency: 'COP',
        customer_email: club.wompi_customer_email,
        reference,
        payment_source_id: club.wompi_payment_source_id,
        payment_method:
          methodType === 'NEQUI'
            ? { type: 'NEQUI', phone_number: club.wompi_payment_phone ?? undefined }
            : { type: 'CARD', installments: 1 },
      });

      await this.db.query(
        `INSERT INTO payment_transactions
         (club_id, subscription_id, wompi_reference, wompi_transaction_id, amount_cents,
          plan_amount_cents, overage_amount_cents, currency, status, payment_method, plan_id)
         VALUES ($1, $2, $3, $4, $5, $5, 0, 'COP', $6, $7, $8)`,
        [
          clubId,
          sub.id,
          reference,
          wompiRes.data.id,
          chargeCents,
          this.wompiService.dryRun ? 'approved' : 'pending',
          club.wompi_payment_method_type ?? 'CARD',
          newPlanId,
        ],
      );

      if (this.wompiService.dryRun) {
        await this.confirmPayment(wompiRes.data.id, reference);
      }

      if (type === 'upgrade' || type === 'cycle') {
        await this.db.query(
          `UPDATE club_subscriptions
           SET plan_id = $2, billing_cycle = $3, pending_plan_id = NULL, updated_at = NOW()
           WHERE id = $1`,
          [sub.id, newPlanId, newCycle],
        );
      }

      this.logger.log(`Cambio de plan del club ${clubId}: ${type} por ${chargeCents} COP cents (${reference})`);

      return {
        type,
        amountCents: chargeCents,
        reference,
        transactionId: wompiRes.data.id,
        pendingPlanId: null,
        dryRun: this.wompiService.dryRun,
      };
    }

    if (applyPending) {
      await this.db.query(
        `UPDATE club_subscriptions
         SET pending_plan_id = $2, updated_at = NOW()
         WHERE id = $1`,
        [sub.id, applyPending],
      );
      this.logger.log(`Downgrade del club ${clubId} diferido a ${applyPending} (fin de período)`);
      return { type: 'downgrade', amountCents: 0, pendingPlanId: applyPending, dryRun: this.wompiService.dryRun };
    }

    // Sin cargo (mismo precio): aplicar el cambio ya
    await this.db.query(
      `UPDATE club_subscriptions
       SET plan_id = $2, billing_cycle = $3, pending_plan_id = NULL, updated_at = NOW()
       WHERE id = $1`,
      [sub.id, newPlanId, newCycle],
    );

    return { type: 'none', amountCents: 0, pendingPlanId: null, dryRun: this.wompiService.dryRun };
  }

  private async getPlanPrice(planId: string, cycle: 'monthly' | 'yearly'): Promise<number> {
    const { rows } = await this.db.query<{ price_monthly_cents: number; price_yearly_cents: number | null }>(
      `SELECT price_monthly_cents, price_yearly_cents FROM plans WHERE id = $1`,
      [planId],
    );
    if (rows.length === 0) return 0;
    return cycle === 'yearly'
      ? rows[0].price_yearly_cents ?? rows[0].price_monthly_cents * 10
      : rows[0].price_monthly_cents;
  }

  private daysBetween(a: Date, b: Date): number {
    return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000));
  }

  /**
   * Checkout con el Widget de Wompi: NO requiere método de pago guardado
   * (el widget tokeniza la tarjeta en el navegador para la transacción).
   * Inserta la transacción pending (para que el webhook la confirme por
   * referencia), aplica plan/ciclo y devuelve el config del widget con la
   * firma de integridad calculada en el servidor.
   */
  async createCheckout(
    clubId: string,
    planId: string,
    billingCycle: 'monthly' | 'yearly',
    redirectUrl?: string,
  ): Promise<{
    publicKey: string;
    currency: 'COP';
    amountInCents: number;
    reference: string;
    signature: { integrity: string };
    customerData: { email: string };
    redirectUrl?: string;
  }> {
    const { rows: clubRows } = await this.db.query<{
      wompi_customer_email: string | null;
      billing_contact_email: string | null;
    }>(
      `SELECT wompi_customer_email, billing_contact_email FROM clubs WHERE id = $1`,
      [clubId],
    );

    const club = clubRows[0];
    if (!club) throw new NotFoundException('Club no encontrado');

    const customerEmail = club.wompi_customer_email ?? club.billing_contact_email;
    if (!customerEmail) {
      throw new BadRequestException(
        'Se requiere un email del club: guarda el método de pago o el email de facturación primero',
      );
    }

    const { rows: planRows } = await this.db.query<{
      id: string;
      is_active: boolean;
      price_monthly_cents: number;
      price_yearly_cents: number | null;
    }>(`SELECT id, is_active, price_monthly_cents, price_yearly_cents FROM plans WHERE id = $1`, [planId]);

    const plan = planRows[0];
    if (!plan || !plan.is_active) {
      throw new NotFoundException('Plan no encontrado o inactivo');
    }

    const { rows: subRows } = await this.db.query<SubscriptionRow>(
      `SELECT id, current_period_end, billing_cycle, plan_id
       FROM club_subscriptions WHERE club_id = $1`,
      [clubId],
    );

    const sub = subRows[0];
    if (!sub) throw new ConflictException('El club no tiene una suscripción inicial');

    const { rows: pendingRows } = await this.db.query<CountRow>(
      `SELECT COUNT(*)::int AS count
       FROM payment_transactions
       WHERE subscription_id = $1 AND status = 'pending'
         AND created_at > NOW() - INTERVAL '7 days'`,
      [sub.id],
    );

    if ((pendingRows[0]?.count ?? 0) > 0) {
      throw new ConflictException('Ya existe un pago pendiente para esta suscripción');
    }

    const priceCents =
      billingCycle === 'yearly'
        ? plan.price_yearly_cents ?? plan.price_monthly_cents * 10
        : plan.price_monthly_cents;

    const periodStart = sub.current_period_end ?? new Date();
    const usage = await this.calculateMonthlyUsage(clubId, periodStart);
    const overageCharge = await this.calculateOverageCharge(plan.id, usage.overage_members);
    const totalCents = priceCents + overageCharge;
    const reference = `MCP-${clubId}-${Date.now()}`;

    await this.db.query(
      `INSERT INTO payment_transactions
       (club_id, subscription_id, wompi_reference, amount_cents, plan_amount_cents,
        overage_amount_cents, currency, status, plan_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'COP', 'pending', $7)`,
      [clubId, sub.id, reference, totalCents, priceCents, overageCharge, planId],
    );

    if (billingCycle !== sub.billing_cycle || planId !== sub.plan_id) {
      await this.db.query(
        `UPDATE club_subscriptions
         SET plan_id = $2, billing_cycle = $3, pending_plan_id = NULL, updated_at = NOW()
         WHERE id = $1`,
        [sub.id, planId, billingCycle],
      );
    }

    const config = this.wompiService.getCheckoutConfig({
      amountInCents: totalCents,
      reference,
      customerEmail,
      redirectUrl,
    });

    this.logger.log(`Checkout widget preparado para ${clubId}: ${reference} por ${totalCents} COP cents`);

    return config;
  }

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

    const client = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');

      // Idempotencia real (B-15): el UPDATE solo gana si la transacción no
      // estaba aprobada. Dos webhooks APPROVED simultáneos → solo el primero
      // extiende el período (el check fuera de la transacción era TOCTOU).
      const { rows: approved } = await client.query(
        `UPDATE payment_transactions
         SET status = 'approved', paid_at = NOW(), wompi_transaction_id = $1
         WHERE id = $2 AND status <> 'approved'
         RETURNING id`,
        [wompiTransactionId, tx.id],
      );

      if (approved.length === 0) {
        await client.query('ROLLBACK');
        this.logger.log(`Transaction ${reference} already approved (idempotente)`);
        return;
      }

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
    const { rows } = await this.db.query<TransactionRow>(
      `UPDATE payment_transactions
       SET status = 'declined', status_message = $1, wompi_transaction_id = $2
       WHERE wompi_reference = $3
       RETURNING subscription_id, club_id`,
      [statusMessage ?? null, wompiTransactionId, reference],
    );

    if (rows.length === 0) {
      this.logger.warn(`Transaction with reference ${reference} not found for failure marking`);
      return;
    }

    await this.incrementRetryAndMaybeSuspend(rows[0].subscription_id, rows[0].club_id);

    this.logger.log(`Payment marked as failed: ${reference}`);
  }

  /**
   * Compartido entre webhook (markPaymentFailed) y cron de reintentos (B-12):
   * incrementa retry_count de la suscripción y suspende al llegar a 3,
   * notificando por email al admin/leader del club.
   */
  async incrementRetryAndMaybeSuspend(subscriptionId: string, clubId?: string): Promise<void> {
    const { rows: subs } = await this.db.query<SubscriptionRetryRow>(
      `UPDATE club_subscriptions
       SET retry_count = retry_count + 1,
           last_payment_attempt_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING retry_count, status`,
      [subscriptionId],
    );

    if (subs.length > 0 && subs[0].retry_count >= 3) {
      await this.db.query(
        `UPDATE club_subscriptions
         SET status = 'suspended', updated_at = NOW()
         WHERE id = $1`,
        [subscriptionId],
      );
      this.logger.warn(`Subscription ${subscriptionId} suspended after 3 failed payments`);

      await this.notifySuspension(subscriptionId, clubId);
    }
  }

  private async notifySuspension(subscriptionId: string, clubId?: string): Promise<void> {
    if (!clubId) return;
    try {
      const { rows } = await this.db.query<{ club_name: string; email: string }>(
        `SELECT c.name AS club_name, u.email
         FROM clubs c
         JOIN club_members cm ON cm.club_id = c.id
            AND cm.is_active = TRUE AND cm.role IN ('admin', 'leader')
         JOIN users u ON u.id = cm.user_id
         WHERE c.id = $1
         LIMIT 1`,
        [clubId],
      );

      const admin = rows[0];
      if (!admin) {
        this.logger.warn(`Sin admin/leader para notificar suspensión de ${subscriptionId}`);
        return;
      }

      await this.mailService.sendSubscriptionSuspended({
        email: admin.email,
        clubName: admin.club_name,
      });
    } catch (err) {
      this.logger.warn(`No se pudo notificar la suspensión de ${subscriptionId}`, err);
    }
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
    overage_charge_cents: number;
  }> {
    const yearMonth = this.formatYearMonth(periodStart);

    const { rows: usageRows } = await this.db.query<UsageRow>(
      `SELECT member_count, event_count, overage_members, overage_charge_cents
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
      `SELECT p.max_members, p.overage_member_cents
       FROM club_subscriptions s
       JOIN plans p ON s.plan_id = p.id
       WHERE s.club_id = $1`,
      [clubId],
    );

    const maxMembers = planRows[0]?.max_members ?? 0;
    const overageMembers = Math.max(0, memberCount - maxMembers);
    const overageChargeCents = overageMembers * (planRows[0]?.overage_member_cents ?? 0);

    // B-14: persiste también el cargo calculado (columna overage_charge_cents)
    await this.db.query(
      `INSERT INTO club_usage (club_id, year_month, member_count, event_count, overage_members, overage_charge_cents)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (club_id, year_month) DO UPDATE
       SET member_count = $3, event_count = $4, overage_members = $5,
           overage_charge_cents = $6, calculated_at = NOW()`,
      [clubId, yearMonth, memberCount, eventCount, overageMembers, overageChargeCents],
    );

    return {
      member_count: memberCount,
      event_count: eventCount,
      overage_members: overageMembers,
      overage_charge_cents: overageChargeCents,
    };
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
