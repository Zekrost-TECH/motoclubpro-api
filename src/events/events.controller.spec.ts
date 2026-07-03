import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService, type EventRow, type AttendeeRow, type InventoryRow } from './events.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubGuard } from '../auth/guards/club.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { EventCaptainGuard } from './guards/event-captain.guard';

describe('EventsController', () => {
    let controller: EventsController;
    let serviceMock: jest.Mocked<Partial<EventsService>>;

    const mockEvent: EventRow & { attendees: AttendeeRow[]; inventory: InventoryRow[] } = {
        id: 'event-1',
        status: 'proximo',
        title: 'Test Event',
        description: 'Desc',
        date: '2026-01-01',
        time: '10:00',
        difficulty: 'suave',
        route_id: 'route-1',
        max_attendees: 10,
        min_rider_level: 'novato',
        meeting_point: 'Point A',
        organizer_id: 'user-1',
        club_id: 'club-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        attendees: [],
        inventory: [],
    };

    beforeEach(async () => {
        serviceMock = {
            findAll: jest.fn().mockResolvedValue({ data: [mockEvent], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } }),
            findOne: jest.fn().mockResolvedValue(mockEvent),
            create: jest.fn().mockResolvedValue(mockEvent),
            update: jest.fn().mockResolvedValue(mockEvent),
            updateStatus: jest.fn().mockResolvedValue(mockEvent),
            remove: jest.fn().mockResolvedValue({ deleted: true }),
            rsvp: jest.fn().mockResolvedValue({ success: true, message: 'RSVP confirmed' }),
            cancelRsvp: jest.fn().mockResolvedValue({ deleted: true }),
            getAttendees: jest.fn().mockResolvedValue([{ user_id: 'u1', name: 'Alice', ride_role: 'rider', confirmed_at: 'now', checklist_completed: false, nickname: '', rider_level: 'novato' }]),
            updateAttendeeRole: jest.fn().mockResolvedValue({ user_id: 'u1', ride_role: 'puntero', confirmed_at: 'now', checklist_completed: false, name: 'Alice', nickname: '', rider_level: 'novato' }),
            getChecklist: jest.fn().mockResolvedValue([{ id: 'c1', event_id: 'event-1', required: true, sort_order: 1 }]),
            respondChecklist: jest.fn().mockResolvedValue({ success: true, checklist_completed: true }),
            getChecklistStatus: jest.fn().mockResolvedValue([{ userId: 'u1', name: 'Alice', checklist_completed: true }]),
            getInventory: jest.fn().mockResolvedValue([{ id: 'i1', event_id: 'event-1', name: 'Kit', category: 'seguridad', quantity: 1 }]),
            addInventoryItem: jest.fn().mockResolvedValue({ id: 'i1', event_id: 'event-1', name: 'Kit', category: 'seguridad', quantity: 1 }),
            claimInventoryItem: jest.fn().mockResolvedValue({ id: 'i1', event_id: 'event-1', name: 'Kit', category: 'seguridad', quantity: 1, assigned_to: 'user-1' }),
            releaseInventoryItem: jest.fn().mockResolvedValue({ released: true, item: { id: 'i1', event_id: 'event-1', name: 'Kit', category: 'seguridad', quantity: 1 } }),
            removeInventoryItem: jest.fn().mockResolvedValue({ deleted: true }),
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [EventsController],
            providers: [{ provide: EventsService, useValue: serviceMock }],
        })
            .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
            .overrideGuard(ClubGuard).useValue({ canActivate: () => true })
            .overrideGuard(ClubRolesGuard).useValue({ canActivate: () => true })
            .overrideGuard(EventCaptainGuard).useValue({ canActivate: () => true })
            .compile();

        controller = module.get<EventsController>(EventsController);
    });

    describe('findAll', () => {
        it('should return paginated events', async () => {
            const result = await controller.findAll('proximo', 'true', 'club-1', { page: 1, limit: 10 });
            expect(result.data).toHaveLength(1);
            expect(serviceMock.findAll).toHaveBeenCalledWith('proximo', true, 'club-1', 1, 10);
        });
    });

    describe('findOne', () => {
        it('should return a single event', async () => {
            const result = await controller.findOne('event-1', 'club-1');
            expect(result.id).toBe('event-1');
            expect(serviceMock.findOne).toHaveBeenCalledWith('event-1', 'club-1');
        });
    });

    describe('create', () => {
        it('should create an event', async () => {
            const dto = { title: 'New', date: '2026-01-01', time: '10:00', difficulty: 'suave' as const };
            const req = { user: { id: 'user-1', role: 'admin' } } as any;
            const result = await controller.create(dto, req, 'club-1');
            expect(result.id).toBe('event-1');
            expect(serviceMock.create).toHaveBeenCalledWith(dto, 'user-1', 'club-1', 'admin');
        });
    });

    describe('update', () => {
        it('should update an event', async () => {
            const dto = { title: 'Updated' };
            const result = await controller.update('event-1', dto, 'club-1');
            expect(result.id).toBe('event-1');
            expect(serviceMock.update).toHaveBeenCalledWith('event-1', dto, 'club-1');
        });
    });

    describe('updateStatus', () => {
        it('should update event status', async () => {
            const dto = { status: 'en_curso' as const };
            const result = await controller.updateStatus('event-1', dto as any, 'club-1');
            expect(result.id).toBe('event-1');
            expect(serviceMock.updateStatus).toHaveBeenCalledWith('event-1', 'en_curso', 'club-1');
        });
    });

    describe('remove', () => {
        it('should remove an event', async () => {
            const result = await controller.remove('event-1', 'club-1');
            expect(result.deleted).toBe(true);
            expect(serviceMock.remove).toHaveBeenCalledWith('event-1', 'club-1');
        });
    });

    describe('rsvp', () => {
        it('should RSVP to event', async () => {
            const req = { user: { id: 'user-1', role: 'rider' } } as any;
            const result = await controller.rsvp('event-1', req, 'rider', 'club-1');
            expect(result.success).toBe(true);
            expect(serviceMock.rsvp).toHaveBeenCalledWith('event-1', req.user, 'rider', 'club-1');
        });
    });

    describe('cancelRsvp', () => {
        it('should cancel RSVP', async () => {
            const req = { user: { id: 'user-1' } } as any;
            const result = await controller.cancelRsvp('event-1', req, 'club-1');
            expect(result.deleted).toBe(true);
            expect(serviceMock.cancelRsvp).toHaveBeenCalledWith('event-1', 'user-1', 'club-1');
        });
    });

    describe('getAttendees', () => {
        it('should return attendees', async () => {
            const result = await controller.getAttendees('event-1', 'club-1');
            expect(result).toHaveLength(1);
            expect(serviceMock.getAttendees).toHaveBeenCalledWith('event-1', 'club-1');
        });
    });

    describe('updateAttendeeRole', () => {
        it('should update attendee role', async () => {
            const dto = { ride_role: 'puntero' as any };
            const result = await controller.updateAttendeeRole('event-1', 'u1', dto, 'club-1');
            expect(result.ride_role).toBe('puntero');
            expect(serviceMock.updateAttendeeRole).toHaveBeenCalledWith('event-1', 'u1', 'puntero', 'club-1');
        });
    });

    describe('getChecklist', () => {
        it('should return checklist items', async () => {
            const result = await controller.getChecklist('event-1', 'club-1');
            expect(result).toHaveLength(1);
            expect(serviceMock.getChecklist).toHaveBeenCalledWith('event-1', 'club-1');
        });
    });

    describe('respondChecklist', () => {
        it('should respond to checklist', async () => {
            const req = { user: { id: 'user-1' } } as any;
            const responses = [{ itemId: 'c1', checked: true }];
            const result = await controller.respondChecklist('event-1', req, responses, 'club-1');
            expect(result.success).toBe(true);
            expect(serviceMock.respondChecklist).toHaveBeenCalledWith('event-1', 'user-1', responses, 'club-1');
        });
    });

    describe('getChecklistStatus', () => {
        it('should return checklist status', async () => {
            const result = await controller.getChecklistStatus('event-1', 'club-1');
            expect(result[0].checklist_completed).toBe(true);
            expect(serviceMock.getChecklistStatus).toHaveBeenCalledWith('event-1', 'club-1');
        });
    });

    describe('getInventory', () => {
        it('should return inventory', async () => {
            const result = await controller.getInventory('event-1', 'club-1');
            expect(result).toHaveLength(1);
            expect(serviceMock.getInventory).toHaveBeenCalledWith('event-1', 'club-1');
        });
    });

    describe('addInventoryItem', () => {
        it('should add inventory item', async () => {
            const dto = { name: 'Kit', category: 'seguridad' as any, quantity: 1 };
            const result = await controller.addInventoryItem('event-1', dto, 'club-1');
            expect(result.name).toBe('Kit');
            expect(serviceMock.addInventoryItem).toHaveBeenCalledWith('event-1', dto, 'club-1');
        });
    });

    describe('claimInventoryItem', () => {
        it('should claim an item', async () => {
            const req = { user: { id: 'user-1' } } as any;
            const result = await controller.claimInventoryItem('event-1', 'i1', req, 'club-1');
            expect(result.assigned_to).toBe('user-1');
            expect(serviceMock.claimInventoryItem).toHaveBeenCalledWith('event-1', 'i1', 'user-1', 'club-1');
        });
    });

    describe('releaseInventoryItem', () => {
        it('should release an item', async () => {
            const req = { user: { id: 'user-1' } } as any;
            const result = await controller.releaseInventoryItem('event-1', 'i1', req, 'club-1');
            expect(result.released).toBe(true);
            expect(serviceMock.releaseInventoryItem).toHaveBeenCalledWith('event-1', 'i1', 'user-1', 'club-1');
        });
    });

    describe('removeInventoryItem', () => {
        it('should remove an item', async () => {
            const result = await controller.removeInventoryItem('event-1', 'i1', 'club-1');
            expect(result.deleted).toBe(true);
            expect(serviceMock.removeInventoryItem).toHaveBeenCalledWith('event-1', 'i1', 'club-1');
        });
    });
});
