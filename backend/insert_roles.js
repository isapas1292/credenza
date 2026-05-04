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
            IF NOT EXISTS (SELECT * FROM Roles WHERE Id = 1)
            BEGIN
                SET IDENTITY_INSERT Roles ON;
                INSERT INTO Roles (Id, Nombre) VALUES (1, 'User');
                SET IDENTITY_INSERT Roles OFF;
            END
            IF NOT EXISTS (SELECT * FROM Roles WHERE Id = 2)
            BEGIN
                SET IDENTITY_INSERT Roles ON;
                INSERT INTO Roles (Id, Nombre) VALUES (2, 'Admin');
                SET IDENTITY_INSERT Roles OFF;
            END
        `);
        console.log("Roles insertados.");
        process.exit(0);
    } catch (e) {
        console.error("Error insertando roles:", e.message);
        // Maybe IDENTITY_INSERT is not needed if Id is not identity, try without it
        try {
            const request2 = new sql.Request();
            await request2.query(`
                IF NOT EXISTS (SELECT * FROM Roles WHERE Id = 1)
                BEGIN
                    INSERT INTO Roles (Nombre) VALUES ('User');
                END
            `);
            console.log("Roles insertados sin identity_insert.");
            process.exit(0);
        } catch (e2) {
             console.error("Error 2:", e2.message);
             process.exit(1);
        }
    }
});
