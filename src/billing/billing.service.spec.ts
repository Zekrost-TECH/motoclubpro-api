import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { DatabaseService } from '../database/database.service';
import { AlegraService } from './alegra.service';
import { WompiService } from './wompi.service';
import { MailService } from '../notifications/mail.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('BillingService', () => {
    let service: BillingService;
    let dbQueryMock: jest.Mock;
    let alegraMock: jest.Mocked<Partial<AlegraService>>;
    let wompiMock: jest.Mocked<Partial<WompiService>>;
    let mailMock: jest.Mocked<Partial<MailService>>;

    beforeEach(async () => {
        dbQueryMock = jest.fn().mockResolvedValue({ rows: [] });
        alegraMock = { generateInvoice: jest.fn().mockResolvedValue(undefined) };
        mailMock = { sendSubscriptionSuspended: jest.fn().mockResolvedValue(undefined) };
        wompiMock = {
            dryRun: false,
            getAcceptanceToken: jest.fn().mockResolvedValue('acc_tok'),
            getPersonalDataAuthToken: jest.fn().mockResolvedValue('pd_auth_tok'),
            getNequiTokenStatus: jest.fn().mockResolvedValue('APPROVED'),
            createPaymentSource: jest.fn().mockResolvedValue({
                data: { id: 'src_123', type: 'CARD', status: 'AVAILABLE', public_data: { last_four: '4242' } },
            }),
            createTransaction: jest.fn().mockResolvedValue({
                data: { id: 'wompi-tx-1', status: 'PENDING', reference: 'ref-1' },
            }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BillingService,
                { provide: DatabaseService, useValue: { query: dbQueryMock, getPool: jest.fn() } },
                { provide: AlegraService, useValue: alegraMock },
                { provide: WompiService, useValue: wompiMock },
                { provide: MailService, useValue: mailMock },
            ],
        }).compile();

        service = module.get<BillingService>(BillingService);
    });

    describe('confirmPayment', () => {
        it('should confirm payment and extend subscription', async () => {
            const tx = {
                id: 'tx-1',
                subscription_id: 'sub-1',
                club_id: 'club-1',
                status: 'pending',
                plan_amount_cents: 10000,
                overage_amount_cents: 0,
            };
            const sub = { id: 'sub-1', current_period_end: new Date('2026-01-01'), billing_cycle: 'monthly', plan_id: 'plan-1' };
            const client = {
                query: jest.fn(),
                release: jest.fn(),
            };
            client.query
                .mockResolvedValueOnce({ rows: [] }) // BEGIN
                .mockResolvedValueOnce({ rows: [{ id: 'tx-1' }] }) // UPDATE tx (idempotente, ganó)
                .mockResolvedValueOnce({ rows: [sub] }) // SELECT sub
                .mockResolvedValueOnce({ rows: [] }) // UPDATE sub
                .mockResolvedValueOnce({ rows: [] }); // COMMIT

            dbQueryMock
                .mockResolvedValueOnce({ rows: [tx] }) // find tx
                .mockResolvedValueOnce({ rows: [{ name: 'Basic' }] }); // plan name

            const poolMock = { connect: jest.fn().mockResolvedValue(client) };
            const dbService = (service as any).db;
            dbService.getPool = jest.fn().mockReturnValue(poolMock);

            await service.confirmPayment('wompi-tx-1', 'ref-1');

            expect(client.query).toHaveBeenCalledWith('BEGIN');
            expect(client.query).toHaveBeenCalledWith('COMMIT');
            expect(alegraMock.generateInvoice).toHaveBeenCalled();
        });

        it('should be idempotent: second webhook does not extend again', async () => {
            const tx = {
                id: 'tx-1',
                subscription_id: 'sub-1',
                club_id: 'club-1',
                status: 'approved',
                plan_amount_cents: 10000,
                overage_amount_cents: 0,
            };
            const client = {
                query: jest.fn(),
                release: jest.fn(),
            };
            client.query
                .mockResolvedValueOnce({ rows: [] }) // BEGIN
                .mockResolvedValueOnce({ rows: [] }); // UPDATE tx: 0 filas (ya aprobada)

            dbQueryMock.mockResolvedValueOnce({ rows: [tx] }); // find tx

            const poolMock = { connect: jest.fn().mockResolvedValue(client) };
            (service as any).db.getPool = jest.fn().mockReturnValue(poolMock);

            await service.confirmPayment('wompi-tx-1', 'ref-1');

            expect(client.query).toHaveBeenCalledWith('ROLLBACK');
            expect(alegraMock.generateInvoice).not.toHaveBeenCalled();
        });

        it('should return early if transaction not found', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            await service.confirmPayment('wompi-tx-1', 'ref-1');
            expect(alegraMock.generateInvoice).not.toHaveBeenCalled();
        });
    });

    describe('markPaymentFailed', () => {
        it('should mark payment as failed and increment retry', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ subscription_id: 'sub-1' }] })
                .mockResolvedValueOnce({ rows: [{ retry_count: 1, status: 'active' }] });

            await service.markPaymentFailed('wompi-tx-1', 'ref-1', 'Card declined');
            expect(dbQueryMock).toHaveBeenCalledTimes(2);
        });

        it('should suspend subscription after 3 retries', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ subscription_id: 'sub-1', club_id: 'club-1' }] })
                .mockResolvedValueOnce({ rows: [{ retry_count: 3, status: 'active' }] })
                .mockResolvedValueOnce({ rows: [] });
            // notifySuspension: sin admin → no email

            await service.markPaymentFailed('wompi-tx-1', 'ref-1');
            expect(dbQueryMock).toHaveBeenCalledTimes(4);
        });

        it('should notify admin by email when subscription is suspended', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ subscription_id: 'sub-1', club_id: 'club-1' }] })
                .mockResolvedValueOnce({ rows: [{ retry_count: 3, status: 'active' }] })
                .mockResolvedValueOnce({ rows: [] }) // UPDATE suspend
                .mockResolvedValueOnce({ rows: [{ club_name: 'Iron Bikers', email: 'admin@club.co' }] }); // SELECT admin

            await service.markPaymentFailed('wompi-tx-1', 'ref-1');

            expect(mailMock.sendSubscriptionSuspended).toHaveBeenCalledWith({
                email: 'admin@club.co',
                clubName: 'Iron Bikers',
            });
        });

        it('should return early if transaction not found', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            await service.markPaymentFailed('wompi-tx-1', 'ref-1');
            expect(dbQueryMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('handleVoidedTransaction', () => {
        it('should void the transaction', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            await service.handleVoidedTransaction('wompi-tx-1', 'ref-1');
            expect(dbQueryMock).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE payment_transactions'),
                ['wompi-tx-1', 'ref-1'],
            );
        });
    });

    describe('calculateMonthlyUsage', () => {
        it('should return cached usage if exists', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [{ member_count: 5, event_count: 2, overage_members: 0 }] });
            const result = await service.calculateMonthlyUsage('club-1', new Date('2026-01-01'));
            expect(result.member_count).toBe(5);
            expect(dbQueryMock).toHaveBeenCalledTimes(1);
        });

        it('should calculate and cache fresh usage', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [] }) // no cache
                .mockResolvedValueOnce({ rows: [{ count: 10 }] }) // members
                .mockResolvedValueOnce({ rows: [{ count: 3 }] }) // events
                .mockResolvedValueOnce({ rows: [{ max_members: 8 }] }) // plan
                .mockResolvedValueOnce({ rows: [] }); // insert

            const result = await service.calculateMonthlyUsage('club-1', new Date('2026-01-01'));
            expect(result.member_count).toBe(10);
            expect(result.event_count).toBe(3);
            expect(result.overage_members).toBe(2);
        });
    });

    describe('calculateOverageCharge', () => {
        it('should return 0 when no overage', async () => {
            const result = await service.calculateOverageCharge('plan-1', 0);
            expect(result).toBe(0);
        });

        it('should calculate overage charge', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [{ overage_member_cents: 500 }] });
            const result = await service.calculateOverageCharge('plan-1', 3);
            expect(result).toBe(1500);
        });

        it('should return 0 when plan not found', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            const result = await service.calculateOverageCharge('plan-1', 2);
            expect(result).toBe(0);
        });
    });

    describe('attachPaymentSource', () => {
        it('should create source in Wompi and persist on clubs', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [{ billing_contact_email: 'club@example.com' }] });
            dbQueryMock.mockResolvedValueOnce({ rowCount: 1 });

            const result = await service.attachPaymentSource('club-1', {
                type: 'CARD',
                token: 'tok_123',
            } as never);

            expect(result.sourceId).toBe('src_123');
            expect(result.last4).toBe('4242');
            expect(wompiMock.createPaymentSource).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'CARD', token: 'tok_123', customer_email: 'club@example.com', acceptance_token: 'acc_tok' }),
            );
            expect(dbQueryMock).toHaveBeenLastCalledWith(
                expect.stringContaining('UPDATE clubs'),
                expect.arrayContaining(['src_123', 'CARD', 'club@example.com', 'AVAILABLE', '4242', null, 'club-1']),
            );
        });

        it('should use personal data auth token for NEQUI and persist phone', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [{ billing_contact_email: 'club@example.com' }] });
            dbQueryMock.mockResolvedValueOnce({ rowCount: 1 });

            (wompiMock.getNequiTokenStatus as jest.Mock).mockResolvedValue('APPROVED');
            (wompiMock.createPaymentSource as jest.Mock).mockResolvedValue({
                data: { id: 'src_123', type: 'NEQUI', status: 'AVAILABLE', public_data: { phone_number: '3001234567' } },
            });

            await service.attachPaymentSource('club-1', {
                type: 'NEQUI',
                token: 'nequi_tok',
                customerData: { phoneNumber: '3001234567', fullName: 'Carlos', legalId: '123', legalIdType: 'CC' },
            } as never);

            expect(wompiMock.getNequiTokenStatus).toHaveBeenCalledWith('nequi_tok');
            expect(wompiMock.createPaymentSource).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'NEQUI',
                    acceptance_token: 'acc_tok',
                    accept_personal_auth: 'pd_auth_tok',
                    customer_data: { full_name: 'Carlos', phone_number: '3001234567', legal_id: '123', legal_id_type: 'CC' },
                }),
            );
            expect(dbQueryMock).toHaveBeenLastCalledWith(
                expect.stringContaining('UPDATE clubs'),
                expect.arrayContaining(['3001234567', 'club-1']),
            );
        });

        it('should reject NEQUI token that is not APPROVED', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [{ billing_contact_email: 'club@example.com' }] });
            (wompiMock.getNequiTokenStatus as jest.Mock).mockResolvedValue('PENDING');

            await expect(
                service.attachPaymentSource('club-1', {
                    type: 'NEQUI',
                    token: 'nequi_tok',
                    customerData: { phoneNumber: '3001234567', fullName: 'Carlos', legalId: '123', legalIdType: 'CC' },
                } as never),
            ).rejects.toThrow(BadRequestException);
            expect(wompiMock.createPaymentSource).not.toHaveBeenCalled();
        });

        it('should throw when club has no email', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [{ billing_contact_email: null }] });
            await expect(
                service.attachPaymentSource('club-1', { type: 'CARD', token: 'tok_123' } as never),
            ).rejects.toThrow(BadRequestException);
        });

        it('should require customerData for NEQUI', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [{ billing_contact_email: 'club@example.com' }] });
            await expect(
                service.attachPaymentSource('club-1', { type: 'NEQUI', token: 'tok_123' } as never),
            ).rejects.toThrow(BadRequestException);
        });

        it('should require phoneNumber for NEQUI', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [{ billing_contact_email: 'club@example.com' }] });
            await expect(
                service.attachPaymentSource('club-1', {
                    type: 'NEQUI',
                    token: 'tok_123',
                    customerData: { fullName: 'Carlos', legalId: '123', legalIdType: 'CC' },
                } as never),
            ).rejects.toThrow(BadRequestException);
        });

        it('should reject PSE as it cannot be used for recurring charges', async () => {
            await expect(
                service.attachPaymentSource('club-1', { type: 'PSE', token: 'tok_123' } as never),
            ).rejects.toThrow(BadRequestException);
        });

        it('should throw NotFound when club row missing', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            await expect(
                service.attachPaymentSource('club-1', { type: 'CARD', token: 'tok_123' } as never),
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe('clearPaymentSource', () => {
        it('should null wompi fields on clubs', async () => {
            await service.clearPaymentSource('club-1');
            expect(dbQueryMock).toHaveBeenCalledWith(
                expect.stringContaining('SET wompi_payment_source_id = NULL'),
                ['club-1'],
            );
        });
    });

    describe('cancelSubscription', () => {
        it('should set cancel_at_period_end with reason', async () => {
            dbQueryMock.mockResolvedValueOnce({ rowCount: 1 });
            await service.cancelSubscription('club-1', 'costo');
            expect(dbQueryMock).toHaveBeenCalledWith(
                expect.stringContaining('cancel_at_period_end = TRUE'),
                ['costo', 'club-1'],
            );
        });

        it('should throw NotFound when subscription missing', async () => {
            dbQueryMock.mockResolvedValueOnce({ rowCount: 0 });
            await expect(service.cancelSubscription('club-1')).rejects.toThrow(NotFoundException);
        });
    });

    describe('changeSubscription', () => {
        const clubRow = { wompi_payment_source_id: 'src_1', wompi_payment_method_type: 'CARD', wompi_customer_email: 'club@example.com', wompi_payment_phone: null, wompi_payment_source_status: 'AVAILABLE' };

        it('should reject when nothing to change', async () => {
            await expect(service.changeSubscription('club-1')).rejects.toThrow(BadRequestException);
        });

        it('should reject yearly to monthly', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [clubRow] })
                .mockResolvedValueOnce({ rows: [{ id: 'sub-1', plan_id: 'empresarial', billing_cycle: 'yearly', current_period_start: new Date('2026-01-01'), current_period_end: new Date('2027-01-01'), pending_plan_id: null }] });

            await expect(service.changeSubscription('club-1', undefined, 'monthly')).rejects.toThrow(BadRequestException);
        });

        it('should charge prorated difference for upgrade and switch plan', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [clubRow] }) // club
                .mockResolvedValueOnce({ rows: [{ id: 'sub-1', plan_id: 'basico', billing_cycle: 'monthly', current_period_start: new Date('2026-08-01'), current_period_end: new Date('2026-09-01'), pending_plan_id: null }] }) // sub
                .mockResolvedValueOnce({ rows: [{ id: 'pro', is_active: true, price_monthly_cents: 24990000, price_yearly_cents: 249900000 }] }) // nuevo plan
                .mockResolvedValueOnce({ rows: [{ price_monthly_cents: 14990000, price_yearly_cents: 149900000 }] }) // precio actual (basico)
                .mockResolvedValueOnce({ rows: [] }) // insert tx
                .mockResolvedValueOnce({ rows: [] }); // update sub

            const result = await service.changeSubscription('club-1', 'pro', undefined);

            expect(result.type).toBe('upgrade');
            // 15/31 de los días restantes (2026-08-06) × 10.000.000 cents de diferencia
            expect(result.amountCents).toBeGreaterThan(0);
            expect(result.amountCents).toBeLessThan(10000000);
            expect(wompiMock.createTransaction).toHaveBeenCalledWith(
                expect.objectContaining({ amount_in_cents: result.amountCents, payment_source_id: 'src_1' }),
            );
            expect(dbQueryMock).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE club_subscriptions'),
                ['sub-1', 'pro', 'monthly'],
            );
        });

        it('should defer downgrade with pending_plan_id without charging', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [clubRow] }) // club
                .mockResolvedValueOnce({ rows: [{ id: 'sub-1', plan_id: 'pro', billing_cycle: 'monthly', current_period_start: new Date('2026-08-01'), current_period_end: new Date('2026-09-01'), pending_plan_id: null }] }) // sub
                .mockResolvedValueOnce({ rows: [{ id: 'basico', is_active: true, price_monthly_cents: 14990000, price_yearly_cents: 149900000 }] }) // nuevo plan
                .mockResolvedValueOnce({ rows: [{ price_monthly_cents: 24990000, price_yearly_cents: 249900000 }] }) // precio actual (pro)
                .mockResolvedValueOnce({ rows: [] }); // update pending

            const result = await service.changeSubscription('club-1', 'basico', undefined);

            expect(result.type).toBe('downgrade');
            expect(result.amountCents).toBe(0);
            expect(result.pendingPlanId).toBe('basico');
            expect(wompiMock.createTransaction).not.toHaveBeenCalled();
            expect(dbQueryMock).toHaveBeenCalledWith(
                expect.stringContaining('pending_plan_id = $2'),
                ['sub-1', 'basico'],
            );
        });

        it('should charge yearly minus credit when switching to yearly', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [clubRow] }) // club
                .mockResolvedValueOnce({ rows: [{ id: 'sub-1', plan_id: 'esencial', billing_cycle: 'monthly', current_period_start: new Date('2026-08-01'), current_period_end: new Date('2026-09-01'), pending_plan_id: null }] }) // sub
                .mockResolvedValueOnce({ rows: [{ id: 'esencial', is_active: true, price_monthly_cents: 7990000, price_yearly_cents: 79900000 }] }) // mismo plan
                .mockResolvedValueOnce({ rows: [{ price_monthly_cents: 7990000, price_yearly_cents: 79900000 }] }) // precio actual
                .mockResolvedValueOnce({ rows: [] }) // insert tx
                .mockResolvedValueOnce({ rows: [] }); // update sub

            const result = await service.changeSubscription('club-1', undefined, 'yearly');

            expect(result.type).toBe('cycle');
            expect(result.amountCents).toBeGreaterThan(0);
            expect(result.amountCents).toBeLessThan(79900000);
            expect(dbQueryMock).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE club_subscriptions'),
                ['sub-1', 'esencial', 'yearly'],
            );
        });

        it('should return none when nothing actually changes', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [clubRow] })
                .mockResolvedValueOnce({ rows: [{ id: 'sub-1', plan_id: 'pro', billing_cycle: 'monthly', current_period_start: new Date('2026-08-01'), current_period_end: new Date('2026-09-01'), pending_plan_id: null }] });

            const result = await service.changeSubscription('club-1', 'pro', 'monthly');
            expect(result.type).toBe('none');
            expect(wompiMock.createTransaction).not.toHaveBeenCalled();
        });
    });

    describe('createSubscription', () => {
        it('should create pending transaction and switch plan/cycle', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ wompi_payment_source_id: 'src_1', wompi_payment_method_type: 'CARD', wompi_customer_email: 'club@example.com', wompi_payment_phone: null, wompi_payment_source_status: 'AVAILABLE' }] }) // club
                .mockResolvedValueOnce({ rows: [{ id: 'pro', name: 'Pro', is_active: true, price_monthly_cents: 24990000, price_yearly_cents: 249900000 }] }) // plan
                .mockResolvedValueOnce({ rows: [{ id: 'sub-1', current_period_end: new Date('2026-08-01'), billing_cycle: 'monthly', plan_id: 'prueba' }] }) // sub
                .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // pending check
                .mockResolvedValueOnce({ rows: [{ member_count: 0, event_count: 0, overage_members: 0 }] }) // usage
                .mockResolvedValueOnce({ rows: [{ overage_member_cents: 150000 }] }) // overage plan
                .mockResolvedValueOnce({ rows: [] }) // insert tx
                .mockResolvedValueOnce({ rows: [] }); // update sub

            const result = await service.createSubscription('club-1', 'pro', 'yearly');

            expect(result.status).toBe('pending');
            expect(wompiMock.createTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    amount_in_cents: 249900000,
                    payment_source_id: 'src_1',
                    payment_method: { type: 'CARD', installments: 1 },
                }),
            );
            expect(dbQueryMock).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE club_subscriptions'),
                ['sub-1', 'pro', 'yearly'],
            );
        });

        it('should charge NEQUI with phone_number', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ wompi_payment_source_id: 'src_1', wompi_payment_method_type: 'NEQUI', wompi_customer_email: 'club@example.com', wompi_payment_phone: '3001234567', wompi_payment_source_status: 'AVAILABLE' }] }) // club
                .mockResolvedValueOnce({ rows: [{ id: 'esencial', name: 'Esencial', is_active: true, price_monthly_cents: 7990000, price_yearly_cents: 79900000 }] }) // plan
                .mockResolvedValueOnce({ rows: [{ id: 'sub-1', current_period_end: new Date('2026-08-01'), billing_cycle: 'monthly', plan_id: 'prueba' }] }) // sub
                .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // pending check
                .mockResolvedValueOnce({ rows: [{ member_count: 0, event_count: 0, overage_members: 0 }] }) // usage
                .mockResolvedValueOnce({ rows: [{ overage_member_cents: 250000 }] }) // overage plan
                .mockResolvedValueOnce({ rows: [] }); // insert tx

            await service.createSubscription('club-1', 'esencial', 'monthly');

            expect(wompiMock.createTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    payment_source_id: 'src_1',
                    payment_method: { type: 'NEQUI', phone_number: '3001234567' },
                }),
            );
        });

        it('should reject when no payment source', async () => {
            dbQueryMock.mockResolvedValueOnce({
                rows: [{ wompi_payment_source_id: null, wompi_payment_method_type: null, wompi_customer_email: null, wompi_payment_phone: null, wompi_payment_source_status: null }],
            });
            await expect(service.createSubscription('club-1', 'pro', 'monthly')).rejects.toThrow(ConflictException);
        });

        it('should reject when payment source is not available', async () => {
            dbQueryMock.mockResolvedValueOnce({
                rows: [{ wompi_payment_source_id: 'src_1', wompi_payment_method_type: 'NEQUI', wompi_customer_email: 'club@example.com', wompi_payment_phone: '3001234567', wompi_payment_source_status: 'PENDING' }],
            });
            await expect(service.createSubscription('club-1', 'pro', 'monthly')).rejects.toThrow(ConflictException);
        });

        it('should reject when plan not found', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ wompi_payment_source_id: 'src_1', wompi_payment_method_type: 'CARD', wompi_customer_email: 'club@example.com', wompi_payment_phone: null, wompi_payment_source_status: 'AVAILABLE' }] })
                .mockResolvedValueOnce({ rows: [] });
            await expect(service.createSubscription('club-1', 'pro', 'monthly')).rejects.toThrow(NotFoundException);
        });

        it('should reject when a pending transaction already exists', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ wompi_payment_source_id: 'src_1', wompi_payment_method_type: 'CARD', wompi_customer_email: 'club@example.com', wompi_payment_phone: null, wompi_payment_source_status: 'AVAILABLE' }] })
                .mockResolvedValueOnce({ rows: [{ id: 'pro', name: 'Pro', is_active: true, price_monthly_cents: 24990000, price_yearly_cents: 249900000 }] })
                .mockResolvedValueOnce({ rows: [{ id: 'sub-1', current_period_end: new Date('2026-08-01'), billing_cycle: 'monthly', plan_id: 'prueba' }] })
                .mockResolvedValueOnce({ rows: [{ count: 1 }] });
            await expect(service.createSubscription('club-1', 'pro', 'monthly')).rejects.toThrow(ConflictException);
        });

        it('should auto-confirm in dry-run mode', async () => {
            wompiMock = { ...wompiMock, dryRun: true } as jest.Mocked<Partial<WompiService>>;
            (service as any).wompiService = wompiMock;

            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ wompi_payment_source_id: 'src_1', wompi_payment_method_type: 'CARD', wompi_customer_email: 'club@example.com', wompi_payment_phone: null, wompi_payment_source_status: 'AVAILABLE' }] })
                .mockResolvedValueOnce({ rows: [{ id: 'pro', name: 'Pro', is_active: true, price_monthly_cents: 24990000, price_yearly_cents: 249900000 }] })
                .mockResolvedValueOnce({ rows: [{ id: 'sub-1', current_period_end: new Date('2026-08-01'), billing_cycle: 'monthly', plan_id: 'prueba' }] })
                .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // pending check
                .mockResolvedValueOnce({ rows: [{ member_count: 0, event_count: 0, overage_members: 0 }] }) // usage
                .mockResolvedValueOnce({ rows: [{ overage_member_cents: 150000 }] }) // overage plan
                .mockResolvedValueOnce({ rows: [] }) // insert tx
                .mockResolvedValueOnce({ rows: [] }); // update sub
            // confirmPayment interno (dry-run)
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ id: 'tx-1', subscription_id: 'sub-1', club_id: 'club-1', status: 'pending', plan_amount_cents: 10000, overage_amount_cents: 0 }] }) // find tx
                .mockResolvedValueOnce({ rows: [{ name: 'Pro' }] }); // plan name

            const poolMock = {
                connect: jest.fn().mockResolvedValue({
                    query: jest.fn()
                        .mockResolvedValueOnce({ rows: [] }) // BEGIN
                        .mockResolvedValueOnce({ rows: [{ id: 'tx-1' }] }) // UPDATE tx (returning)
                        .mockResolvedValueOnce({ rows: [{ id: 'sub-1', current_period_end: new Date('2026-08-01'), billing_cycle: 'yearly', plan_id: 'pro' }] }) // SELECT sub
                        .mockResolvedValueOnce({ rows: [] }) // UPDATE sub
                        .mockResolvedValueOnce({ rows: [] }), // COMMIT
                    release: jest.fn(),
                }),
            };
            (service as any).db.getPool = jest.fn().mockReturnValue(poolMock);

            const result = await service.createSubscription('club-1', 'pro', 'monthly');

            expect(result.status).toBe('approved');
            expect(result.dryRun).toBe(true);
        });
    });
});
