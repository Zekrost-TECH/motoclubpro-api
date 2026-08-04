import { ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

/**
 * Cuando un admin global / superadmin hace bypass de membresía, el club
 * referenciado (x-club-id / params.id) debe existir y estar activo.
 * Evita operar sobre clubes inexistentes o desactivados.
 */
export async function assertActiveClub(db: DatabaseService, clubId: string): Promise<void> {
    const { rows } = await db.query<{ '1': number }>(
        `SELECT 1 FROM clubs WHERE id = $1 AND is_active = TRUE LIMIT 1`,
        [clubId],
    );
    if (rows.length === 0) {
        throw new ForbiddenException('Club no encontrado o inactivo');
    }
}
