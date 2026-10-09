// tests/seguridad.test.js
// Pruebas de seguridad que NO necesitan base de datos: la API rechaza
// peticiones mal formadas antes de llegar a MySQL.
const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');

// Token de prueba firmado con tu JWT_SECRET (se lee del .env, nunca se muestra)
const tokenValido = () =>
    jwt.sign({ id: 999999, nombre: 'Prueba' }, process.env.JWT_SECRET, { expiresIn: '5m' });

test('JSON mal formado devuelve 400 en JSON, sin detalles internos', async () => {
    const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": ');
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.mensaje);
    assert.doesNotMatch(res.text, /at .*\.js/); // no enseña rutas del código
});

test('login sin datos devuelve 400', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    assert.strictEqual(res.status, 400);
});

test('login con email que no es texto devuelve 400', async () => {
    const res = await request(app)
        .post('/api/auth/login')
        .send({ email: { email: 1 }, contrasena: 'x' });
    assert.strictEqual(res.status, 400);
});

test('registro con campos vacíos devuelve 400', async () => {
    const res = await request(app)
        .post('/api/auth/register')
        .send({ nombre: '  ', email: 'a@b.com', contrasena: 'x' });
    assert.strictEqual(res.status, 400);
});

test('token con formato incorrecto devuelve 401', async () => {
    const res = await request(app).get('/api/tareas').set('Authorization', 'abc');
    assert.strictEqual(res.status, 401);
});

test('token falso devuelve 403', async () => {
    const res = await request(app).get('/api/tareas').set('Authorization', 'Bearer esto.no.vale');
    assert.strictEqual(res.status, 403);
});

test('token firmado con algoritmo "none" se rechaza', async () => {
    const falso = jwt.sign({ id: 1 }, '', { algorithm: 'none' });
    const res = await request(app).get('/api/tareas').set('Authorization', `Bearer ${falso}`);
    assert.strictEqual(res.status, 403);
});

test('editar con id no numérico devuelve 400', async () => {
    const res = await request(app)
        .put('/api/tareas/abc')
        .set('Authorization', `Bearer ${tokenValido()}`)
        .send({ titulo: 'x' });
    assert.strictEqual(res.status, 400);
});

test('borrar con id no numérico devuelve 400', async () => {
    const res = await request(app)
        .delete('/api/tareas/1.5')
        .set('Authorization', `Bearer ${tokenValido()}`);
    assert.strictEqual(res.status, 400);
});

test('crear tarea sin título devuelve 400', async () => {
    const res = await request(app)
        .post('/api/tareas')
        .set('Authorization', `Bearer ${tokenValido()}`)
        .send({ descripcion: 'sin título' });
    assert.strictEqual(res.status, 400);
});

test('ids raros como 1e3, 0x10 o 0 devuelven 400', async () => {
    for (const idRaro of ['1e3', '0x10', '0', '-5', '99999999999']) {
        const res = await request(app)
            .delete(`/api/tareas/${idRaro}`)
            .set('Authorization', `Bearer ${tokenValido()}`);
        assert.strictEqual(res.status, 400, `el id "${idRaro}" debería dar 400`);
    }
});

test('registro con contraseña débil devuelve 400 y explica qué falta', async () => {
    const res = await request(app)
        .post('/api/auth/register')
        .send({ nombre: 'Ana', email: 'ana@tachit.test', contrasena: 'abcdefgh' });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.mensaje, /mayúscula/);
    assert.ok(Array.isArray(res.body.errores));
    assert.doesNotMatch(res.text, /abcdefgh/); // nunca devuelve la contraseña enviada
});

test('crear tarea con fecha imposible devuelve 400', async () => {
    const res = await request(app)
        .post('/api/tareas')
        .set('Authorization', `Bearer ${tokenValido()}`)
        .send({ titulo: 'Tarea', fecha_limite: '2026-13-45' });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.mensaje, /fecha/);
});

test('sin token se responde 401 ANTES de mirar los datos', async () => {
    const res = await request(app).post('/api/tareas').send({ titulo: '' });
    assert.strictEqual(res.status, 401);
});

test('si llega una lista en vez de un objeto, 400 con mensaje en español', async () => {
    const res = await request(app).post('/api/auth/login').send([1, 2, 3]);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.mensaje, 'Los datos enviados no tienen el formato correcto');
});
