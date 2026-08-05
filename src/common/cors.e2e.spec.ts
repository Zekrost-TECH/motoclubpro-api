import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppControllerStub } from './cors.stub';

// Ejercita el middleware CORS REAL de fastify (no la función aislada):
// arranca una app Nest con la misma configuración que main.ts y hace
// peticiones HTTP de verdad.
describe('CORS middleware (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            controllers: [AppControllerStub],
        }).compile();

        app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
        app.enableCors({
            origin: (origin, callback) => {
                const allowed = new Set(['https://bikeros.co', 'https://admin.bikeros.co']);
                const capacitor = new Set(['capacitor://localhost', 'https://localhost', 'http://localhost', 'http://10.0.2.2:5173']);
                if (!origin) { callback(null, true); return; }
                if (capacitor.has(origin) || allowed.has(origin)) { callback(null, true); return; }
                callback(new Error(`CORS bloqueado: ${origin}`), false);
            },
            methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'x-club-id'],
            credentials: true,
        });
        await app.init();
        await app.listen(0);
    });

    afterAll(async () => {
        await app.close();
    });

    it('preflight de origen permitido responde 204 con ACAO', async () => {
        const res = await request(app.getHttpServer())
            .options('/')
            .set('Origin', 'https://bikeros.co')
            .set('Access-Control-Request-Method', 'GET');
        expect([204, 200]).toContain(res.status);
        expect(res.headers['access-control-allow-origin']).toBe('https://bikeros.co');
    });

    it('preflight de origen desconocido es rechazado', async () => {
        const res = await request(app.getHttpServer())
            .options('/')
            .set('Origin', 'https://evil.example.com')
            .set('Access-Control-Request-Method', 'GET');
        expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('GET con Origin permitido incluye ACAO', async () => {
        const res = await request(app.getHttpServer())
            .get('/ping')
            .set('Origin', 'https://admin.bikeros.co');
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe('https://admin.bikeros.co');
    });

    it('GET sin Origin (cliente no-browser) funciona', async () => {
        const res = await request(app.getHttpServer()).get('/ping');
        expect(res.status).toBe(200);
    });

    it('GET con Origin de Capacitor funciona', async () => {
        const res = await request(app.getHttpServer())
            .get('/ping')
            .set('Origin', 'capacitor://localhost');
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe('capacitor://localhost');
    });

    it('GET con Origin desconocido es rechazado', async () => {
        const res = await request(app.getHttpServer())
            .get('/ping')
            .set('Origin', 'https://evil.example.com');
        // fastify-cors propaga el error del callback de origin → bloquea
        expect(res.status).toBeGreaterThanOrEqual(400);
    });
});
