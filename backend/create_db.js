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

async function setupDb() {
    try {
        await sql.connect(config);
        const request = new sql.Request();
        
        console.log('Granting access to jami_user for Credenza database...');
        // We might not be able to do this if jami_user is not a sysadmin, but let's try.
        // Wait, jami_user might not have permission to alter any login or create user.
        // If jami_user is not sysadmin, we can't grant permissions.
        // Alternatively, maybe jami_user DOES have access but there is a typo in DB name?
        // Let's run `USE Credenza` from master to see if it works.
        await request.query(`USE Credenza`);
        console.log('Successfully switched to Credenza database.');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}
setupDb();
