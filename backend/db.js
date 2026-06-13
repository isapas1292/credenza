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

const requiredVariables = ['DB_HOST', 'DB_PASSWORD'];
const missingVariables = requiredVariables.filter((name) => !process.env[name]);
if (missingVariables.length > 0) {
    throw new Error(`Faltan variables de entorno requeridas: ${missingVariables.join(', ')}`);
}

// Por defecto pg devuelve numeric/bigint como STRING (para no perder precisión).
// Como nuestros valores caben en un número de JS, los parseamos a number para
// que el frontend reciba números reales (score, precios, ids).
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : parseInt(v, 10)));

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },   // Supabase requiere SSL
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
