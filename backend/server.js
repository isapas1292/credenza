const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const recommendationRoutes = require('./routes/recommendation.routes');
const authRoutes = require('./routes/auth.routes');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rutas
app.use('/api/auth', authRoutes); // Contiene register, login, y /usuarios/:id/perfil
app.use('/api/recommendations', recommendationRoutes);

// Middleware Global de Manejo de Errores
app.use((err, req, res, next) => {
    console.error('[Error Global]', err.stack);
    res.status(500).json({ error: 'Algo salió mal en el servidor', detalle: err.message });
});

async function startServer() {
    const result = await pool.query('SELECT now() AS ts');
    console.log('Conectado a la base de datos Supabase (PostgreSQL) —', result.rows[0].ts);
    app.listen(PORT, () => {
        console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
    });
}

startServer().catch((error) => {
    console.error('No fue posible iniciar el backend porque Supabase no está disponible:', error.message);
    process.exitCode = 1;
    pool.end().catch(() => {});
});
