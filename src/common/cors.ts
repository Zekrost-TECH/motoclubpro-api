// Validación de orígenes CORS.
//
// Requests SIN header Origin (curl, scripts, server-to-server, healthchecks)
// se permiten a propósito: CORS es un mecanismo de navegador y esos clientes
// lo ignoran por completo. Tampoco debilita la seguridad del navegador, porque
// los navegadores modernos siempre envían Origin en peticiones cross-origin
// (y en POST/PATCH/DELETE same-origin). Todo endpoint de la API exige JWT
// válido independientemente del origen.
//
// Requests CON Origin deben estar en la allowlist o se bloquean con error.

const CAPACITOR_ORIGINS = new Set([
    'capacitor://localhost',
    'https://localhost',
    'http://localhost',
    'http://10.0.2.2:5173',
]);

type CorsOriginValue = string | boolean | RegExp;

export function buildCorsOriginValidator(allowedOrigins: string[]) {
    const allowed = new Set(allowedOrigins);

    return (origin: string | undefined, callback: (err: Error | null, allow: CorsOriginValue | CorsOriginValue[]) => void): void => {
        if (!origin) {
            callback(null, true);
            return;
        }
        if (CAPACITOR_ORIGINS.has(origin) || allowed.has(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`CORS bloqueado: ${origin}`), false);
    };
}
