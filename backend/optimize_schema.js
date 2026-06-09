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

async function optimizeDb() {
    try {
        await sql.connect(config);
        const request = new sql.Request();
        
        console.log('Optimizing schema...');

        // 1. Add Unique Constraint on Usuarios.Email if it doesn't exist
        try {
            await request.query(`
                IF NOT EXISTS (
                    SELECT * 
                    FROM sys.indexes 
                    WHERE name='UQ_Usuarios_Email' AND object_id = OBJECT_ID('Usuarios')
                )
                BEGIN
                    ALTER TABLE Usuarios
                    ADD CONSTRAINT UQ_Usuarios_Email UNIQUE (Email);
                    PRINT 'Added Unique Constraint to Usuarios.Email';
                END
                ELSE BEGIN
                    PRINT 'Unique Constraint on Usuarios.Email already exists';
                END
            `);
        } catch (err) {
            console.error('Error adding UQ to Usuarios.Email (Possible duplicates?):', err.message);
        }

        // 2. Add Index on SegmentosFinancierosUsuario.UsuarioId
        try {
            await request.query(`
                IF NOT EXISTS (
                    SELECT * 
                    FROM sys.indexes 
                    WHERE name='IX_SegmentosFinancierosUsuario_UsuarioId' AND object_id = OBJECT_ID('SegmentosFinancierosUsuario')
                )
                BEGIN
                    CREATE NONCLUSTERED INDEX IX_SegmentosFinancierosUsuario_UsuarioId ON SegmentosFinancierosUsuario(UsuarioId);
                    PRINT 'Added Index to SegmentosFinancierosUsuario.UsuarioId';
                END
            `);
        } catch (err) {
            console.error('Error adding Index IX_SegmentosFinancierosUsuario_UsuarioId:', err.message);
        }

        // 3. Add Index on HistorialAnalisis.UsuarioId
        try {
            await request.query(`
                IF NOT EXISTS (
                    SELECT * 
                    FROM sys.indexes 
                    WHERE name='IX_HistorialAnalisis_UsuarioId' AND object_id = OBJECT_ID('HistorialAnalisis')
                )
                BEGIN
                    CREATE NONCLUSTERED INDEX IX_HistorialAnalisis_UsuarioId ON HistorialAnalisis(UsuarioId);
                    PRINT 'Added Index to HistorialAnalisis.UsuarioId';
                END
            `);
        } catch (err) {
            console.error('Error adding Index IX_HistorialAnalisis_UsuarioId:', err.message);
        }

        // 4. FinanzasUsuario already has a UNIQUE constraint on UsuarioId, which implies an index.
        console.log('Optimization finished.');
    } catch (err) {
        console.error('Connection Error:', err);
    } finally {
        process.exit(0);
    }
}
optimizeDb();
