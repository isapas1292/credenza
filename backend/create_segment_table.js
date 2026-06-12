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
        IF OBJECT_ID('dbo.SegmentosFinancierosUsuario', 'U') IS NULL
        BEGIN
            CREATE TABLE dbo.SegmentosFinancierosUsuario (
                Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                UsuarioId INT NOT NULL,
                SegmentId INT NOT NULL,
                SegmentName NVARCHAR(150) NOT NULL,
                ProfileScore DECIMAL(10,2) NOT NULL,
                Summary NVARCHAR(1000) NULL,
                FechaCreacion DATETIME2 NOT NULL DEFAULT GETDATE(),
                FechaActualizacion DATETIME NOT NULL DEFAULT GETDATE(),
                CONSTRAINT FK_SegmentosFinancierosUsuario_Usuarios
                    FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuarios(Id),
                CONSTRAINT UQ_SegmentosFinancierosUsuario_UsuarioId UNIQUE (UsuarioId)
            );
        END

        IF NOT EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE object_id = OBJECT_ID('dbo.SegmentosFinancierosUsuario')
              AND name = 'UQ_SegmentosFinancierosUsuario_UsuarioId'
        )
        BEGIN
            CREATE UNIQUE INDEX UQ_SegmentosFinancierosUsuario_UsuarioId
                ON dbo.SegmentosFinancierosUsuario(UsuarioId);
        END
    `);

    console.log('OK - Tabla SegmentosFinancierosUsuario lista y UsuarioId unico.');
    await sql.close();
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
