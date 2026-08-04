import { buildCorsOriginValidator } from './cors';

describe('buildCorsOriginValidator', () => {
    const validator = buildCorsOriginValidator(['https://panel.biker-os.zekrost.com', 'https://web.zekrost.com']);

    const check = (origin: string | undefined | null): { err: Error | null; allow?: boolean } => {
        let result: { err: Error | null; allow?: boolean } = { err: null };
        validator(origin as string | undefined, (err, allow) => { result = { err, allow: allow === true }; });
        return result;
    };

    it('should allow requests without Origin (non-browser clients)', () => {
        const r = check(undefined);
        expect(r.err).toBeNull();
        expect(r.allow).toBe(true);
    });

    it('should allow null origin', () => {
        const r = check(null);
        expect(r.err).toBeNull();
        expect(r.allow).toBe(true);
    });

    it('should allow Capacitor origins', () => {
        for (const o of ['capacitor://localhost', 'https://localhost', 'http://localhost', 'http://10.0.2.2:5173']) {
            const r = check(o);
            expect(r.err).toBeNull();
            expect(r.allow).toBe(true);
        }
    });

    it('should allow whitelisted origins', () => {
        const r = check('https://panel.biker-os.zekrost.com');
        expect(r.err).toBeNull();
        expect(r.allow).toBe(true);
    });

    it('should reject unknown origins', () => {
        const r = check('https://evil.example.com');
        expect(r.err).not.toBeNull();
        expect(r.allow).toBe(false);
    });
});
