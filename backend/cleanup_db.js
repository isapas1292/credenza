// Limpieza/mejora del esquema de Credenza. Idempotente: se puede correr varias veces.
//   node backend/cleanup_db.js
// Cambios:
//   1. Elimina la tabla FinanzasUsuario (duplicado nunca leído del JSON Perfil).
//   2. Elimina la columna Usuarios.ObjetivoPrincipalTexto (redundante con perfil.goals.mainGoal).
//   3. Verifica que Usuarios.Email tenga unicidad (la crea solo si faltara).
const sql = require('mssql');

const dbConfig = {
    user: process.env.DB_USER || 'jami_user',
    password: process.env.DB_PASSWORD || '6013',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'Credenza',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_CERT !== 'false'
    }
};

async function run() {
    await sql.connect(dbConfig);

    // 1. Eliminar tabla FinanzasUsuario
    await sql.query(`
        IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'FinanzasUsuario')
        BEGIN
            DROP TABLE [dbo].[FinanzasUsuario];
            PRINT 'Tabla FinanzasUsuario eliminada.';
        END
        ELSE PRINT 'FinanzasUsuario no existe (ok).';
    `);

    // 2. Eliminar columna ObjetivoPrincipalTexto (quitando antes su default si tuviera)
    await sql.query(`
        IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Usuarios' AND COLUMN_NAME='ObjetivoPrincipalTexto')
        BEGIN
            DECLARE @df NVARCHAR(200);
            SELECT @df = dc.name
            FROM sys.default_constraints dc
            JOIN sys.columns c ON c.default_object_id = dc.object_id
            WHERE c.object_id = OBJECT_ID('dbo.Usuarios') AND c.name = 'ObjetivoPrincipalTexto';
            IF @df IS NOT NULL EXEC('ALTER TABLE [dbo].[Usuarios] DROP CONSTRAINT [' + @df + ']');
            ALTER TABLE [dbo].[Usuarios] DROP COLUMN [ObjetivoPrincipalTexto];
            PRINT 'Columna Usuarios.ObjetivoPrincipalTexto eliminada.';
        END
        ELSE PRINT 'ObjetivoPrincipalTexto no existe (ok).';
    `);

    // 3. Garantizar unicidad de Email. Solo se crea si NO existe ya un índice o
    //    constraint único (cubre tanto sys.indexes como sys.key_constraints) y si
    //    no hay duplicados. En esquemas normales ya viene una UNIQUE constraint.
    const dups = await sql.query(`
        SELECT Email, COUNT(*) n FROM [dbo].[Usuarios] GROUP BY Email HAVING COUNT(*) > 1
    `);
    if (dups.recordset.length > 0) {
        console.log('AVISO: hay emails duplicados; resuélvelos antes de imponer unicidad:',
            dups.recordset.map(r => r.Email).join(', '));
    } else {
        await sql.query(`
            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes i
                JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                WHERE i.object_id = OBJECT_ID('dbo.Usuarios') AND c.name = 'Email' AND i.is_unique = 1
            )
            BEGIN
                CREATE UNIQUE INDEX UQ_Usuarios_Email ON [dbo].[Usuarios]([Email]);
                PRINT 'Índice único en Email creado.';
            END
            ELSE PRINT 'Email ya tiene unicidad garantizada (ok).';
        `);
    }

    console.log('OK - Limpieza de esquema completada.');
    await sql.close();
}

run().catch(e => {
    console.error('Error en cleanup_db:', e.message);
    process.exit(1);
});
