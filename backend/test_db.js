const sql = require('mssql');
const config = {
    user: 'jami_user',
    password: '6013',
    server: 'localhost',
    database: 'master',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};
sql.connect(config)
    .then(() => { console.log('Connected to master'); process.exit(0); })
    .catch(err => { console.error('Error:', err); process.exit(1); });
