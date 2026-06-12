const axios = require('axios');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

const RecommendationAiService = {

    /**
     * Envía el perfil del usuario y los datos del producto al servicio AI de Python
     * y obtiene una recomendación personalizada detallada.
     * @param {Object} perfil - Perfil financiero del usuario
     * @param {Object} productData - Datos del producto a analizar
     * @returns {Object} Respuesta con score, viabilidad, riesgo y explicaciones
     */
    async getRecommendation(perfil, productData, segment) {
        try {
            console.log(`[AI Service] Llamando a /product/recommend para análisis detallado...`);
            const response = await axios.post(`${AI_SERVICE_URL}/product/recommend`, {
                perfil,
                product: productData,
                segment
            });
            return response.data;
        } catch (error) {
            console.error('Error llamando al AI service:', error.message);
            if (error.response) {
                console.error('Detalle error AI:', error.response.data);
            }
            // Fallback: retornar un análisis básico si el servicio AI no está disponible
            return { 
                succeeded: false, 
                error: 'Servicio de IA no disponible',
                fallback: this.fallbackAnalysis(perfil, productData, segment),
                db_segment: segment
            };
        }
    },

    /**
     * Análisis de reglas básicas cuando el servicio AI no está disponible
     */
    fallbackAnalysis(perfil, product, segment) {
        const finances = perfil?.finances || perfil || {};
        const income = parseFloat(finances.monthlyIncome || finances.monthly_income_avg || 0);
        const fixed = parseFloat(finances.fixedExpenses || finances.fixed_expenses_monthly || 0);
        const debt = parseFloat(finances.activeDebts || finances.current_debt_payment_monthly || 0);
        
        const freeCashFlow = income - fixed - debt;
        const installment = parseFloat(product?.estimated_installment_monthly || product?.price / 24 || 0);

        let score = 0;
        let band = 'Riesgo alto';
        if (freeCashFlow > installment * 2) {
            score = 0.85;
            band = 'Viable saludable';
        } else if (freeCashFlow > installment) {
            score = 0.60;
            band = 'Viable con ajustes';
        } else {
            score = 0.30;
            band = 'No recomendable';
        }

        const analysis = {
            recommendation_score: score,
            risk_band_name: band,
            segment_name: segment?.segment_name || segment?.SegmentName || '',
            explanation: `Análisis de respaldo: El flujo libre estimado es ${freeCashFlow.toFixed(2)}.`,
            viable: freeCashFlow > installment,
            scenario_details: {
                type: 'usuario',
                name: 'Tu elección',
                installment: installment
            }
        };

        return {
            chosen_analysis: analysis,
            best_option: analysis,
            all_scenarios: [analysis],
            is_optimal: true,
            suggestion_text: 'Análisis basado en reglas de respaldo.',
            segment_name: segment?.segment_name || segment?.SegmentName || '',
            profile_segment: segment || null
        };
    }
};

module.exports = RecommendationAiService;
