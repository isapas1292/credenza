const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const RecommendationAiService = require('../services/recommendationAi.service');
const { verifyToken } = require('../middlewares/auth.middleware');

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const isNonNegativeNumber = (value) => value !== null
    && value !== ''
    && Number.isFinite(Number(value))
    && Number(value) >= 0;

function validateProduct(product) {
    if (!product || !hasText(product.name) || !hasText(product.product_category)) {
        return 'Completa el nombre y la categoría del producto';
    }
    if (!isNonNegativeNumber(product.price) || Number(product.price) <= 0) {
        return 'El precio o monto debe ser mayor que 0';
    }
    if (!hasText(product.purpose) || !hasText(product.main_constraint)) {
        return 'Completa el propósito y la prioridad principal';
    }

    const category = product.product_category.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (!['prestamo', 'seguro', 'hogar'].includes(category) && !hasText(product.lifespan)) {
        return 'Selecciona el tiempo de vida esperado';
    }
    if (category === 'hogar'
        && (!isNonNegativeNumber(product.square_meters) || Number(product.square_meters) <= 0
            || !isNonNegativeNumber(product.bedrooms) || !hasText(product.zone))) {
        return 'Completa los metros cuadrados, habitaciones y zona de la propiedad';
    }
    if (product.payment_method !== 'contado' && category !== 'seguro') {
        if (!isNonNegativeNumber(product.term_months) || Number(product.term_months) <= 0) {
            return 'El plazo financiado debe ser mayor que 0';
        }
        if (!isNonNegativeNumber(product.interest_rate)) {
            return 'La tasa de interés debe ser 0 o un número mayor';
        }
    }
    return null;
}

async function loadPersistedUserContext(userId) {
    const result = await pool.query(`
        SELECT u."Perfil",
               s."SegmentId", s."SegmentName", s."ProfileScore", s."Summary",
               s."FechaCreacion", s."FechaActualizacion"
        FROM "Usuarios" u
        LEFT JOIN "SegmentosFinancierosUsuario" s ON s."UsuarioId" = u."Id"
        WHERE u."Id" = $1
    `, [userId]);

    if (result.rows.length === 0 || !result.rows[0].Perfil) {
        return null;
    }
    const row = result.rows[0];
    return {
        perfil: row.Perfil,   // jsonb → ya es objeto
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
        const productError = validateProduct(productData);
        if (productError) {
            return res.status(400).json({ error: productError });
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

        // Guardar en HistorialAnalisis (no bloqueante)
        try {
            const score = result.data?.chosen_analysis?.recommendation_score || 0;
            const viable = !!(result.data?.chosen_analysis?.viable);
            const msg = result.data?.suggestion_text || '';
            const jsonRes = result.data || {};

            await pool.query(`
                INSERT INTO "HistorialAnalisis"
                    ("UsuarioId", "ProductoNombre", "ProductoPrecio", "ProductoCategoria",
                     "RecomendacionScore", "Viable", "MensajeSugerencia", "ResultadoCompletoJSON", "FechaAnalisis")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
            `, [
                userId,
                productData.name || 'Desconocido',
                productData.price || 0,
                productData.product_category || 'General',
                score,
                viable,
                msg,
                jsonRes,
            ]);
        } catch (err) {
            console.error('Error guardando historial:', err.message);
            // No detenemos el request por esto
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
        const productError = validateProduct(product);
        if (productError) {
            return res.status(400).json({ error: productError });
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
        const result = await pool.query(`
            SELECT "Id", "ProductoNombre", "ProductoPrecio", "ProductoCategoria",
                   "RecomendacionScore", "Viable", "MensajeSugerencia", "FechaAnalisis"
            FROM "HistorialAnalisis"
            WHERE "UsuarioId" = $1
            ORDER BY "FechaAnalisis" DESC
            LIMIT 200
        `, [userId]);
        res.json({ succeeded: true, data: result.rows });
    } catch (error) {
        console.error('Error obteniendo historial:', error.message);
        res.status(500).json({ error: 'Error al obtener el historial' });
    }
});

module.exports = router;
