import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { SosGateway } from './sos.gateway';

describe('SosGateway', () => {
    let gateway: SosGateway;
    let redisClientMock: any;
    let subscriberMock: any;
    let emitMock: jest.Mock;
    let jwtServiceMock: any;

    beforeEach(async () => {
        emitMock = jest.fn();
        subscriberMock = {
            psubscribe: jest.fn().mockResolvedValue(undefined),
            on: jest.fn(),
        };
        redisClientMock = {
            duplicate: jest.fn().mockReturnValue(subscriberMock),
        };
        jwtServiceMock = {
            verify: jest.fn().mockReturnValue({ sub: 'u1', email: 'test@test.com', role: 'rider' }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SosGateway,
                { provide: 'REDIS_CLIENT', useValue: redisClientMock },
                { provide: JwtService, useValue: jwtServiceMock },
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
            const pmessageCall = subscriberMock.on.mock.calls.find(c => c[0] === 'pmessage');
            const handler = pmessageCall![1] as (p: string, c: string, m: string) => void;
            const payload = { alertId: 'a1', userId: 'u1', type: 'accidente', lat: 1, lng: 2 };
            handler('sos:*', 'sos:event:event-1', JSON.stringify({ type: 'sos', payload }));

            expect(gateway.server.to).toHaveBeenCalledWith('event-1');
            expect(emitMock).toHaveBeenCalledWith('sos_alert', payload);
        });

        it('should emit sos_alert to the room on valid pmessage (club channel)', () => {
            gateway.afterInit();
            const pmessageCall = subscriberMock.on.mock.calls.find(c => c[0] === 'pmessage');
            const handler = pmessageCall![1] as (p: string, c: string, m: string) => void;
            const payload = { alertId: 'a2', userId: 'u2', type: 'averia', lat: 3, lng: 4 };
            handler('sos:*', 'sos:club:club-1', JSON.stringify({ type: 'sos', payload }));

            expect(gateway.server.to).toHaveBeenCalledWith('club-1');
            expect(emitMock).toHaveBeenCalledWith('sos_alert', payload);
        });

        it('should ignore invalid JSON pmessage without throwing', () => {
            gateway.afterInit();
            const pmessageCall = subscriberMock.on.mock.calls.find(c => c[0] === 'pmessage');
            const handler = pmessageCall![1] as (p: string, c: string, m: string) => void;
            expect(() => handler('sos:*', 'sos:event:event-1', 'not-json')).not.toThrow();
            expect(emitMock).not.toHaveBeenCalled();
        });

        it('should ignore non-sos messages', () => {
            gateway.afterInit();
            const pmessageCall = subscriberMock.on.mock.calls.find(c => c[0] === 'pmessage');
            const handler = pmessageCall![1] as (p: string, c: string, m: string) => void;
            handler('sos:*', 'sos:event:event-1', JSON.stringify({ type: 'other', payload: {} }));
            expect(emitMock).not.toHaveBeenCalled();
        });
    });

    describe('connection lifecycle', () => {
        it('handleConnection should accept client with valid token', () => {
            const client = {
                id: 'c1',
                handshake: { auth: { token: 'valid-token' }, headers: {}, query: {} },
                disconnect: jest.fn(),
                data: {},
            } as any;
            expect(() => gateway.handleConnection(client)).not.toThrow();
            expect(jwtServiceMock.verify).toHaveBeenCalledWith('valid-token');
            expect(client.disconnect).not.toHaveBeenCalled();
            expect((client.data as any).user).toEqual({ sub: 'u1', email: 'test@test.com', role: 'rider' });
        });

        it('handleConnection should reject client without token', () => {
            const client = {
                id: 'c2',
                handshake: { auth: {}, headers: {}, query: {} },
                disconnect: jest.fn(),
                data: {},
            } as any;
            gateway.handleConnection(client);
            expect(client.disconnect).toHaveBeenCalledWith(true);
            expect(jwtServiceMock.verify).not.toHaveBeenCalled();
        });

        it('handleConnection should reject client with invalid token', () => {
            jwtServiceMock.verify.mockImplementationOnce(() => { throw new Error('invalid'); });
            const client = {
                id: 'c3',
                handshake: { auth: { token: 'bad-token' }, headers: {}, query: {} },
                disconnect: jest.fn(),
                data: {},
            } as any;
            gateway.handleConnection(client);
            expect(jwtServiceMock.verify).toHaveBeenCalledWith('bad-token');
            expect(client.disconnect).toHaveBeenCalledWith(true);
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
