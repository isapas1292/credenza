const express = require('express');
const router = express.Router();
const RecommendationAiService = require('../services/recommendationAi.service');

// POST /api/recommendations
router.post('/', async (req, res) => {
    try {
        const { userId, productData, perfil } = req.body;
        if (!productData || !perfil) {
            return res.status(400).json({ error: 'Se requieren productData y perfil' });
        }
        const result = await RecommendationAiService.getRecommendation(perfil, productData);
        res.json(result);
    } catch (error) {
        console.error('Error en /api/recommendations:', error.message);
        res.status(500).json({ error: 'Error interno al generar la recomendación' });
    }
});

// POST /api/recommendations/analyze
router.post('/analyze', async (req, res) => {
    try {
        const { perfil, product } = req.body;
        if (!perfil || !product) {
            return res.status(400).json({ error: 'perfil y product son requeridos' });
        }
        const result = await RecommendationAiService.analyzeCompatibility(perfil, product);
        res.json(result);
    } catch (error) {
        console.error('Error en /api/recommendations/analyze:', error.message);
        res.status(500).json({ error: 'Error al analizar compatibilidad' });
    }
});

module.exports = router;
