// tests/cabeceras.test.js
// Comprueba las defensas del paso 4 de la Fase 3: helmet (cabeceras de seguridad) y CORS limitado.
const { test, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../app');
const { poolRutlink, poolTareas } = require('../db');

after(async () => {
    await poolRutlink.promise().end();
    await poolTareas.promise().end();
});

test('helmet: añade cabeceras de seguridad y oculta X-Powered-By', async () => {
    const res = await request(app).get('/');
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(res.headers['x-frame-options'], 'SAMEORIGIN');
    assert.ok(res.headers['strict-transport-security']);
    assert.ok(res.headers['content-security-policy']);
    assert.strictEqual(res.headers['x-powered-by'], undefined);
});

test('CORS: una web permitida recibe permiso', async () => {
    const res = await request(app).get('/').set('Origin', 'https://kmtask.vercel.app');
    assert.strictEqual(res.headers['access-control-allow-origin'], 'https://kmtask.vercel.app');
});

test('CORS: la pregunta previa (preflight) de una web permitida recibe permiso', async () => {
    const res = await request(app)
        .options('/api/auth/login')
        .set('Origin', 'https://rutlink.vercel.app')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type');
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers['access-control-allow-origin'], 'https://rutlink.vercel.app');
});

test('CORS: una web desconocida NO recibe permiso', async () => {
    const res = await request(app)
        .options('/api/auth/login')
        .set('Origin', 'https://web-maliciosa.example')
        .set('Access-Control-Request-Method', 'POST');
    assert.strictEqual(res.headers['access-control-allow-origin'], undefined);
});

test('CORS: una web con nombre parecido tampoco recibe permiso', async () => {
    const res = await request(app).get('/').set('Origin', 'https://kmtask.vercel.app.evil.example');
    assert.strictEqual(res.headers['access-control-allow-origin'], undefined);
});

test('Sin Origin (Postman, UptimeRobot, abrir un enlace de Rutlink) sigue funcionando', async () => {
    const res = await request(app).get('/');
    assert.strictEqual(res.status, 200);
});
