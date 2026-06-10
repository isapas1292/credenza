const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const recommendationRoutes = require('./routes/recommendation.routes');
const authRoutes = require('./routes/auth.routes');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rutas
app.use('/api/auth', authRoutes); // Contiene register, login, y /usuarios/:id/perfil
app.use('/api/recommendations', recommendationRoutes);

// Configuración de la base de datos
// Configuración de la base de datos (vía variables de entorno en producción).
// Los valores por defecto permiten el desarrollo local sin configuración extra.
const dbConfig = {
    user: process.env.DB_USER || 'jami_user',
    password: process.env.DB_PASSWORD || '6013',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'Credenza',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_CERT !== 'false'
    }
};

// Conectar a la base de datos e inicializar
async function initDb() {
    try {
        await sql.connect(dbConfig);
        console.log('Conectado a la base de datos SQL Server (Credenza)');
    } catch (error) {
        console.error('Error al conectar a la base de datos:', error.message);
    }
}
initDb();

// Middleware Global de Manejo de Errores
app.use((err, req, res, next) => {
    console.error('[Error Global]', err.stack);
    res.status(500).json({ error: 'Algo salió mal en el servidor', detalle: err.message });
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});
