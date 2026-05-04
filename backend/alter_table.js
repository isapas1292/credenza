const sql = require('mssql');
const config = {
    user: 'jami_user',
    password: '6013',
    server: 'localhost',
    database: 'Credenza',
    options: { encrypt: false, trustServerCertificate: true }
};

sql.connect(config).then(async () => {
    try {
        const request = new sql.Request();
        await request.query(`
            IF COL_LENGTH('Usuarios', 'Perfil') IS NULL
            BEGIN
                ALTER TABLE Usuarios ADD Perfil NVARCHAR(MAX) NULL
                PRINT 'Columna Perfil añadida'
            END
        `);
        console.log("Tabla Usuarios alterada.");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
});
