const http = require('http');

const data = JSON.stringify({
    nombre: "Prueba",
    email: "prueba@credenza.com",
    password: "password123",
    perfil: {
        personal: { age: 30 },
        finances: { monthlyIncome: 5000 }
    }
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/register',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
    }
};

const req = http.request(options, res => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => console.log('Response:', body));
});

req.on('error', e => console.error('Error:', e));
req.write(data);
req.end();
