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

async function getIndexes() {
    try {
        await sql.connect(config);
        const request = new sql.Request();
        
        const result = await request.query(`
            SELECT t.name AS TableName, i.name AS IndexName, i.type_desc AS IndexType
            FROM sys.indexes i
            JOIN sys.tables t ON i.object_id = t.object_id
            WHERE i.type > 0
            ORDER BY t.name, i.name;
        `);
        
        console.table(result.recordset);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}
getIndexes();
