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

async function getDBInfo() {
    try {
        await sql.connect(config);
        const request = new sql.Request();
        
        const result = await request.query(`
            SELECT t.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE 
            FROM INFORMATION_SCHEMA.TABLES t
            JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME
            WHERE t.TABLE_TYPE = 'BASE TABLE'
            ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION
        `);
        
        const tables = {};
        for (const row of result.recordset) {
            if (!tables[row.TABLE_NAME]) tables[row.TABLE_NAME] = [];
            tables[row.TABLE_NAME].push(`${row.COLUMN_NAME} (${row.DATA_TYPE})`);
        }
        
        console.log(JSON.stringify(tables, null, 2));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}
getDBInfo();
