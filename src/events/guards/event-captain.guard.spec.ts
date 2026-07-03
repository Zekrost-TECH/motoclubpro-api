import { Test, TestingModule } from '@nestjs/testing';
import { EventCaptainGuard } from './event-captain.guard';
import { DatabaseService } from '../../database/database.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../../users/users.types';

describe('EventCaptainGuard', () => {
    let guard: EventCaptainGuard;
    let db: { query: jest.Mock };

    function createContext(user: unknown, eventId: string): unknown {
        return {
            switchToHttp: () => ({
                getRequest: () => ({ user, params: { id: eventId } }),
            }),
        };
    }

    beforeEach(async () => {
        db = { query: jest.fn() };
        const module: TestingModule = await Test.createTestingModule({
            providers: [EventCaptainGuard, { provide: DatabaseService, useValue: db }],
        }).compile();
        guard = module.get<EventCaptainGuard>(EventCaptainGuard);
    });

    it('should deny when user is missing', async () => {
        const context = createContext(null, 'e1') as never;
        await expect(guard.canActivate(context)).resolves.toBe(false);
    });

    it('should allow admin bypass', async () => {
        const context = createContext({ id: 'u1', role: UserRole.admin }, 'e1') as never;
        await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('should deny when eventId is missing', async () => {
        const context = createContext({ id: 'u1', role: UserRole.rider }, '') as never;
        await expect(guard.canActivate(context)).resolves.toBe(false);
    });

    it('should throw NotFoundException when event does not exist', async () => {
        db.query.mockResolvedValue({ rows: [] });
        const context = createContext({ id: 'u1', role: UserRole.rider }, 'e1') as never;
        await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
    });

    it('should allow when user is the event organizer', async () => {
        db.query.mockResolvedValue({ rows: [{ organizer_id: 'u1' }] });
        const context = createContext({ id: 'u1', role: UserRole.rider }, 'e1') as never;
        await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('should deny when user is not the event organizer', async () => {
        db.query.mockResolvedValue({ rows: [{ organizer_id: 'u2' }] });
        const context = createContext({ id: 'u1', role: UserRole.rider }, 'e1') as never;
        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
});
