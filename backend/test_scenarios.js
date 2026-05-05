const axios = require('axios');

async function testScenarios() {
    try {
        console.log('Testing Multi-Scenario Recommendation...');
        const response = await axios.post('http://localhost:3000/api/recommendations', {
            perfil: {
                finances: {
                    monthlyIncome: 120000,
                    fixedExpenses: 35000,
                    variableExpenses: 18000,
                    activeDebts: 12000,
                    emergencyFundMonths: 6
                },
                personal: {
                    employmentType: 'fixed',
                    dependents: 2
                }
            },
            productData: {
                product_category: 'vehicle',
                price: 950000,
                down_payment: 150000,
                payment_method: 'cuotas',
                term_months: 60,
                interest_rate: 0.14
            }
        });

        console.log('Full Data:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testScenarios();
