import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SelfOrAdminGuard } from '../auth/guards/self-or-admin.guard';
import { DatabaseService } from '../database/database.service';
import { UserRole } from './users.types';

describe('UsersController', () => {
    let controller: UsersController;
    let usersService: jest.Mocked<UsersService>;

    const mockReq = { user: { id: 'u1', email: 'a@b.com', role: UserRole.admin } };

    beforeEach(async () => {
        usersService = {
            createUser: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            updateUser: jest.fn(),
            getMedicalInfo: jest.fn(),
            remove: jest.fn(),
            findByEmail: jest.fn(),
            getUserClubs: jest.fn(),
        } as unknown as jest.Mocked<UsersService>;

        const module: TestingModule = await Test.createTestingModule({
            controllers: [UsersController],
            providers: [
                { provide: UsersService, useValue: usersService },
                SelfOrAdminGuard,
                { provide: DatabaseService, useValue: { query: jest.fn() } },
            ],
        }).compile();

        controller = module.get<UsersController>(UsersController);
    });

    describe('create', () => {
        it('should create a user passing the actor', async () => {
            const dto = { name: 'Test', email: 't@test.com', password: 'pass' };
            usersService.createUser.mockResolvedValue({ id: 'u1', ...dto } as never);
            const result = await controller.create(dto as never, mockReq as never);
            expect(result.id).toBe('u1');
            expect(usersService.createUser).toHaveBeenCalledWith(dto, mockReq.user);
        });
    });

    describe('findAll', () => {
        it('should return users filtered by club', async () => {
            usersService.findAll.mockResolvedValue({ data: [{ id: 'u1', name: 'A' }], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } } as never);
            const result = await controller.findAll('club-1');
            expect(result.data).toHaveLength(1);
            expect(usersService.findAll).toHaveBeenCalledWith('club-1', undefined, undefined);
        });
    });

    describe('findOne', () => {
        it('should return a user by id', async () => {
            usersService.findOne.mockResolvedValue({ id: 'u1', name: 'A' } as never);
            const result = await controller.findOne('u1');
            expect(result.id).toBe('u1');
        });
    });

    describe('update', () => {
        it('should update a user passing the actor', async () => {
            usersService.updateUser.mockResolvedValue({ id: 'u1', name: 'Updated' } as never);
            const result = await controller.update('u1', { name: 'Updated' } as never, mockReq as never);
            expect(result.name).toBe('Updated');
            expect(usersService.updateUser).toHaveBeenCalledWith('u1', { name: 'Updated' }, mockReq.user);
        });
    });

    describe('getMedicalInfo', () => {
        it('should return medical info', async () => {
            usersService.getMedicalInfo.mockResolvedValue({ id: 'u1', medicalNotes: 'none' } as never);
            const result = await controller.getMedicalInfo('u1');
            expect(result.id).toBe('u1');
        });
    });

    describe('remove', () => {
        it('should remove a user passing the actor', async () => {
            usersService.remove.mockResolvedValue({ id: 'u1' } as never);
            const result = await controller.remove('u1', mockReq as never);
            expect(result.id).toBe('u1');
            expect(usersService.remove).toHaveBeenCalledWith('u1', mockReq.user);
        });
    });
});
