import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TurnstileService } from './turnstile.service';

describe('TurnstileService', () => {
    let service: TurnstileService;
    let config: { get: jest.Mock };

    beforeEach(async () => {
        config = { get: jest.fn().mockReturnValue('secret-test') };
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TurnstileService,
                { provide: ConfigService, useValue: config },
            ],
        }).compile();
        service = module.get<TurnstileService>(TurnstileService);
    });

    it('should reject when secret key is not configured (fail-closed)', async () => {
        config.get.mockReturnValue(undefined);
        await expect(service.verifyToken('token')).resolves.toBe(false);
    });

    it('should reject when token is missing', async () => {
        await expect(service.verifyToken(null)).resolves.toBe(false);
    });

    it('should reject when Cloudflare returns success=false', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            json: jest.fn().mockResolvedValue({ success: false, 'error-codes': ['invalid-input-response'] }),
        }) as unknown as typeof fetch;
        await expect(service.verifyToken('bad-token')).resolves.toBe(false);
    });

    it('should reject when Cloudflare is unreachable (fail-closed)', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
        await expect(service.verifyToken('token')).resolves.toBe(false);
    });

    it('should accept a valid token', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            json: jest.fn().mockResolvedValue({ success: true }),
        }) as unknown as typeof fetch;
        await expect(service.verifyToken('valid-token', '1.2.3.4')).resolves.toBe(true);
    });
});
