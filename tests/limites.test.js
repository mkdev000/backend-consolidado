// tests/limites.test.js
// Comprueba los límites de intentos del paso 5 de la Fase 3 (defensa contra la fuerza bruta).
// Usamos datos que NO pasan la validación (400): cuentan como intento fallido
// y no hace falta tocar la base de datos.
const { test, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../app');
const { poolRutlink, poolTareas } = require('../db');

after(async () => {
    app.set('trust proxy', 0);
    await poolRutlink.promise().end();
    await poolTareas.promise().end();
});

// Para simular usuarios con IPs distintas, en estas pruebas confiamos en 1 proxy
// y mandamos la cabecera X-Forwarded-For (es lo que haría Render).
app.set('trust proxy', 1);

const loginFallido = (ip, email = 'nadie@tachit.test') =>
    request(app).post('/api/auth/login').set('X-Forwarded-For', ip).send({ email, contrasena: '' });

test('login: el 6.º intento fallido en un minuto desde la misma IP recibe 429', async () => {
    for (let i = 1; i <= 5; i++) {
        const res = await loginFallido('203.0.113.1', `ip-${i}@tachit.test`);
        assert.strictEqual(res.status, 400, `el intento ${i} todavía debe llegar a la validación`);
    }
    const res = await loginFallido('203.0.113.1', 'ip-6@tachit.test');
    assert.strictEqual(res.status, 429);
    assert.match(res.body.mensaje, /Demasiados intentos/);
    assert.ok(res.headers['ratelimit'], 'debe decir cuánto falta con la cabecera RateLimit');
});

test('login: otra IP distinta no se ve afectada', async () => {
    const res = await loginFallido('203.0.113.2', 'otra@tachit.test');
    assert.strictEqual(res.status, 400);
});

test('login: una cuenta se bloquea tras 10 fallos aunque cambien de IP', async () => {
    for (let i = 1; i <= 10; i++) {
        const res = await loginFallido(`198.51.100.${i}`, 'Victima@Tachit.test');
        assert.strictEqual(res.status, 400, `el intento ${i} todavía debe llegar a la validación`);
    }
    // Mismo email con mayúsculas y espacios distintos: cuenta como la misma cuenta
    const res = await loginFallido('198.51.100.99', '  victima@tachit.TEST ');
    assert.strictEqual(res.status, 429);
    assert.match(res.body.mensaje, /esta cuenta/);
});

test('registro: el 11.º registro en una hora desde la misma IP recibe 429', async () => {
    for (let i = 1; i <= 10; i++) {
        const res = await request(app).post('/api/auth/register').set('X-Forwarded-For', '192.0.2.1').send({});
        assert.strictEqual(res.status, 400);
    }
    const res = await request(app).post('/api/auth/register').set('X-Forwarded-For', '192.0.2.1').send({});
    assert.strictEqual(res.status, 429);
});

test('la respuesta 429 también lleva el permiso CORS (el frontend puede leer el mensaje)', async () => {
    const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', 'https://kmtask.vercel.app')
        .set('X-Forwarded-For', '203.0.113.1')
        .send({ email: 'x@tachit.test', contrasena: '' });
    assert.strictEqual(res.status, 429);
    assert.strictEqual(res.headers['access-control-allow-origin'], 'https://kmtask.vercel.app');
});
