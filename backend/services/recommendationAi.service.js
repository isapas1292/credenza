const axios = require('axios');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

const RecommendationAiService = {

    /**
     * Envía el perfil del usuario y los datos del producto al servicio AI de Python
     * y obtiene una recomendación personalizada.
     * @param {Object} perfil - Perfil financiero del usuario (viene del JSON en BD)
     * @param {Object} productData - Datos del producto a analizar
     * @returns {Object} Respuesta con score, label y explicación
     */
    async getRecommendation(perfil, productData) {
        try {
            const response = await axios.post(`${AI_SERVICE_URL}/recommend`, {
                perfil,
                product: productData
            });
            return response.data;
        } catch (error) {
            console.error('Error llamando al AI service:', error.message);
            // Fallback: retornar un análisis básico si el servicio AI no está disponible
            return this.fallbackAnalysis(perfil, productData);
        }
    },

    /**
     * Análisis de compatibilidad financiera sin IA (fallback)
     */
    async analyzeCompatibility(perfil, product) {
        try {
            const response = await axios.post(`${AI_SERVICE_URL}/analyze`, {
                perfil,
                product
            });
            return response.data;
        } catch (error) {
            console.error('AI service no disponible, usando fallback:', error.message);
            return this.fallbackAnalysis(perfil, product);
        }
    },

    /**
     * Análisis de reglas básicas cuando el servicio AI no está disponible
     */
    fallbackAnalysis(perfil, product) {
        const f = perfil?.finances || {};
        const monthlyIncome = f.monthlyIncome || 0;
        const fixedExpenses = f.fixedExpenses || 0;
        const activeDebts = f.activeDebts || 0;
        const freeCashFlow = monthlyIncome - fixedExpenses - activeDebts;
        const maxDebtCapacity = freeCashFlow * 0.5;

        const productCost = product?.price || 0;
        const installment = product?.monthlyInstallment || (productCost / 24);

        let score = 0;
        let label = 'No recomendado';
        let explanation = '';

        if (installment <= maxDebtCapacity * 0.3) {
            score = 90;
            label = 'Recomendado';
            explanation = 'La cuota mensual es cómoda para tu capacidad financiera actual.';
        } else if (installment <= maxDebtCapacity * 0.6) {
            score = 65;
            label = 'Con cautela';
            explanation = 'La cuota representa un esfuerzo moderado sobre tu presupuesto libre.';
        } else {
            score = 30;
            label = 'No recomendado';
            explanation = 'La cuota supera el 60% de tu capacidad máxima de endeudamiento.';
        }

        return {
            score,
            label,
            explanation,
            details: {
                freeCashFlow,
                maxDebtCapacity,
                estimatedInstallment: installment,
                source: 'fallback-rules'
            }
        };
    }
};

module.exports = RecommendationAiService;
