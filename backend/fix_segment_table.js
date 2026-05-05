const sql = require('mssql');

const dbConfig = {
    user: 'jami_user',
    password: '6013',
    server: 'localhost',
    database: 'Credenza',
    options: { encrypt: false, trustServerCertificate: true }
};

async function run() {
    await sql.connect(dbConfig);

    // Agrega FechaActualizacion si no existe
    await sql.query(`
        IF NOT EXISTS (
            SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'SegmentosFinancierosUsuario'
              AND COLUMN_NAME = 'FechaActualizacion'
        )
        BEGIN
            ALTER TABLE [dbo].[SegmentosFinancierosUsuario]
            ADD [FechaActualizacion] DATETIME NOT NULL DEFAULT GETDATE();
            PRINT 'Columna FechaActualizacion agregada.';
        END
        ELSE
        BEGIN
            PRINT 'FechaActualizacion ya existe.';
        END
    `);

    // Verifica columnas actuales de la tabla
    const result = await sql.query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'SegmentosFinancierosUsuario'
        ORDER BY ORDINAL_POSITION
    `);

    console.log('\n=== Columnas de SegmentosFinancierosUsuario ===');
    result.recordset.forEach(col => {
        console.log(`  ${col.COLUMN_NAME} (${col.DATA_TYPE}, nullable: ${col.IS_NULLABLE})`);
    });

    await sql.close();
    console.log('\nOK - Tabla lista para usarse.');
}

run().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
