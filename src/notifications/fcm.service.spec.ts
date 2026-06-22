import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { FcmService } from './fcm.service';

jest.mock('firebase-admin', () => {
    const sendEachForMulticast = jest.fn();
    return {
        apps: [] as unknown[],
        initializeApp: jest.fn(),
        credential: { cert: jest.fn().mockReturnValue({}) },
        messaging: jest.fn().mockReturnValue({ sendEachForMulticast }),
        __sendEachForMulticast: sendEachForMulticast,
    };
});

const mockedAdmin = admin as unknown as {
    apps: unknown[];
    initializeApp: jest.Mock;
    credential: { cert: jest.Mock };
    messaging: jest.Mock;
    __sendEachForMulticast: jest.Mock;
};

describe('FcmService', () => {
    let service: FcmService;

    function build(config: Record<string, string | undefined>): Promise<void> {
        return Test.createTestingModule({
            providers: [
                FcmService,
                { provide: ConfigService, useValue: { get: jest.fn((k: string) => config[k]) } },
            ],
        })
            .compile()
            .then((module) => {
                service = module.get<FcmService>(FcmService);
            });
    }

    beforeEach(() => {
        mockedAdmin.apps.length = 0;
        mockedAdmin.initializeApp.mockClear();
        mockedAdmin.__sendEachForMulticast.mockReset();
    });

    describe('onModuleInit', () => {
        it('should not initialize when credentials are missing', async () => {
            await build({});
            service.onModuleInit();
            expect(mockedAdmin.initializeApp).not.toHaveBeenCalled();
        });

        it('should initialize firebase-admin when credentials present', async () => {
            await build({
                FIREBASE_PROJECT_ID: 'proj',
                FIREBASE_CLIENT_EMAIL: 'svc@proj.iam',
                FIREBASE_PRIVATE_KEY: 'line1\\nline2',
            });
            service.onModuleInit();
            expect(mockedAdmin.initializeApp).toHaveBeenCalled();
        });

        it('should skip init when an app already exists', async () => {
            mockedAdmin.apps.push({});
            await build({ FIREBASE_PROJECT_ID: 'proj', FIREBASE_PRIVATE_KEY: 'k' });
            service.onModuleInit();
            expect(mockedAdmin.initializeApp).not.toHaveBeenCalled();
        });
    });

    describe('sendToTokens', () => {
        it('should not send when not ready', async () => {
            await build({});
            await service.sendToTokens(['t1'], { title: 'x', body: 'y' });
            expect(mockedAdmin.__sendEachForMulticast).not.toHaveBeenCalled();
        });

        it('should not send when tokens are empty', async () => {
            mockedAdmin.apps.push({});
            await build({});
            await service.sendToTokens([], { title: 'x', body: 'y' });
            expect(mockedAdmin.__sendEachForMulticast).not.toHaveBeenCalled();
        });

        it('should send multicast when ready and tokens present', async () => {
            mockedAdmin.apps.push({});
            mockedAdmin.__sendEachForMulticast.mockResolvedValue({ responses: [{ success: true }] });
            await build({});
            await service.sendToTokens(['t1'], { title: 'x', body: 'y' });
            expect(mockedAdmin.__sendEachForMulticast).toHaveBeenCalled();
        });

        it('should log failed tokens without throwing', async () => {
            mockedAdmin.apps.push({});
            mockedAdmin.__sendEachForMulticast.mockResolvedValue({
                responses: [{ success: false, error: { message: 'invalid token' } }],
            });
            await build({});
            await expect(service.sendToTokens(['t1'], { title: 'x', body: 'y' })).resolves.toBeUndefined();
        });

        it('should swallow errors from messaging', async () => {
            mockedAdmin.apps.push({});
            mockedAdmin.__sendEachForMulticast.mockRejectedValue(new Error('fcm down'));
            await build({});
            await expect(service.sendToTokens(['t1'], { title: 'x', body: 'y' })).resolves.toBeUndefined();
        });
    });

    describe('sendSOSAlert', () => {
        it('should send a formatted SOS notification', async () => {
            mockedAdmin.apps.push({});
            mockedAdmin.__sendEachForMulticast.mockResolvedValue({ responses: [{ success: true }] });
            await build({});
            await service.sendSOSAlert({ senderName: 'Alice', type: 'accidente', lat: 1, lng: 2, tokens: ['t1'] });
            expect(mockedAdmin.__sendEachForMulticast).toHaveBeenCalledWith(
                expect.objectContaining({
                    notification: expect.objectContaining({ title: 'SOS — Alice', body: 'Accidente' }),
                }),
            );
        });
    });
});
