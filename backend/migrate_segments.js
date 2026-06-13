const sql = require('mssql');
const AiService = require('./services/ai.service');

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

    // Eliminar duplicados antiguos conservando el registro actualizado mas reciente.
    await sql.query(`
        WITH ranked AS (
            SELECT Id, ROW_NUMBER() OVER (
                PARTITION BY UsuarioId ORDER BY FechaActualizacion DESC, Id DESC
            ) AS row_num
            FROM SegmentosFinancierosUsuario
        )
        DELETE FROM ranked WHERE row_num > 1;

        IF NOT EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE object_id = OBJECT_ID('dbo.SegmentosFinancierosUsuario')
              AND is_unique = 1
              AND name = 'UQ_SegmentosFinancierosUsuario_UsuarioId'
        )
        CREATE UNIQUE INDEX UQ_SegmentosFinancierosUsuario_UsuarioId
            ON dbo.SegmentosFinancierosUsuario(UsuarioId);
    `);

    const users = await sql.query(`
        SELECT Id, Perfil FROM Usuarios
        WHERE Perfil IS NOT NULL
    `);

    let updated = 0;
    for (const user of users.recordset) {
        const perfil = JSON.parse(user.Perfil);
        const segmento = await AiService.clasificarPerfil(perfil);
        await AiService.guardarSegmento(user.Id, segmento);
        updated++;
        console.log(`Usuario ${user.Id}: ${segmento.segment_name} (${segmento.profile_score}/100)`);
    }

    console.log(`OK - ${updated} perfiles activos clasificados y persistidos.`);
    await sql.close();
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
