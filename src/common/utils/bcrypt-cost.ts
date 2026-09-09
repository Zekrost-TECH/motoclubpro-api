import * as bcrypt from 'bcrypt';

/**
 * Bcrypt cost factor configurable via BCRYPT_COST env var.
 * OWASP recommends 12+ (https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
 * Default: 12. Lower only for dev/test to speed up.
 */
export const BCRYPT_COST = parseInt(process.env.BCRYPT_COST ?? '', 10) || 12;

export function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_COST);
}
