const express = require('express');
const router = express.Router();
const sql = require('mssql');
const RecommendationAiService = require('../services/recommendationAi.service');
const { verifyToken } = require('../middlewares/auth.middleware');

async function loadPersistedUserContext(userId) {
    const dbReq = new sql.Request();
    dbReq.input('UsuarioId', sql.Int, userId);
    const result = await dbReq.query(`
        SELECT u.Perfil, s.SegmentId, s.SegmentName, s.ProfileScore, s.Summary,
               s.FechaCreacion, s.FechaActualizacion
        FROM Usuarios u
        LEFT JOIN SegmentosFinancierosUsuario s ON s.UsuarioId = u.Id
        WHERE u.Id = @UsuarioId
    `);
    if (result.recordset.length === 0 || !result.recordset[0].Perfil) {
        return null;
    }
    const row = result.recordset[0];
    return {
        perfil: JSON.parse(row.Perfil),
        segment: row.SegmentId ? {
            segment_id: row.SegmentId,
            segment_name: row.SegmentName,
            profile_score: row.ProfileScore,
            summary: row.Summary,
            created_at: row.FechaCreacion,
            updated_at: row.FechaActualizacion,
        } : null,
    };
}

router.post('/', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { productData } = req.body;

        if (!productData) {
            return res.status(400).json({ error: 'Se requiere productData para el análisis' });
        }

        const context = await loadPersistedUserContext(userId);
        if (!context) {
            return res.status(404).json({ error: 'Perfil de usuario no encontrado en la base de datos' });
        }
        if (!context.segment) {
            return res.status(409).json({ error: 'El usuario no tiene un segmento financiero persistido. Actualiza su perfil antes de analizar.' });
        }

        const result = await RecommendationAiService.getRecommendation(context.perfil, productData, context.segment);

        result.db_segment = context.segment;

        if (userId) {
            // Guardar en HistorialAnalisis
            try {
                const histReq = new sql.Request();
                const score = result.data?.chosen_analysis?.recommendation_score || 0;
                const viable = result.data?.chosen_analysis?.viable ? 1 : 0;
                const msg = result.data?.suggestion_text || '';
                const jsonRes = JSON.stringify(result.data || {});

                histReq.input('UsuarioId', sql.Int, userId);
                histReq.input('ProductoNombre', sql.NVarChar(255), productData.name || 'Desconocido');
                histReq.input('ProductoPrecio', sql.Decimal(18, 2), productData.price || 0);
                histReq.input('ProductoCategoria', sql.NVarChar(100), productData.product_category || 'General');
                histReq.input('Score', sql.Decimal(5, 2), score);
                histReq.input('Viable', sql.Bit, viable);
                histReq.input('Mensaje', sql.NVarChar(1000), msg);
                histReq.input('Json', sql.NVarChar(sql.MAX), jsonRes);

                await histReq.query(`
                    INSERT INTO HistorialAnalisis (UsuarioId, ProductoNombre, ProductoPrecio, ProductoCategoria, RecomendacionScore, Viable, MensajeSugerencia, ResultadoCompletoJSON, FechaAnalisis)
                    VALUES (@UsuarioId, @ProductoNombre, @ProductoPrecio, @ProductoCategoria, @Score, @Viable, @Mensaje, @Json, GETDATE())
                `);
            } catch (err) {
                console.error('Error guardando historial:', err);
                // No detenemos el request por esto
            }
        }

        res.json(result);
    } catch (error) {
        console.error('Error en /api/recommendations:', error.message);
        res.status(500).json({ error: 'Error interno al generar la recomendación' });
    }
});

router.post('/analyze', verifyToken, async (req, res) => {
    try {
        const { product } = req.body;
        if (!product) {
            return res.status(400).json({ error: 'product es requerido' });
        }
        const context = await loadPersistedUserContext(req.user.id);
        if (!context?.segment) {
            return res.status(409).json({ error: 'El usuario no tiene un segmento financiero persistido.' });
        }
        const result = await RecommendationAiService.getRecommendation(context.perfil, product, context.segment);
        result.db_segment = context.segment;
        res.json(result);
    } catch (error) {
        console.error('Error en /api/recommendations/analyze:', error.message);
        res.status(500).json({ error: 'Error al analizar compatibilidad' });
    }
});

// Historial de análisis del usuario autenticado (solo el suyo, vía token).
router.get('/history', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const dbReq = new sql.Request();
        dbReq.input('UsuarioId', sql.Int, userId);
        const result = await dbReq.query(`
            SELECT TOP 200
                Id, ProductoNombre, ProductoPrecio, ProductoCategoria,
                RecomendacionScore, Viable, MensajeSugerencia, FechaAnalisis
            FROM HistorialAnalisis
            WHERE UsuarioId = @UsuarioId
            ORDER BY FechaAnalisis DESC
        `);
        res.json({ succeeded: true, data: result.recordset });
    } catch (error) {
        console.error('Error obteniendo historial:', error.message);
        res.status(500).json({ error: 'Error al obtener el historial' });
    }
});

module.exports = router;
