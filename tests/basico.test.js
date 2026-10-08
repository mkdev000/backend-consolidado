// tests/basico.test.js
// Primeras pruebas automáticas: comprueban que la app arranca y que las tareas están protegidas.
const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../app');

test('GET / responde que el servidor funciona', async () => {
    const res = await request(app).get('/');
    assert.strictEqual(res.status, 200);
    assert.match(res.text, /funcionando/);
});

test('GET /api/tareas sin token devuelve 401', async () => {
    const res = await request(app).get('/api/tareas');
    assert.strictEqual(res.status, 401);
});
