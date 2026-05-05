

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

    await sql.query(`
        IF NOT EXISTS (
            SELECT 1 FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_NAME = 'SegmentosFinancierosUsuario'
        )
        BEGIN
            CREATE TABLE [dbo].[SegmentosFinancierosUsuario] (
                [Id]              INT            IDENTITY(1,1) PRIMARY KEY,
                [UsuarioId]       INT            NOT NULL,
                [SegmentoId]      INT            NOT NULL,
                [NombreSegmento]  NVARCHAR(100)  NOT NULL,
                [PuntajePerfil]   INT            NOT NULL DEFAULT 0,
                [Resumen]         NVARCHAR(500)  NULL,
                [FechaClasificacion] DATETIME   NOT NULL DEFAULT GETDATE(),
                [FechaActualizacion] DATETIME   NOT NULL DEFAULT GETDATE(),
                CONSTRAINT FK_SegmentosFinancieros_Usuarios
                    FOREIGN KEY ([UsuarioId]) REFERENCES [dbo].[Usuarios]([Id])
            );
            PRINT 'Tabla SegmentosFinancierosUsuario creada.';
        END
        ELSE
        BEGIN
            PRINT 'La tabla SegmentosFinancierosUsuario ya existe.';
        END
    `);

    console.log('OK - Tabla lista.');
    await sql.close();
}

run().catch(e => {
    console.error(e.message);
    process.exit(1);
});
