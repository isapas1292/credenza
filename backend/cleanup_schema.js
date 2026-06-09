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

const tablesToDrop = [
    // Tables with Foreign Keys first
    'UsuarioActivosInteres',
    'PerfilesPreferencias',
    'PerfilesPersonales',
    'PerfilesObjetivos',
    'PerfilesFinancieros',

    // Lookup tables
    'ActivosInteres',
    'CategoriasInteres',
    'EstadosCiviles',
    'EstilosDecision',
    'ExperienciasInversion',
    'FrecuenciasAporte',
    'HorizontesDecision',
    'InteresesInversion',
    'NecesidadesLiquidez',
    'NivelesUrgencia',
    'ObjetivosPrincipales',
    'OpcionesComportamientoConsumo',
    'OpcionesCompraCostosa',
    'OpcionesControlGastos',
    'RetornosEsperados',
    'SituacionesLaborales',
    'ToleranciasRiesgo'
];

async function cleanupDb() {
    try {
        await sql.connect(config);
        const request = new sql.Request();
        
        for (const tableName of tablesToDrop) {
            try {
                await request.query(`
                    IF EXISTS (SELECT * FROM sysobjects WHERE name='${tableName}' and xtype='U')
                    DROP TABLE ${tableName}
                `);
                console.log(`Table ${tableName} dropped or does not exist.`);
            } catch (err) {
                console.error(`Error dropping table ${tableName}:`, err.message);
            }
        }
        
        console.log('Cleanup finished.');
    } catch (err) {
        console.error('Connection Error:', err);
    } finally {
        process.exit(0);
    }
}
cleanupDb();
