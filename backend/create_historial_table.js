// Crea la tabla HistorialAnalisis donde se guarda cada análisis de producto
// que realiza un usuario. Ejecutar una sola vez: node backend/create_historial_table.js
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

    await sql.query(`
        IF NOT EXISTS (
            SELECT 1 FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_NAME = 'HistorialAnalisis'
        )
        BEGIN
            CREATE TABLE [dbo].[HistorialAnalisis] (
                [Id]                    INT             IDENTITY(1,1) PRIMARY KEY,
                [UsuarioId]             INT             NOT NULL,
                [ProductoNombre]        NVARCHAR(255)   NOT NULL,
                [ProductoPrecio]        DECIMAL(18,2)   NOT NULL DEFAULT 0,
                [ProductoCategoria]     NVARCHAR(100)   NULL,
                [RecomendacionScore]    DECIMAL(5,2)    NOT NULL DEFAULT 0,
                [Viable]                BIT             NOT NULL DEFAULT 0,
                [MensajeSugerencia]     NVARCHAR(1000)  NULL,
                [ResultadoCompletoJSON] NVARCHAR(MAX)   NULL,
                [FechaAnalisis]         DATETIME        NOT NULL DEFAULT GETDATE(),
                CONSTRAINT FK_HistorialAnalisis_Usuarios
                    FOREIGN KEY ([UsuarioId]) REFERENCES [dbo].[Usuarios]([Id])
            );
            CREATE INDEX IX_HistorialAnalisis_Usuario_Fecha
                ON [dbo].[HistorialAnalisis] ([UsuarioId], [FechaAnalisis] DESC);
            PRINT 'Tabla HistorialAnalisis creada.';
        END
        ELSE
        BEGIN
            PRINT 'La tabla HistorialAnalisis ya existe.';
        END
    `);

    console.log('OK - Tabla HistorialAnalisis lista.');
    await sql.close();
}

run().catch(e => {
    console.error('Error creando HistorialAnalisis:', e.message);
    process.exit(1);
});
