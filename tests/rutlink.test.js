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
const { limpiarUrl } = require('../rutlink/validarUrl');

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

test('Rutlink: enlaces que no son http:// ni https:// se rechazan con 400 (no se guarda nada)', async () => {
    const malos = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///C:/Windows/system32',
        'ftp://ejemplo.com/archivo',
        'google.com',           // sin http:// delante
        'hola que tal',
        123,                    // no es texto
        ['https://ejemplo.com'], // una lista, no un texto
    ];
    for (const urlOriginal of malos) {
        const res = await request(app).post('/api/enlaces').send({ urlOriginal });
        assert.strictEqual(res.status, 400, String(urlOriginal));
        assert.deepStrictEqual(res.body, { error: 'La URL debe empezar por http:// o https://' });
    }
});

test('Rutlink: limpiarUrl acepta http y https (también muy largas) y rechaza el resto', () => {
    assert.strictEqual(limpiarUrl('https://ejemplo.com/ruta?a=1'), 'https://ejemplo.com/ruta?a=1');
    assert.strictEqual(limpiarUrl('  http://ejemplo.com  '), 'http://ejemplo.com/');
    assert.strictEqual(limpiarUrl('HTTPS://Ejemplo.com'), 'https://ejemplo.com/');
    const larga = 'https://ejemplo.com/?q=' + 'a'.repeat(5000);
    assert.strictEqual(limpiarUrl(larga), larga, 'sin límite de tamaño propio');
    for (const malo of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' data:text/html,hola', 'mailto:a@b.com', 'https://', '', null, undefined, {}]) {
        assert.strictEqual(limpiarUrl(malo), null, String(malo));
    }
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
