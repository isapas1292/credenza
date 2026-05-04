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
        const result = await sql.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Usuarios'`);
        console.log(result.recordset);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
});
