const express = require('express');
const router = express.Router();
const sql = require('mssql');
const RecommendationAiService = require('../services/recommendationAi.service');

router.post('/', async (req, res) => {
    try {
        let { userId, productData, perfil } = req.body;

        if (!productData) {
            return res.status(400).json({ error: 'Se requiere productData para el análisis' });
        }

        if (!perfil && userId) {
            const result = await sql.query`SELECT Perfil FROM Usuarios WHERE Id = ${userId}`;
            if (result.recordset.length > 0 && result.recordset[0].Perfil) {
                perfil = JSON.parse(result.recordset[0].Perfil);
            } else {
                return res.status(404).json({ error: 'Perfil de usuario no encontrado en la base de datos' });
            }
        }

        if (!perfil) {
            return res.status(400).json({ error: 'Se requiere perfil o userId válido para el análisis' });
        }

        const result = await RecommendationAiService.getRecommendation(perfil, productData);

        if (userId) {
            const segmentResult = await sql.query`SELECT * FROM SegmentosFinancierosUsuario WHERE UsuarioId = ${userId}`;
            if (segmentResult.recordset.length > 0) {
                result.db_segment = segmentResult.recordset[0];
            }

            // [NUEVO] Guardar en HistorialAnalisis
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

router.post('/analyze', async (req, res) => {
    try {
        const { perfil, product } = req.body;
        if (!perfil || !product) {
            return res.status(400).json({ error: 'perfil y product son requeridos' });
        }
        const result = await RecommendationAiService.getRecommendation(perfil, product);
        res.json(result);
    } catch (error) {
        console.error('Error en /api/recommendations/analyze:', error.message);
        res.status(500).json({ error: 'Error al analizar compatibilidad' });
    }
});

module.exports = router;
