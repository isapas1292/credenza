// Conexión a Supabase (PostgreSQL) mediante node-postgres.
const path = require('path');
const { Pool, types } = require('pg');

try {
    process.loadEnvFile(path.resolve(__dirname, '..', '.env'));
} catch (error) {
    if (error.code !== 'ENOENT') {
        throw error;
    }
}

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!connectionString && (!process.env.DB_HOST || !process.env.DB_PASSWORD)) {
    throw new Error(
        'Configura DATABASE_URL o, alternativamente, DB_HOST y DB_PASSWORD'
    );
}

// Por defecto pg devuelve numeric/bigint como STRING (para no perder precisión).
// Como nuestros valores caben en un número de JS, los parseamos a number para
// que el frontend reciba números reales (score, precios, ids).
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : parseInt(v, 10)));

const pool = new Pool({
    ...(connectionString
        ? { connectionString }
        : {
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT) || 5432,
            database: process.env.DB_NAME || 'postgres',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD,
        }),
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
    console.error('[DB] Error inesperado en el pool de PostgreSQL:', err.message);
});

/**
 * Ejecuta una consulta parametrizada. Uso: query('SELECT ... WHERE "Id" = $1', [id])
 * Devuelve el objeto result de pg (usa .rows y .rowCount).
 */
function query(text, params) {
    return pool.query(text, params);
}

module.exports = { pool, query };
