import { Test, TestingModule } from '@nestjs/testing';
import { EventsService, type EventRow } from './events.service';
import { DatabaseService } from '../database/database.service';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';

describe('EventsService', () => {
    let service: EventsService;
    let dbQueryMock: jest.Mock;

    const mockEvent: EventRow = {
        id: 'event-1',
        status: 'próximo',
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
    };

    beforeEach(async () => {
        dbQueryMock = jest.fn().mockResolvedValue({ rows: [] });

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EventsService,
                {
                    provide: DatabaseService,
                    useValue: {
                        query: dbQueryMock,
                        getPool: jest.fn().mockReturnValue({
                            connect: jest.fn().mockReturnValue({
                                query: jest.fn(),
                                release: jest.fn(),
                            }),
                        }),
                    },
                },
                {
                    provide: 'REDIS_CLIENT',
                    useValue: {
                        set: jest.fn().mockResolvedValue(undefined),
                        sadd: jest.fn().mockResolvedValue(1),
                        srem: jest.fn().mockResolvedValue(1),
                        del: jest.fn().mockResolvedValue(1),
                        get: jest.fn().mockResolvedValue(null),
                        sismember: jest.fn().mockResolvedValue(0),
                    },
                },
            ],
        }).compile();

        service = module.get<EventsService>(EventsService);
    });

    describe('create', () => {
        it('should create an event', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [mockEvent] });
            const dto = {
                title: 'Test Event',
                date: '2026-01-01',
                time: '10:00',
                difficulty: 'suave' as const,
            };
            const result = await service.create(dto, 'user-1', 'club-1');
            expect(result).toEqual(mockEvent);
        });
    });

    describe('findAll', () => {
        it('should return paginated events without filters', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ count: 1 }] })
                .mockResolvedValueOnce({ rows: [mockEvent] })
                .mockResolvedValueOnce({ rows: [] }) // attendees
                .mockResolvedValueOnce({ rows: [] }); // inventory

            const result = await service.findAll();
            expect(result.data).toHaveLength(1);
            expect(result.meta.total).toBe(1);
        });

        it('should filter by status and upcoming', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ count: 1 }] })
                .mockResolvedValueOnce({ rows: [mockEvent] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            const result = await service.findAll('próximo', true);
            expect(result.data).toHaveLength(1);
        });
    });

    describe('findOne', () => {
        it('should return an event', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [mockEvent] })
                .mockResolvedValueOnce({ rows: [] }) // attendees
                .mockResolvedValueOnce({ rows: [] }); // inventory

            const result = await service.findOne('event-1');
            expect(result.id).toBe('event-1');
            expect(result.attendees).toEqual([]);
            expect(result.inventory).toEqual([]);
        });

        it('should throw NotFoundException when event not found', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            await expect(service.findOne('event-1')).rejects.toThrow(NotFoundException);
        });
    });

    describe('update', () => {
        it('should update an event', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [mockEvent] });
            const result = await service.update('event-1', { title: 'Updated' });
            expect(result.title).toBe('Test Event');
        });

        it('should return event when empty DTO provided', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [mockEvent] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            const result = await service.update('event-1', {});
            expect(result.id).toBe('event-1');
        });
    });

    describe('remove', () => {
        it('should remove an event', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [mockEvent] });
            const result = await service.remove('event-1');
            expect(result.deleted).toBe(true);
        });

        it('should throw NotFoundException when event not found', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            await expect(service.remove('event-1')).rejects.toThrow(NotFoundException);
        });
    });

    describe('updateStatus', () => {
        it('should update event status', async () => {
            const draftEvent = { ...mockEvent, status: 'borrador' };
            dbQueryMock
                .mockResolvedValueOnce({ rows: [draftEvent] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [{ ...draftEvent, status: 'próximo' }] });

            const result = await service.updateStatus('event-1', 'próximo');
            expect(result.status).toBe('próximo');
        });

        it('should throw BadRequestException for invalid transition', async () => {
            const completedEvent = { ...mockEvent, status: 'completado' };
            dbQueryMock
                .mockResolvedValueOnce({ rows: [completedEvent] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            await expect(service.updateStatus('event-1', 'cancelado')).rejects.toThrow(BadRequestException);
        });
    });

    describe('getAttendees', () => {
        it('should return attendees', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [{ user_id: 'u1', name: 'Alice' }] });
            const result = await service.getAttendees('event-1');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Alice');
        });
    });

    describe('getInventory', () => {
        it('should return inventory', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [{ id: 'item-1', name: 'Tool' }] });
            const result = await service.getInventory('event-1');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Tool');
        });
    });

    describe('addInventoryItem', () => {
        it('should add an inventory item', async () => {
            const item = { id: 'item-1', name: 'First Aid', category: 'seguridad', quantity: 2 };
            dbQueryMock.mockResolvedValueOnce({ rows: [item] });
            const result = await service.addInventoryItem('event-1', { name: 'First Aid', category: 'seguridad' as any, quantity: 2 });
            expect(result.name).toBe('First Aid');
        });
    });

    describe('removeInventoryItem', () => {
        it('should remove an inventory item', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [{ id: 'item-1' }] });
            const result = await service.removeInventoryItem('event-1', 'item-1');
            expect(result.deleted).toBe(true);
        });

        it('should throw NotFoundException when item not found', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            await expect(service.removeInventoryItem('event-1', 'item-1')).rejects.toThrow(NotFoundException);
        });
    });

    describe('rsvp', () => {
        const rsvpEvent = { ...mockEvent, status: 'proximo' };

        it('should confirm RSVP when all validations pass', async () => {
            jest.spyOn(service, 'findOne').mockResolvedValue(rsvpEvent as any);
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // attendees count
                .mockResolvedValueOnce({ rows: [{ rider_level: 'intermedio' }] }) // user level
                .mockResolvedValueOnce({ rows: [{ soat_expiry: '2027-01-01', tech_review_expiry: '2027-01-01' }] }) // motorcycle
                .mockResolvedValueOnce({ rows: [] }); // insert RSVP

            const result = await service.rsvp('event-1', { id: 'user-1', role: 'rider' });
            expect(result.success).toBe(true);
        });

        it('should throw BadRequestException when event status is not proximo', async () => {
            jest.spyOn(service, 'findOne').mockResolvedValue({ ...mockEvent, status: 'completado' } as any);
            await expect(service.rsvp('event-1', { id: 'user-1', role: 'rider' })).rejects.toThrow(BadRequestException);
        });

        it('should throw BadRequestException when event is full', async () => {
            jest.spyOn(service, 'findOne').mockResolvedValue(rsvpEvent as any);
            dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '10' }] }); // attendees count = max
            await expect(service.rsvp('event-1', { id: 'user-1', role: 'rider' })).rejects.toThrow(BadRequestException);
        });

        it('should throw BadRequestException when rider level is too low', async () => {
            const highLevelEvent = { ...rsvpEvent, min_rider_level: 'avanzado' };
            jest.spyOn(service, 'findOne').mockResolvedValue(highLevelEvent as any);
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ count: '0' }] })
                .mockResolvedValueOnce({ rows: [{ rider_level: 'novato' }] });
            await expect(service.rsvp('event-1', { id: 'user-1', role: 'rider' })).rejects.toThrow(BadRequestException);
        });

        it('should throw BadRequestException when no active motorcycle', async () => {
            jest.spyOn(service, 'findOne').mockResolvedValue(rsvpEvent as any);
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ count: '0' }] })
                .mockResolvedValueOnce({ rows: [{ rider_level: 'intermedio' }] })
                .mockResolvedValueOnce({ rows: [] });
            await expect(service.rsvp('event-1', { id: 'user-1', role: 'rider' })).rejects.toThrow(BadRequestException);
        });

        it('should throw ConflictException when already RSVPd', async () => {
            jest.spyOn(service, 'findOne').mockResolvedValue(rsvpEvent as any);
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ count: '0' }] })
                .mockResolvedValueOnce({ rows: [{ rider_level: 'intermedio' }] })
                .mockResolvedValueOnce({ rows: [{ soat_expiry: '2027-01-01', tech_review_expiry: '2027-01-01' }] })
                .mockRejectedValueOnce({ code: '23505' });
            await expect(service.rsvp('event-1', { id: 'user-1', role: 'rider' })).rejects.toThrow(ConflictException);
        });
    });

    describe('cancelRsvp', () => {
        it('should cancel RSVP', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [{ id: 'rsvp-1' }] });
            const result = await service.cancelRsvp('event-1', 'user-1');
            expect(result.deleted).toBe(true);
        });

        it('should throw NotFoundException when RSVP not found', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            await expect(service.cancelRsvp('event-1', 'user-1')).rejects.toThrow(NotFoundException);
        });
    });

    describe('respondChecklist', () => {
        it('should respond to checklist and mark completed', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [] }) // INSERT response
                .mockResolvedValueOnce({ rows: [{ id: 'c1', required: true }] }) // required items
                .mockResolvedValueOnce({ rows: [{ item_id: 'c1' }] }) // user responses
                .mockResolvedValueOnce({ rows: [] }); // UPDATE attendee
            const result = await service.respondChecklist('event-1', 'user-1', [{ itemId: 'c1', checked: true }]);
            expect(result.success).toBe(true);
            expect(result.checklist_completed).toBe(true);
        });

        it('should mark not completed when required items missing', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [] }) // INSERT response
                .mockResolvedValueOnce({ rows: [{ id: 'c1', required: true }, { id: 'c2', required: true }] }) // 2 required
                .mockResolvedValueOnce({ rows: [{ item_id: 'c1' }] }) // only 1 checked
                .mockResolvedValueOnce({ rows: [] }); // UPDATE attendee
            const result = await service.respondChecklist('event-1', 'user-1', [{ itemId: 'c1', checked: true }]);
            expect(result.checklist_completed).toBe(false);
        });
    });

    describe('claimInventoryItem', () => {
        it('should claim an available item', async () => {
            const client = {
                query: jest.fn().mockResolvedValue({ rows: [] }),
                release: jest.fn(),
            };
            client.query
                .mockResolvedValueOnce({ rows: [] }) // BEGIN
                .mockResolvedValueOnce({ rows: [{ assigned_to: null }] }) // lock select
                .mockResolvedValueOnce({ rows: [{ id: 'i1', assigned_to: 'user-1' }] }) // update
                .mockResolvedValueOnce({ rows: [] }); // COMMIT

            const dbService = (service as any).db;
            dbService.getPool = jest.fn().mockReturnValue({ connect: jest.fn().mockResolvedValue(client) });

            const result = await service.claimInventoryItem('event-1', 'i1', 'user-1');
            expect(result.assigned_to).toBe('user-1');
        });

        it('should throw ConflictException when item already claimed', async () => {
            const client = {
                query: jest.fn().mockResolvedValue({ rows: [] }),
                release: jest.fn(),
            };
            client.query
                .mockResolvedValueOnce({ rows: [] }) // BEGIN
                .mockResolvedValueOnce({ rows: [{ assigned_to: 'user-2' }] }) // lock select
                .mockResolvedValueOnce({ rows: [] }) // ROLLBACK
                .mockResolvedValueOnce({ rows: [] }); // ROLLBACK again in catch

            const dbService = (service as any).db;
            dbService.getPool = jest.fn().mockReturnValue({ connect: jest.fn().mockResolvedValue(client) });

            await expect(service.claimInventoryItem('event-1', 'i1', 'user-1')).rejects.toThrow(ConflictException);
        });

        it('should throw NotFoundException when item not found', async () => {
            const client = {
                query: jest.fn().mockResolvedValue({ rows: [] }),
                release: jest.fn(),
            };
            client.query
                .mockResolvedValueOnce({ rows: [] }) // BEGIN
                .mockResolvedValueOnce({ rows: [] }) // lock select empty
                .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

            const dbService = (service as any).db;
            dbService.getPool = jest.fn().mockReturnValue({ connect: jest.fn().mockResolvedValue(client) });

            await expect(service.claimInventoryItem('event-1', 'i1', 'user-1')).rejects.toThrow(NotFoundException);
        });
    });

    describe('releaseInventoryItem', () => {
        it('should release a claimed item', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [{ id: 'i1', assigned_to: null }] });
            const result = await service.releaseInventoryItem('event-1', 'i1', 'user-1');
            expect(result.released).toBe(true);
        });

        it('should throw ConflictException when not assigned to user', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            await expect(service.releaseInventoryItem('event-1', 'i1', 'user-1')).rejects.toThrow(ConflictException);
        });
    });
});
