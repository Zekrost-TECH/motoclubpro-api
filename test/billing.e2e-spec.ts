import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BillingModule } from '../src/billing/billing.module';
import { BillingService } from '../src/billing/billing.service';
import { MailService } from '../src/notifications/mail.service';
import { DatabaseService } from '../src/database/database.service';
import { DatabaseModule } from '../src/database/database.module';

// ============================================================================
// E2E de billing con BILLING_DRY_RUN: el grafo DI real de BillingModule
// (WompiService, AlegraService, MailService, crons) + una BD fake en memoria
// que implementa las queries que usa el flujo. Sin red ni credenciales.
// Cubre: checkout → confirmación (idempotente) → cambio de plan → cancelación.
// ============================================================================

class FakeDatabase {
    clubs = new Map<string, Record<string, unknown>>();
    subscriptions = new Map<string, Record<string, unknown>>();
    plans = new Map<string, Record<string, unknown>>();
    transactions: Record<string, unknown>[] = [];
    usage = new Map<string, Record<string, unknown>>();
    members = new Map<string, Record<string, unknown>>();

    private normalize(sql: string): string {
        return sql.replace(/\s+/g, ' ').trim();
    }

    query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<{ rows: T[]; rowCount?: number }> {
        const q = this.normalize(sql);

        if (q.includes('UPDATE clubs') && q.includes('wompi_payment_source_id = $1')) {
            const club = this.clubs.get(params[6] as string);
            if (club) {
                club.wompi_payment_source_id = params[0];
                club.wompi_payment_method_type = params[1];
                club.wompi_customer_email = params[2];
                club.wompi_payment_source_status = params[3];
                club.wompi_payment_last4 = params[4];
                club.wompi_payment_phone = params[5];
                return { rows: [], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
        }
        if (q.includes('UPDATE clubs') && q.includes('wompi_payment_source_id = NULL')) {
            const club = this.clubs.get(params[0] as string);
            if (club) {
                club.wompi_payment_source_id = null;
                club.wompi_payment_method_type = null;
                return { rows: [], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
        }
        if (q.includes('SELECT wompi_payment_source_id') && q.includes('FROM clubs')) {
            const club = this.clubs.get(params[0] as string);
            return { rows: club ? [club] as T[] : [] };
        }
        if (q.includes('SELECT billing_contact_email FROM clubs')) {
            const club = this.clubs.get(params[0] as string);
            return { rows: club ? [{ billing_contact_email: club.billing_contact_email }] as T[] : [] };
        }
        if (q.includes('SELECT wompi_customer_email, billing_contact_email FROM clubs')) {
            const club = this.clubs.get(params[0] as string);
            return { rows: club ? [{ wompi_customer_email: club.wompi_customer_email, billing_contact_email: club.billing_contact_email }] as T[] : [] };
        }
        if (q.includes('SELECT name FROM clubs')) {
            const club = this.clubs.get(params[0] as string);
            return { rows: club ? [{ name: club.name }] as T[] : [] };
        }
        if (q.includes('pending_plan_id') && q.includes('FROM club_subscriptions') && q.includes('WHERE club_id = $1')) {
            const sub = [...this.subscriptions.values()].find((s) => s.club_id === params[0]);
            return { rows: sub ? [sub] as T[] : [] };
        }
        if (q.includes('SELECT id, current_period_end, billing_cycle, plan_id FROM club_subscriptions') && q.includes('WHERE club_id = $1')) {
            const sub = [...this.subscriptions.values()].find((s) => s.club_id === params[0]);
            return { rows: sub ? [sub] as T[] : [] };
        }
        if (q.includes('FROM plans') && q.includes('is_active')) {
            const plan = this.plans.get(params[0] as string);
            return { rows: plan ? [plan] as T[] : [] };
        }
        if (q.includes('SELECT price_monthly_cents, price_yearly_cents FROM plans')) {
            const plan = this.plans.get(params[0] as string);
            return { rows: plan ? [plan] as T[] : [] };
        }
        if (q.includes('FROM payment_transactions') && q.includes('WHERE wompi_reference = $1')) {
            const tx = this.transactions.find((t) => t.wompi_reference === params[0]);
            return { rows: tx ? [tx] as T[] : [] };
        }
        if (q.includes('FROM payment_transactions') && q.includes("status = 'pending'")) {
            return { rows: [{ count: 0 }] as T[] };
        }
        if (q.includes('INSERT INTO payment_transactions')) {
            const status = q.includes("'pending'")
                ? 'pending'
                : typeof params[4] === 'string' ? params[4] : 'pending';
            const tx = {
                id: `tx-${this.transactions.length + 1}`,
                club_id: params[0],
                subscription_id: params[1],
                wompi_reference: params[2],
                wompi_transaction_id: params[3] ?? null,
                status,
                payment_method: params[5] ?? 'CARD',
                plan_amount_cents: params[6] ?? 0,
            };
            this.transactions.push(tx);
            return { rows: [] };
        }
        if (q.includes('UPDATE payment_transactions') && q.includes("status = 'approved'") && q.includes('RETURNING id')) {
            const tx = this.transactions.find((t) => t.id === String(params[1]));
            if (tx && tx.status !== 'approved') {
                tx.status = 'approved';
                tx.wompi_transaction_id = String(params[0]);
                return { rows: [tx] as T[] };
            }
            return { rows: [] };
        }
        if (q.includes('SELECT id, current_period_end, billing_cycle, plan_id') && q.includes('WHERE id = $1')) {
            const sub = this.subscriptions.get(params[0] as string);
            return { rows: sub ? [sub] as T[] : [] };
        }
        if (q.includes('UPDATE club_subscriptions') && q.includes("SET plan_id = $2, billing_cycle = $3")) {
            const sub = this.subscriptions.get(params[0] as string);
            if (sub) {
                sub.plan_id = params[1];
                sub.billing_cycle = params[2];
                sub.pending_plan_id = null;
            }
            return { rows: [] };
        }
        if (q.includes('UPDATE club_subscriptions') && q.includes('pending_plan_id = $2')) {
            const sub = this.subscriptions.get(params[0] as string);
            if (sub) sub.pending_plan_id = params[1];
            return { rows: [] };
        }
        if (q.includes('UPDATE club_subscriptions') && q.includes('cancel_at_period_end = TRUE')) {
            const sub = [...this.subscriptions.values()].find((s) => s.club_id === params[1]);
            if (sub) {
                sub.cancel_at_period_end = true;
                sub.cancellation_reason = params[0];
                return { rowCount: 1 };
            }
            return { rowCount: 0 };
        }
        if (q.includes('UPDATE club_subscriptions') && q.includes('retry_count = retry_count + 1')) {
            const sub = this.subscriptions.get(params[0] as string);
            if (sub) {
                sub.retry_count = (sub.retry_count as number) + 1;
                return { rows: [sub] as T[] };
            }
            return { rows: [] };
        }
        if (q.includes('UPDATE club_subscriptions') && q.includes("SET status = 'active'")) {
            const sub = this.subscriptions.get(params[1] as string);
            if (sub) sub.status = 'active';
            return { rows: [] };
        }
        if (q.includes("SET status = 'suspended'")) {
            const sub = this.subscriptions.get(params[0] as string);
            if (sub) sub.status = 'suspended';
            return { rows: [] };
        }
        if (q.includes('FROM club_usage')) {
            const usage = [...this.usage.values()].find((u) => u.club_id === params[0]);
            return { rows: usage ? [usage] as T[] : [] };
        }
        if (q.includes('INSERT INTO club_usage')) {
            const key = `${String(params[0])}:${String(params[1])}`;
            this.usage.set(key, {
                club_id: params[0],
                year_month: params[1],
                member_count: params[2],
                event_count: params[3],
                overage_members: params[4],
                overage_charge_cents: params[5],
            });
            return { rows: [] };
        }
        if (q.includes('SELECT c.name AS club_name, u.email')) {
            const member = [...this.members.values()].find((m) => m.club_id === params[0]);
            return { rows: member ? [{ club_name: member.club_name, email: member.email }] as T[] : [] };
        }
        if (q.includes('SELECT p.name') && q.includes('JOIN plans p')) {
            const sub = this.subscriptions.get(params[0] as string);
            const plan = sub ? this.plans.get(sub.plan_id as string) : undefined;
            return { rows: plan ? [{ name: plan.name }] as T[] : [] };
        }
        return { rows: [] };
    }

    getPool() {
        return {
            connect: () => Promise.resolve({
                query: (sql: string, params: unknown[] = []) => {
                    const q = this.normalize(sql);
                    if (q === 'BEGIN' || q === 'COMMIT' || q === 'ROLLBACK') return Promise.resolve({ rows: [] });
                    return this.query(sql, params);
                },
                release: () => undefined,
            }),
        };
    }
}

describe('Billing (e2e, dry-run sin red)', () => {
    let moduleRef: TestingModule;
    let billing: BillingService;
    const db = new FakeDatabase();

    beforeAll(async () => {
        process.env.BILLING_DRY_RUN = 'true';
        process.env.WOMPI_PUBLIC_KEY = 'pub_test_e2e';
        process.env.WOMPI_INTEGRITY_KEY = 'test_integrity_e2e';

        // Seed
        db.clubs.set('club-1', {
            id: 'club-1',
            name: 'Iron Biker E2E',
            billing_contact_email: 'tesorero@ironbikers.co',
            wompi_payment_source_id: null,
            wompi_payment_method_type: null,
            wompi_customer_email: null,
            wompi_payment_phone: null,
            wompi_payment_source_status: null,
        });
        db.plans.set('prueba', { id: 'prueba', name: 'Prueba', is_active: true, price_monthly_cents: 0, price_yearly_cents: 0, overage_member_cents: 0, max_members: 15 });
        db.plans.set('esencial', { id: 'esencial', name: 'Esencial', is_active: true, price_monthly_cents: 7990000, price_yearly_cents: 79900000, overage_member_cents: 250000, max_members: 25 });
        db.plans.set('pro', { id: 'pro', name: 'Pro', is_active: true, price_monthly_cents: 24990000, price_yearly_cents: 249900000, overage_member_cents: 150000, max_members: 100 });
        const start = new Date('2026-08-01');
        const end = new Date('2026-09-01');
        db.subscriptions.set('sub-1', {
            id: 'sub-1',
            club_id: 'club-1',
            plan_id: 'prueba',
            billing_cycle: 'monthly',
            status: 'trial',
            current_period_start: start,
            current_period_end: end,
            trial_ends_at: end,
            pending_plan_id: null,
            retry_count: 0,
            cancel_at_period_end: false,
        });
        db.usage.set('club-1:2026-08', { club_id: 'club-1', year_month: '2026-08', member_count: 10, event_count: 1, overage_members: 0, overage_charge_cents: 0 });

        moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
                DatabaseModule,
                BillingModule,
            ],
        })
            .overrideProvider(DatabaseService)
            .useValue(db)
            .compile();

        billing = moduleRef.get(BillingService);
    });

    afterAll(async () => {
        await moduleRef.close();
        delete process.env.BILLING_DRY_RUN;
        delete process.env.WOMPI_PUBLIC_KEY;
        delete process.env.WOMPI_INTEGRITY_KEY;
    });

    it('flujo completo: payment source → checkout → confirmación idempotente → upgrade → downgrade → cancel', async () => {
        // 1. Método de pago (dry-run)
        const source = await billing.attachPaymentSource('club-1', {
            type: 'CARD',
            token: 'tok_test_e2e',
            customerEmail: 'tesorero@ironbikers.co',
        } as never);
        expect(source.status).toBe('AVAILABLE');
        expect(source.last4).toBe('4242');

        // 2. Checkout (esencial monthly) — dry-run lo aprueba y confirma solo
        const sub = await billing.createSubscription('club-1', 'esencial', 'monthly');
        expect(sub.status).toBe('approved');
        expect(sub.dryRun).toBe(true);

        let row = [...db.subscriptions.values()][0];
        expect(row.plan_id).toBe('esencial');
        expect(row.status).toBe('active');

        // 3. Segunda confirmación manual → idempotente (no extiende de nuevo)
        const txs = db.transactions;
        await billing.confirmPayment('dryrun-x', txs[0].wompi_reference as string);
        await billing.confirmPayment('dryrun-y', txs[0].wompi_reference as string);
        const approvedTxs = txs.filter((t) => t.status === 'approved');
        expect(approvedTxs.length).toBe(1);

        // 4. Upgrade a pro → cargo prorrateado > 0 y plan aplicado
        const upgrade = await billing.changeSubscription('club-1', 'pro');
        expect(upgrade.type).toBe('upgrade');
        expect(upgrade.amountCents).toBeGreaterThan(0);
        row = [...db.subscriptions.values()][0];
        expect(row.plan_id).toBe('pro');

        // 5. Downgrade a esencial → diferido sin cargo
        const downgrade = await billing.changeSubscription('club-1', 'esencial');
        expect(downgrade.type).toBe('downgrade');
        expect(downgrade.pendingPlanId).toBe('esencial');
        row = [...db.subscriptions.values()][0];
        expect(row.plan_id).toBe('pro');
        expect(row.pending_plan_id).toBe('esencial');

        // 6. Cancelación
        await billing.cancelSubscription('club-1', 'e2e');
        row = [...db.subscriptions.values()][0];
        expect(row.cancel_at_period_end).toBe(true);
        expect(row.cancellation_reason).toBe('e2e');
    });

    it('checkout widget: devuelve config con firma de integridad y transacción pending', async () => {
        const config = await billing.createCheckout('club-1', 'esencial', 'monthly', 'https://admin.bikeros.co/billing/result');

        expect(config.publicKey).toBeTruthy();
        expect(config.amountInCents).toBe(7990000);
        expect(config.reference).toContain('MCP-');
        expect(config.signature.integrity).toMatch(/^[a-f0-9]{64}$/);
        expect(config.customerData.email).toBe('tesorero@ironbikers.co');
        expect(config.redirectUrl).toBe('https://admin.bikeros.co/billing/result');

        const pending = db.transactions.filter((t) => t.status === 'pending');
        expect(pending.length).toBe(1);
    });

    it('suspende y notifica tras 3 cobros fallidos', async () => {
        const mailService = moduleRef.get(MailService);
        const spy = jest.spyOn(mailService, 'sendSubscriptionSuspended').mockResolvedValue(undefined);
        db.members.set('m-1', { club_id: 'club-1', club_name: 'Iron Biker E2E', email: 'admin@ironbikers.co' });

        await billing.incrementRetryAndMaybeSuspend('sub-1', 'club-1');
        await billing.incrementRetryAndMaybeSuspend('sub-1', 'club-1');
        await billing.incrementRetryAndMaybeSuspend('sub-1', 'club-1');

        const row = [...db.subscriptions.values()][0];
        expect(row.status).toBe('suspended');
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ email: 'admin@ironbikers.co' }));
    });
});
