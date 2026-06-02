const sql = require('mssql');

const config = {
    user: 'jami_user',
    password: '6013',
    server: 'localhost',
    database: 'Credenza',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function updateSchema() {
    try {
        await sql.connect(config);
        console.log('Conectado a la base de datos Credenza');
        const request = new sql.Request();

        // 1. Crear tabla HistorialAnalisis
        const historialQuery = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='HistorialAnalisis' and xtype='U')
            CREATE TABLE HistorialAnalisis (
                Id INT IDENTITY(1,1) PRIMARY KEY,
                UsuarioId INT NOT NULL,
                ProductoNombre NVARCHAR(255),
                ProductoPrecio DECIMAL(18,2),
                ProductoCategoria NVARCHAR(100),
                RecomendacionScore DECIMAL(5,2),
                Viable BIT,
                MensajeSugerencia NVARCHAR(1000),
                ResultadoCompletoJSON NVARCHAR(MAX),
                FechaAnalisis DATETIME DEFAULT GETDATE(),
                CONSTRAINT FK_Historial_Usuario FOREIGN KEY (UsuarioId) REFERENCES Usuarios(Id)
            )
        `;
        await request.query(historialQuery);
        console.log('Tabla HistorialAnalisis creada o ya existente.');

        // 2. Crear tabla FinanzasUsuario
        const finanzasQuery = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FinanzasUsuario' and xtype='U')
            CREATE TABLE FinanzasUsuario (
                Id INT IDENTITY(1,1) PRIMARY KEY,
                UsuarioId INT NOT NULL UNIQUE,
                IngresoMensual DECIMAL(18,2) DEFAULT 0,
                GastosFijos DECIMAL(18,2) DEFAULT 0,
                DeudasActivas DECIMAL(18,2) DEFAULT 0,
                FondoEmergencia DECIMAL(18,2) DEFAULT 0,
                FechaActualizacion DATETIME DEFAULT GETDATE(),
                CONSTRAINT FK_Finanzas_Usuario FOREIGN KEY (UsuarioId) REFERENCES Usuarios(Id)
            )
        `;
        await request.query(finanzasQuery);
        console.log('Tabla FinanzasUsuario creada o ya existente.');

    } catch (err) {
        console.error('Error actualizando esquema:', err);
    } finally {
        process.exit(0);
    }
}

updateSchema();
