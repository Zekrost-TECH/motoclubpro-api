import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { DatabaseService } from './database/database.service';

// Boot del AppModule COMPLETO (grafo DI real) con solo BD/Redis mockeados.
//
// Detecta regresiones de inyección de dependencias que los tests por módulo
// no ven (nunca arrancan el módulo raíz), como el UnknownExportException de
// ClubsModule que tumbó producción: exportar un provider importado sin ser
// parte del módulo actual.
//
// Los side-effects de los providers (crons, FCM, Wompi/Alegra, SOS gateway)
// son tolerantes a env vars ausentes; los crons corren a la 1:00/2:00 AM.

function buildRedisSubscriberMock() {
    return {
        psubscribe: jest.fn().mockResolvedValue(undefined),
        on: jest.fn().mockReturnThis(),
        punsubscribe: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
    };
}

function buildRedisClientMock() {
    return {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
        sadd: jest.fn().mockResolvedValue(1),
        srem: jest.fn().mockResolvedValue(1),
        exists: jest.fn().mockResolvedValue(0),
        ping: jest.fn().mockResolvedValue('PONG'),
        duplicate: jest.fn().mockReturnValue(buildRedisSubscriberMock()),
    };
}

describe('AppModule (boot del grafo DI)', () => {
    it('debería inicializar todos los módulos sin errores de dependencias', async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(DatabaseService)
            .useValue({
                query: jest.fn().mockResolvedValue({ rows: [] }),
                getPool: jest.fn().mockReturnValue({
                    connect: jest.fn().mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() }),
                }),
            })
            .overrideProvider('REDIS_CLIENT')
            .useValue(buildRedisClientMock())
            .compile();

        const app = moduleRef.createNestApplication();
        await app.init();
        await app.close();
    });
});
