// tests/google.test.js
// Pruebas de "Continuar con Google" (Fase 3, paso 8.2).
// Google se sustituye por un DOBLE DE PRUEBA: estas pruebas nunca se conectan a Google
// ni necesitan el Client ID o el secreto de verdad.
//  - Las del principio no tocan la base de datos (se ejecutan siempre).
//  - Las del final solo se ejecutan en la base de datos de PRUEBAS (_dev) y borran sus usuarios al acabar.
const { test, after, mock } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const request = require('supertest');
const app = require('../app');
const google = require('../tareas/google');
const { dbTareas, poolTareas, poolRutlink } = require('../db');

const nombreBD = process.env.DB_NAME_TAREAS || '';
const esBDPruebas = nombreBD.endsWith('_dev');
const opcionesBD = esBDPruebas ? {} : { skip: 'No es la base de datos de pruebas (_dev): no se ejecuta' };

// Cada petición sale de una IP distinta, para que el límite de intentos (5 fallos/minuto)
// no interfiera entre pruebas. Igual que en limites.test.js.
app.set('trust proxy', 1);
let ultimaIp = 0;
const desdeOtraIp = (peticion) => peticion.set('X-Forwarded-For', `203.0.113.${(ultimaIp = (ultimaIp % 250) + 1)}`);
const entrarConGoogle = (codigo) => desdeOtraIp(request(app).post('/api/auth/google')).send({ codigo });
const entrarConContrasena = (email, contrasena) =>
    desdeOtraIp(request(app).post('/api/auth/login')).send({ email, contrasena });

// ---------- El doble de Google ----------
// Cada "código" de prueba corresponde a una persona inventada.
const personas = new Map();
mock.method(google, 'estaConfigurado', () => true);
mock.method(google, 'obtenerDatosDeGoogle', async (codigo) => {
    if (!personas.has(codigo)) throw new google.ErrorGoogle(401, 'No hemos podido comprobar tu cuenta de Google. Inténtalo de nuevo.');
    return { ...personas.get(codigo) };
});

const marca = `${Date.now()}-${crypto.randomInt(1e6)}`;
const emailsDePrueba = [];
function persona(codigo, datos) {
    const email = `${codigo}-${marca}@tachit.test`;
    emailsDePrueba.push(email);
    personas.set(codigo, { sub: `sub-${codigo}-${marca}`, email, emailDeFiar: true, nombre: `Prueba ${codigo}`, ...datos });
    return personas.get(codigo);
}

after(async () => {
    app.set('trust proxy', 0);
    mock.restoreAll();
    if (esBDPruebas && emailsDePrueba.length) {
        await dbTareas.query('DELETE FROM usuarios WHERE email IN (?)', [emailsDePrueba]);
    }
    await poolTareas.promise().end();
    await poolRutlink.promise().end();
});

// ---------- Sin base de datos ----------

test('Google: sin código responde 400 con mensaje en español', async () => {
    const res = await desdeOtraIp(request(app).post('/api/auth/google')).send({});
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.mensaje, 'Falta el código de Google');
});

test('Google: un código gigante se rechaza antes de llamar a Google', async () => {
    const llamadasAntes = google.obtenerDatosDeGoogle.mock.callCount();
    const res = await entrarConGoogle('x'.repeat(5000));
    assert.strictEqual(res.status, 400);
    assert.strictEqual(google.obtenerDatosDeGoogle.mock.callCount(), llamadasAntes);
});

test('Google: un código falso o caducado responde 401 sin detalles internos', async () => {
    const res = await entrarConGoogle('codigo-inventado');
    assert.strictEqual(res.status, 401);
    assert.match(res.body.mensaje, /cuenta de Google/);
    assert.strictEqual(res.body.token, undefined);
});

test('Google: si faltan las claves en el servidor responde 503', async () => {
    google.estaConfigurado.mock.mockImplementationOnce(() => false);
    const res = await entrarConGoogle('lo-que-sea');
    assert.strictEqual(res.status, 503);
});

test('Google: los errores de la librería NO se copian (podrían llevar el secreto dentro)', () => {
    const errorDeLaLibreria = Object.assign(new Error('invalid_grant client_secret=NO-DEBE-SALIR'), { response: { status: 400 } });
    const traducido = google.traducirError(errorDeLaLibreria);
    assert.strictEqual(traducido.estado, 401);
    assert.doesNotMatch(traducido.message, /NO-DEBE-SALIR/);
    assert.strictEqual(traducido.cause, undefined);

    assert.strictEqual(google.traducirError(Object.assign(new Error('x'), { code: 'ETIMEDOUT' })).estado, 502);
    assert.strictEqual(google.traducirError(Object.assign(new Error('x'), { response: { status: 503 } })).estado, 502);
});

test('Google: solo los emails de Gmail o de Google Workspace son "de fiar" para unir cuentas', () => {
    assert.strictEqual(google.emailEsDeFiar('ana@gmail.com', undefined), true);
    assert.strictEqual(google.emailEsDeFiar('ana@ilerna.com', 'ilerna.com'), true);
    assert.strictEqual(google.emailEsDeFiar('ana@outlook.com', undefined), false);
    assert.strictEqual(google.emailEsDeFiar('ana@gmail.com.evil.com', undefined), false);
});

// ---------- Con la base de datos de pruebas ----------

test('Google: cuentas nuevas, cuentas que ya existían y casos raros', opcionesBD, async (t) => {
    await t.test('la primera vez crea la cuenta SIN contraseña (201)', async () => {
        const p = persona('nueva', { nombre: '  Marta Google  ' });
        const res = await entrarConGoogle('nueva');
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.nuevo, true);
        assert.strictEqual(res.body.nombre, 'Marta Google');
        assert.ok(res.body.token);

        const [[fila]] = await dbTareas.query('SELECT contrasena, google_sub FROM usuarios WHERE email = ?', [p.email]);
        assert.strictEqual(fila.contrasena, null);
        assert.strictEqual(fila.google_sub, p.sub);
    });

    await t.test('la segunda vez entra en la MISMA cuenta (200)', async () => {
        const primera = await entrarConGoogle('nueva');
        assert.strictEqual(primera.status, 200);
        assert.strictEqual(primera.body.nuevo, false);
        const [[{ total }]] = await dbTareas.query('SELECT COUNT(*) AS total FROM usuarios WHERE email = ?', [personas.get('nueva').email]);
        assert.strictEqual(total, 1);
    });

    await t.test('el pase (token) sirve para usar la app', async () => {
        const { body } = await entrarConGoogle('nueva');
        const res = await request(app).get('/api/tareas').set('Authorization', `Bearer ${body.token}`);
        assert.strictEqual(res.status, 200);
    });

    await t.test('una cuenta de Google no se puede usar con contraseña: 401 igual que siempre', async () => {
        const p = personas.get('nueva');
        const conGoogle = await entrarConContrasena(p.email, 'Cualquiera-1!');
        const noExiste = await entrarConContrasena(`nadie-${marca}@tachit.test`, 'Cualquiera-1!');
        assert.strictEqual(conGoogle.status, 401);
        assert.strictEqual(conGoogle.body.mensaje, noExiste.body.mensaje);
    });

    await t.test('si ya tenía cuenta con contraseña, Google se une a ella y la contraseña se borra', async () => {
        const p = persona('antigua', { nombre: 'Nombre De Google' });
        const contrasena = `Clave-${marca}-A!`;
        const registro = await desdeOtraIp(request(app).post('/api/auth/register'))
            .send({ nombre: 'Nombre Original', email: p.email, contrasena });
        assert.strictEqual(registro.status, 201);

        const res = await entrarConGoogle('antigua');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.unida, true);
        assert.strictEqual(res.body.nombre, 'Nombre Original'); // se respeta su nombre de siempre

        // La contraseña antigua ya NO sirve (protege del robo de cuenta "por adelantado")
        assert.strictEqual((await entrarConContrasena(p.email, contrasena)).status, 401);
        const [[fila]] = await dbTareas.query('SELECT contrasena, google_sub FROM usuarios WHERE email = ?', [p.email]);
        assert.strictEqual(fila.contrasena, null);
        assert.strictEqual(fila.google_sub, p.sub);
    });

    await t.test('si el email de Google no es "de fiar", NO se une a la cuenta existente (409)', async () => {
        const p = persona('outlook', { emailDeFiar: false });
        const contrasena = `Clave-${marca}-O!`;
        await desdeOtraIp(request(app).post('/api/auth/register')).send({ nombre: 'Olga', email: p.email, contrasena });

        const res = await entrarConGoogle('outlook');
        assert.strictEqual(res.status, 409);
        assert.strictEqual(res.body.token, undefined);
        // Su cuenta sigue intacta: puede entrar con su contraseña
        assert.strictEqual((await entrarConContrasena(p.email, contrasena)).status, 200);
    });

    await t.test('otra cuenta de Google con el mismo email no puede entrar en una cuenta ya unida (409)', async () => {
        personas.set('impostor', { ...personas.get('nueva'), sub: `otro-sub-${marca}` });
        const res = await entrarConGoogle('impostor');
        assert.strictEqual(res.status, 409);
        assert.strictEqual(res.body.token, undefined);
    });

    await t.test('el email sin verificar en Google responde 403', async () => {
        google.obtenerDatosDeGoogle.mock.mockImplementationOnce(async () => {
            throw new google.ErrorGoogle(403, 'Tu cuenta de Google no tiene el email verificado.');
        });
        const res = await entrarConGoogle('nueva');
        assert.strictEqual(res.status, 403);
    });

    await t.test('doble clic: dos peticiones a la vez crean UNA sola cuenta', async () => {
        const p = persona('dobleclic');
        const [a, b] = await Promise.all([entrarConGoogle('dobleclic'), entrarConGoogle('dobleclic')]);
        assert.deepStrictEqual([a.status, b.status].sort(), [200, 201]);
        const [[{ total }]] = await dbTareas.query('SELECT COUNT(*) AS total FROM usuarios WHERE email = ?', [p.email]);
        assert.strictEqual(total, 1);
    });

    await t.test('la base de datos impide una cuenta sin contraseña y sin Google', async () => {
        const email = `sin-acceso-${marca}@tachit.test`;
        emailsDePrueba.push(email);
        await assert.rejects(
            dbTareas.query('INSERT INTO usuarios (nombre, email, contrasena, google_sub) VALUES (?, ?, NULL, NULL)', ['X', email]),
            (error) => error.code === 'ER_CHECK_CONSTRAINT_VIOLATED'
        );
    });
});
