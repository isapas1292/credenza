const express = require('express');
const router = express.Router();
const sql = require('mssql');
const RecommendationAiService = require('../services/recommendationAi.service');

/**
 * POST /api/recommendations
 * Cuerpo: { userId, productData, perfil? }
 * Si no se envía 'perfil', se busca en la base de datos usando 'userId'.
 */
router.post('/', async (req, res) => {
    try {
        let { userId, productData, perfil } = req.body;

        if (!productData) {
            return res.status(400).json({ error: 'Se requiere productData para el análisis' });
        }

        // Si no se proporcionó perfil en el request, lo buscamos en la BD
        if (!perfil && userId) {
            console.log(`[Backend] Buscando perfil en BD para usuario ${userId}...`);
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

        console.log(`[Backend] Solicitando análisis de recomendación para producto: ${productData.product_category || 'general'}`);
        const result = await RecommendationAiService.getRecommendation(perfil, productData);
        
        // También podemos traer el segmento actual de la tabla SegmentosFinancierosUsuario para complementar
        if (userId) {
            const segmentResult = await sql.query`SELECT * FROM SegmentosFinancierosUsuario WHERE UsuarioId = ${userId}`;
            if (segmentResult.recordset.length > 0) {
                result.db_segment = segmentResult.recordset[0];
            }
        }

        res.json(result);
    } catch (error) {
        console.error('Error en /api/recommendations:', error.message);
        res.status(500).json({ error: 'Error interno al generar la recomendación' });
    }
});

/**
 * POST /api/recommendations/analyze
 * Análisis rápido de compatibilidad (alias de la ruta principal o simplificado)
 */
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
