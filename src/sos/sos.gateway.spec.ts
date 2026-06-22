import { Test, TestingModule } from '@nestjs/testing';
import { SosGateway } from './sos.gateway';

describe('SosGateway', () => {
    let gateway: SosGateway;
    let redisClientMock: any;
    let subscriberMock: any;
    let emitMock: jest.Mock;

    beforeEach(async () => {
        emitMock = jest.fn();
        subscriberMock = {
            psubscribe: jest.fn().mockResolvedValue(undefined),
            on: jest.fn(),
        };
        redisClientMock = {
            duplicate: jest.fn().mockReturnValue(subscriberMock),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SosGateway,
                { provide: 'REDIS_CLIENT', useValue: redisClientMock },
            ],
        }).compile();

        gateway = module.get<SosGateway>(SosGateway);
        gateway.server = { to: jest.fn().mockReturnValue({ emit: emitMock }) } as any;
    });

    describe('afterInit', () => {
        it('should duplicate redis client and subscribe to sos pattern', () => {
            gateway.afterInit();
            expect(redisClientMock.duplicate).toHaveBeenCalled();
            expect(subscriberMock.psubscribe).toHaveBeenCalledWith('sos:*');
            expect(subscriberMock.on).toHaveBeenCalledWith('pmessage', expect.any(Function));
        });

        it('should emit sos_alert to the room on valid pmessage (event channel)', () => {
            gateway.afterInit();
            const handler = subscriberMock.on.mock.calls[0][1] as (p: string, c: string, m: string) => void;
            const payload = { alertId: 'a1', userId: 'u1', type: 'accidente', lat: 1, lng: 2 };
            handler('sos:*', 'sos:event:event-1', JSON.stringify({ type: 'sos', payload }));

            expect(gateway.server.to).toHaveBeenCalledWith('event-1');
            expect(emitMock).toHaveBeenCalledWith('sos_alert', payload);
        });

        it('should emit sos_alert to the room on valid pmessage (club channel)', () => {
            gateway.afterInit();
            const handler = subscriberMock.on.mock.calls[0][1] as (p: string, c: string, m: string) => void;
            const payload = { alertId: 'a2', userId: 'u2', type: 'averia', lat: 3, lng: 4 };
            handler('sos:*', 'sos:club:club-1', JSON.stringify({ type: 'sos', payload }));

            expect(gateway.server.to).toHaveBeenCalledWith('club-1');
            expect(emitMock).toHaveBeenCalledWith('sos_alert', payload);
        });

        it('should ignore invalid JSON pmessage without throwing', () => {
            gateway.afterInit();
            const handler = subscriberMock.on.mock.calls[0][1] as (p: string, c: string, m: string) => void;
            expect(() => handler('sos:*', 'sos:event:event-1', 'not-json')).not.toThrow();
            expect(emitMock).not.toHaveBeenCalled();
        });

        it('should ignore non-sos messages', () => {
            gateway.afterInit();
            const handler = subscriberMock.on.mock.calls[0][1] as (p: string, c: string, m: string) => void;
            handler('sos:*', 'sos:event:event-1', JSON.stringify({ type: 'other', payload: {} }));
            expect(emitMock).not.toHaveBeenCalled();
        });
    });

    describe('connection lifecycle', () => {
        it('handleConnection should not throw', () => {
            expect(() => gateway.handleConnection({ id: 'c1' } as any)).not.toThrow();
        });

        it('handleDisconnect should not throw', () => {
            expect(() => gateway.handleDisconnect({ id: 'c1' } as any)).not.toThrow();
        });
    });

    describe('room subscriptions', () => {
        it('subscribeClub should join the club room', async () => {
            const client = { id: 'c1', join: jest.fn().mockResolvedValue(undefined) } as any;
            await gateway.subscribeClub(client, 'club-1');
            expect(client.join).toHaveBeenCalledWith('club-1');
        });

        it('subscribeEvent should join the event room', async () => {
            const client = { id: 'c1', join: jest.fn().mockResolvedValue(undefined) } as any;
            await gateway.subscribeEvent(client, 'event-1');
            expect(client.join).toHaveBeenCalledWith('event-1');
        });

        it('unsubscribeClub should leave the club room', async () => {
            const client = { id: 'c1', leave: jest.fn().mockResolvedValue(undefined) } as any;
            await gateway.unsubscribeClub(client, 'club-1');
            expect(client.leave).toHaveBeenCalledWith('club-1');
        });

        it('unsubscribeEvent should leave the event room', async () => {
            const client = { id: 'c1', leave: jest.fn().mockResolvedValue(undefined) } as any;
            await gateway.unsubscribeEvent(client, 'event-1');
            expect(client.leave).toHaveBeenCalledWith('event-1');
        });
    });
});
