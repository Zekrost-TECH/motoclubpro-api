import { Test, TestingModule } from '@nestjs/testing';
import { OwnerGuard } from './owner.guard';
import { DatabaseService } from '../../database/database.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../../users/users.types';

describe('OwnerGuard', () => {
    let guard: OwnerGuard;
    let db: { query: jest.Mock };

    function createContext(user: unknown, motorcycleId: string): unknown {
        return {
            switchToHttp: () => ({
                getRequest: () => ({ user, params: { id: motorcycleId } }),
            }),
        };
    }

    beforeEach(async () => {
        db = { query: jest.fn() };
        const module: TestingModule = await Test.createTestingModule({
            providers: [OwnerGuard, { provide: DatabaseService, useValue: db }],
        }).compile();
        guard = module.get<OwnerGuard>(OwnerGuard);
    });

    it('should throw ForbiddenException when user is missing', async () => {
        const context = createContext(null, 'm1') as never;
        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin bypass', async () => {
        const context = createContext({ id: 'u1', role: UserRole.admin }, 'm1') as never;
        await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('should throw ForbiddenException when motorcycleId is missing', async () => {
        const context = createContext({ id: 'u1', role: UserRole.rider }, '') as never;
        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when motorcycle does not exist', async () => {
        db.query.mockResolvedValue({ rows: [] });
        const context = createContext({ id: 'u1', role: UserRole.rider }, 'm1') as never;
        await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
    });

    it('should allow when user is the owner', async () => {
        db.query.mockResolvedValue({ rows: [{ user_id: 'u1' }] });
        const context = createContext({ id: 'u1', role: UserRole.rider }, 'm1') as never;
        await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('should deny when user is not the owner', async () => {
        db.query.mockResolvedValue({ rows: [{ user_id: 'u2' }] });
        const context = createContext({ id: 'u1', role: UserRole.rider }, 'm1') as never;
        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
});
