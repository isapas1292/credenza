const fs = require('fs');
const path = require('path');

const apiUrl = (process.env.API_URL || 'https://credenza.onrender.com').trim().replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(apiUrl)) {
    throw new Error('API_URL es obligatoria y debe ser una URL HTTPS válida, sin rutas adicionales');
}

const output = `export const environment = {
  production: true,
  apiUrl: '${apiUrl}'
};
`;

fs.writeFileSync(
    path.resolve(__dirname, '..', 'src', 'environments', 'environment.production.ts'),
    output,
    'utf8'
);
console.log(`Configuración de producción generada para ${apiUrl}`);
