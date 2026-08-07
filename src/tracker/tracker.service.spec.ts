import { Test, TestingModule } from '@nestjs/testing';
import { TrackerService } from './tracker.service';
import { DatabaseService } from '../database/database.service';
import { NotFoundException, ForbiddenException, UnauthorizedException, BadRequestException } from '@nestjs/common';

describe('TrackerService', () => {
    let service: TrackerService;
    let dbQueryMock: jest.Mock;
    let redisMock: { set: jest.Mock };

    beforeEach(async () => {
        dbQueryMock = jest.fn().mockResolvedValue({ rows: [] });
        redisMock = { set: jest.fn().mockResolvedValue('OK') };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TrackerService,
                { provide: DatabaseService, useValue: { query: dbQueryMock } },
                { provide: 'REDIS_CLIENT', useValue: redisMock },
            ],
        }).compile();

        service = module.get<TrackerService>(TrackerService);
    });

    const baseUser = { id: 'user-1', role: 'rider', sub: 'user-1' } as const;

    describe('savePosition', () => {
        it('should throw NotFound when event does not exist', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] }); // eventos
            await expect(service.savePosition(baseUser as never, {
                eventId: '11111111-1111-4111-8111-111111111111', lat: 10, lng: -74,
            } as never)).rejects.toThrow(NotFoundException);
        });

        it('should throw Forbidden when event is not en_curso', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [{ id: 'e1', status: 'proximo', club_id: 'c1' }] });
            await expect(service.savePosition(baseUser as never, {
                eventId: 'e1', lat: 10, lng: -74,
            } as never)).rejects.toThrow(ForbiddenException);
        });

        it('should reject out-of-range coordinates (ROD-08)', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [{ id: 'e1', status: 'en_curso', club_id: 'c1' }] });
            await expect(service.savePosition(baseUser as never, {
                eventId: 'e1', lat: 95, lng: -74,
            } as never)).rejects.toThrow(BadRequestException);
            dbQueryMock.mockResolvedValueOnce({ rows: [{ id: 'e1', status: 'en_curso', club_id: 'c1' }] });
            await expect(service.savePosition(baseUser as never, {
                eventId: 'e1', lat: 10, lng: -181,
            } as never)).rejects.toThrow(BadRequestException);
        });

        it('should save position with battery in Redis (ROD-17)', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ id: 'e1', status: 'en_curso', club_id: 'c1' }] })
                .mockResolvedValueOnce({ rows: [{ ride_role: 'puntero' }] });

            await service.savePosition(baseUser as never, {
                eventId: 'e1', lat: 10.5, lng: -74.5, speed: 30, heading: 90,
                timestamp: 1234, name: 'Juan', battery: 67, is_charging: true,
            } as never);

            const [key, value] = redisMock.set.mock.calls[0];
            expect(key).toBe('track:e1:user-1');
            const parsed = JSON.parse(value);
            expect(parsed).toMatchObject({
                lat: 10.5, lng: -74.5, speed: 30, battery: 67, isCharging: true,
                role: 'puntero', userId: 'user-1', name: 'Juan',
            });
        });

        it('should reject unauthorized user (not attendee nor manager)', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ id: 'e1', status: 'en_curso', club_id: 'c1' }] })
                .mockResolvedValueOnce({ rows: [] }); // sin attendee
            await expect(service.savePosition(baseUser as never, {
                eventId: 'e1', lat: 10, lng: -74,
            } as never)).rejects.toThrow(UnauthorizedException);
        });
    });
});
