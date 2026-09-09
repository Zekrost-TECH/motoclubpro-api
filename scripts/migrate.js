#!/usr/bin/env node
/**
 * Runner de migraciones para BikerOS API.
 * Ejecuta los archivos migrations/*.sql en orden y trackea cuáles se han aplicado.
 *
 * Uso:
 *   node scripts/migrate.js              # Ejecuta migraciones pendientes
 *   node scripts/migrate.js --status     # Muestra el estado de las migraciones
 *
 * Requiere DATABASE_URL en el entorno.
 */
const { readdir, readFile } = require('fs/promises');
const { join } = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');
const MIGRATIONS_TABLE = '_migrations';

async function main() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('Error: DATABASE_URL no está configurada');
        process.exit(1);
    }

    const pool = new Pool({ connectionString });
    const args = process.argv.slice(2);
    const statusOnly = args.includes('--status');

    try {
        // Crear tabla de tracking si no existe
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        // Listar migraciones aplicadas
        const { rows: applied } = await pool.query(
            `SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY name ASC`
        );
        const appliedSet = new Set(applied.map(r => r.name));

        // Listar archivos de migraciones
        const files = (await readdir(MIGRATIONS_DIR))
            .filter(f => f.endsWith('.sql'))
            .sort();

        if (statusOnly) {
            console.log('\nEstado de migraciones:');
            for (const file of files) {
                const status = appliedSet.has(file) ? '✅ aplicada' : '⏳ pendiente';
                console.log(`  ${status}  ${file}`);
            }
            console.log(`\nTotal: ${appliedSet.size}/${files.length} aplicadas\n`);
            return;
        }

        // Ejecutar migraciones pendientes
        const pending = files.filter(f => !appliedSet.has(f));
        if (pending.length === 0) {
            console.log('No hay migraciones pendientes.');
            return;
        }

        for (const file of pending) {
            console.log(`Ejecutando ${file}...`);
            const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query(
                    `INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ($1)`,
                    [file]
                );
                await client.query('COMMIT');
                console.log(`  ✅ ${file} aplicada`);
            } catch (err) {
                await client.query('ROLLBACK').catch(() => { });
                console.error(`  ❌ ${file} falló:`, err instanceof Error ? err.message : String(err));
                process.exit(1);
            } finally {
                client.release();
            }
        }

        console.log(`\n${pending.length} migración(es) aplicada(s).`);
    } finally {
        await pool.end();
    }
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
