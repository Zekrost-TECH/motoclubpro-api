import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

describe('ReportsController', () => {
    let controller: ReportsController;
    let service: ReportsService;

    const mockReportsService = {
        eventsReport: jest.fn(),
        sosReport: jest.fn(),
        membersReport: jest.fn(),
        financialReport: jest.fn(),
        supportPointsReport: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [ReportsController],
            providers: [{ provide: ReportsService, useValue: mockReportsService }],
        }).compile();

        controller = module.get<ReportsController>(ReportsController);
        service = module.get<ReportsService>(ReportsService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('events', () => {
        it('should return normalized event report', async () => {
            mockReportsService.eventsReport.mockResolvedValue({ total: 10, km: 250, avg_attendees: 8.5 });
            const result = await controller.events('2026-01-01', '2026-01-31', 'club-1');
            expect(service.eventsReport).toHaveBeenCalledWith('club-1', '2026-01-01', '2026-01-31');
            expect(result).toEqual({ total: 10, km: 250, avgAttendees: 8.5 });
        });
    });

    describe('sos', () => {
        it('should return normalized sos report', async () => {
            mockReportsService.sosReport.mockResolvedValue({ total: 5, resolved: 4, avg_resolution_minutes: 12.5 });
            const result = await controller.sos('2026-01-01', '2026-01-31', 'club-1');
            expect(service.sosReport).toHaveBeenCalledWith('club-1', '2026-01-01', '2026-01-31');
            expect(result).toEqual({ total: 5, resolved: 4, avgResolutionTime: 12.5 });
        });
    });

    describe('members', () => {
        it('should return normalized members report', async () => {
            mockReportsService.membersReport.mockResolvedValue({ total: 30, active_this_month: 3, avg_skill: 2.5 });
            const result = await controller.members('club-1');
            expect(service.membersReport).toHaveBeenCalledWith('club-1');
            expect(result).toEqual({ total: 30, activeThisMonth: 3, avgSkill: 2.5 });
        });
    });

    describe('financial', () => {
        it('should return normalized financial report', async () => {
            mockReportsService.financialReport.mockResolvedValue({
                total_paid: 150000,
                total_pending: 50000,
                total_failed: 10000,
                transactions_count: 3,
            });
            const result = await controller.financial('2026-01-01', '2026-01-31', 'club-1');
            expect(service.financialReport).toHaveBeenCalledWith('club-1', '2026-01-01', '2026-01-31');
            expect(result).toEqual({ totalPaid: 150000, totalPending: 50000, totalFailed: 10000, transactionsCount: 3 });
        });
    });

    describe('supportPoints', () => {
        it('should return normalized support points report', async () => {
            mockReportsService.supportPointsReport.mockResolvedValue({ total: 8, verified: 6, pending: 2, avg_rating: 4.2 });
            const result = await controller.supportPoints('club-1');
            expect(service.supportPointsReport).toHaveBeenCalledWith('club-1');
            expect(result).toEqual({ total: 8, verified: 6, pending: 2, avgRating: 4.2 });
        });
    });
});
