// tests/rutlink.test.js
// Rutlink (el acortador de URLs) vive en el mismo servidor que Tachit.
// Estas pruebas comprueban que los cambios de Tachit NO le han afectado.
//
// SEGURIDAD: Rutlink no tiene base de datos de pruebas, usa la real (defaultdb).
// Por eso aquí SOLO hay pruebas que no escriben nada:
//   - leer los últimos enlaces (solo lectura),
//   - pedir un código que no puede existir (no suma clics a nadie),
//   - enviar datos incorrectos (se rechazan antes de llegar a la base de datos).
// No se crea ningún enlace.
const { test, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../app');
const { poolRutlink, poolTareas } = require('../db');

after(async () => {
    await poolRutlink.promise().end();
    await poolTareas.end();
});

test('Rutlink: listar los últimos enlaces sigue funcionando (solo lectura)', async () => {
    const res = await request(app).get('/api/enlaces');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length <= 3);
});

test('Rutlink: un código que no existe devuelve 404 con su mensaje de siempre', async () => {
    // Los códigos de Rutlink tienen 6 caracteres: uno de 20 no puede existir
    const res = await request(app).get('/codigo-de-prueba-xx');
    assert.strictEqual(res.status, 404);
    assert.deepStrictEqual(res.body, { error: 'Enlace no encontrado' });
});

test('Rutlink: crear un enlace sin URL devuelve 400 (no se guarda nada)', async () => {
    const res = await request(app).post('/api/enlaces').send({});
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(res.body, { error: 'Falta la URL original' });
});

test('Rutlink: un JSON mal formado devuelve 400 sin detalles internos (no se guarda nada)', async () => {
    const res = await request(app)
        .post('/api/enlaces')
        .set('Content-Type', 'application/json')
        .send('{"urlOriginal": ');
    assert.strictEqual(res.status, 400);
    assert.doesNotMatch(res.text, /at .*\.js/);
});

test('las rutas de Tachit no las "captura" Rutlink', async () => {
    // /:codigo de Rutlink solo atrapa rutas de UN trozo; las de Tachit tienen dos (/api/...)
    for (const url of ['/api/tareas', '/api/categorias', '/api/ajustes']) {
        const res = await request(app).get(url);
        assert.strictEqual(res.status, 401, url);
    }
});
