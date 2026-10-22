// tests/recuperacion.test.js
// Pruebas de "¿Olvidaste tu contraseña?" (Fase 3, paso 9.2).
// El envío de emails se sustituye por un DOBLE DE PRUEBA: nunca se manda un email de verdad
// ni hace falta la clave de Resend.
//  - Las del principio no tocan la base de datos (se ejecutan siempre).
//  - Las del final solo se ejecutan en la base de datos de PRUEBAS (_dev) y borran sus usuarios al acabar.
const { test, after, mock } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const request = require('supertest');
const app = require('../app');
const email = require('../tareas/email');
const recuperacion = require('../tareas/recuperacion');
const { dbTareas, poolTareas, poolRutlink } = require('../db');

const nombreBD = process.env.DB_NAME_TAREAS || '';
const esBDPruebas = nombreBD.endsWith('_dev');
const opcionesBD = esBDPruebas ? {} : { skip: 'No es la base de datos de pruebas (_dev): no se ejecuta' };

// Dirección de la web para las pruebas (la de verdad sale del .env)
const FRONTEND_URL_ORIGINAL = process.env.FRONTEND_URL;
process.env.FRONTEND_URL = 'http://localhost:5173';

// Cada petición sale de una IP distinta, para que los límites de intentos no interfieran entre pruebas
app.set('trust proxy', 1);
let ultimaIp = 0;
const desdeOtraIp = (peticion) => peticion.set('X-Forwarded-For', `198.51.100.${(ultimaIp = (ultimaIp % 250) + 1)}`);
const pedirEnlace = (direccion) => desdeOtraIp(request(app).post('/api/auth/olvide-contrasena')).send({ email: direccion });
const restablecer = (token, contrasena) =>
    desdeOtraIp(request(app).post('/api/auth/restablecer-contrasena')).send({ token, contrasena });
const entrar = (direccion, contrasena) => desdeOtraIp(request(app).post('/api/auth/login')).send({ email: direccion, contrasena });

// ---------- El doble del envío de emails ----------
const enviados = [];
mock.method(email, 'estaConfigurado', () => true);
mock.method(email, 'enviarEmail', async (datos) => {
    enviados.push(datos);
    return true;
});
// Saca el código del enlace del último email enviado a esa dirección
function codigoDelUltimoEmail(direccion) {
    const ultimo = enviados.filter((e) => e.para === direccion).pop();
    assert.ok(ultimo, `debería haberse enviado un email a ${direccion}`);
    const encontrado = ultimo.texto.match(/\/restablecer-contrasena#token=([A-Za-z0-9_-]+)/);
    assert.ok(encontrado, 'el email debe llevar el enlace con el código');
    return encontrado[1];
}

const marca = `${Date.now()}-${crypto.randomInt(1e6)}`;
const emailsDePrueba = [];
function nuevaPersona(nombre) {
    const direccion = `${nombre.toLowerCase().replace(/[^a-z]/g, '')}-${marca}@tachit.test`;
    emailsDePrueba.push(direccion);
    return { nombre, email: direccion, contrasena: `Clave-${marca}-A!` };
}
async function registrar(persona) {
    const res = await desdeOtraIp(request(app).post('/api/auth/register')).send(persona);
    assert.strictEqual(res.status, 201);
}

after(async () => {
    app.set('trust proxy', 0);
    mock.restoreAll();
    if (FRONTEND_URL_ORIGINAL === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = FRONTEND_URL_ORIGINAL;
    await recuperacion.esperarTareasEnMarcha();
    if (esBDPruebas && emailsDePrueba.length) {
        await dbTareas.query('DELETE FROM usuarios WHERE email IN (?)', [emailsDePrueba]);
    }
    await poolTareas.promise().end();
    await poolRutlink.promise().end();
});

// ---------- Sin base de datos ----------

test('recuperar: un email mal escrito responde 400 con mensaje en español', async () => {
    const res = await pedirEnlace('esto-no-es-un-email');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.mensaje, 'El email no es válido');
});

test('recuperar: si falta la configuración del email responde 503', async () => {
    email.estaConfigurado.mock.mockImplementationOnce(() => false);
    const res = await pedirEnlace('alguien@tachit.test');
    assert.strictEqual(res.status, 503);
});

test('recuperar: FRONTEND_URL tiene que ser http o https (si no, 503)', async () => {
    process.env.FRONTEND_URL = 'javascript:alert(1)';
    const res = await pedirEnlace('alguien@tachit.test');
    process.env.FRONTEND_URL = 'http://localhost:5173';
    assert.strictEqual(res.status, 503);
});

test('restablecer: un código con formato raro responde 400 sin tocar la base de datos', async () => {
    const res = await restablecer('<script>', 'Nueva-Clave-123!');
    assert.strictEqual(res.status, 400);
    assert.match(res.body.mensaje, /enlace no es válido/);
});

test('restablecer: la contraseña nueva tiene los mismos requisitos que al registrarse', async () => {
    const res = await restablecer('a'.repeat(43), 'debil');
    assert.strictEqual(res.status, 400);
    assert.match(res.body.mensaje, /8 caracteres/);
});

test('recuperar: el nombre se escapa en el email (no se puede colar código HTML)', () => {
    assert.strictEqual(recuperacion.escaparHtml('<b>Ana</b> & "Luis"'), '&lt;b&gt;Ana&lt;/b&gt; &amp; &quot;Luis&quot;');
});

// ---------- Con la base de datos de pruebas ----------

test('recuperar la contraseña de principio a fin', opcionesBD, async (t) => {
    const ana = nuevaPersona('Ana');
    const nuevaClave = `Nueva-${marca}-B!`;
    let codigo;

    await t.test('un email SIN cuenta recibe la misma respuesta y no se envía nada', async () => {
        await registrar(ana);
        const conCuenta = await pedirEnlace(ana.email);
        const sinCuenta = await pedirEnlace(`nadie-${marca}@tachit.test`);
        await recuperacion.esperarTareasEnMarcha();

        assert.strictEqual(conCuenta.status, 200);
        assert.strictEqual(sinCuenta.status, 200);
        assert.strictEqual(conCuenta.body.mensaje, sinCuenta.body.mensaje);
        assert.strictEqual(enviados.filter((e) => e.para === `nadie-${marca}@tachit.test`).length, 0);
        assert.strictEqual(enviados.filter((e) => e.para === ana.email).length, 1);
    });

    await t.test('el email lleva un enlace a la web y la base de datos guarda solo la huella', async () => {
        codigo = codigoDelUltimoEmail(ana.email);
        const ultimo = enviados.filter((e) => e.para === ana.email).pop();
        assert.match(ultimo.texto, /^Hola, Ana:/);
        assert.ok(ultimo.texto.includes(`http://localhost:5173/restablecer-contrasena#token=${codigo}`));
        assert.ok(codigo.length >= 43, 'el código debe ser largo (32 bytes)');

        const [filas] = await dbTareas.query(
            'SELECT r.token_hash, TIMESTAMPDIFF(MINUTE, NOW(), r.caduca_en) AS minutos FROM restablecimientos_contrasena r JOIN usuarios u ON u.id = r.user_id WHERE u.email = ?',
            [ana.email]
        );
        assert.strictEqual(filas.length, 1);
        assert.notStrictEqual(filas[0].token_hash, codigo); // nunca el código tal cual
        assert.strictEqual(filas[0].token_hash, recuperacion.huella(codigo));
        assert.ok(filas[0].minutos >= 29 && filas[0].minutos <= 30, 'caduca en 30 minutos');
    });

    await t.test('con el enlace se cambia la contraseña: la nueva funciona y la antigua no', async () => {
        const res = await restablecer(codigo, nuevaClave);
        assert.strictEqual(res.status, 200);
        assert.strictEqual((await entrar(ana.email, nuevaClave)).status, 200);
        assert.strictEqual((await entrar(ana.email, ana.contrasena)).status, 401);
    });

    await t.test('el mismo enlace NO sirve dos veces', async () => {
        const res = await restablecer(codigo, `Otra-${marca}-C!`);
        assert.strictEqual(res.status, 400);
        assert.strictEqual((await entrar(ana.email, nuevaClave)).status, 200);
    });

    await t.test('un código inventado no sirve', async () => {
        const res = await restablecer(crypto.randomBytes(32).toString('base64url'), `Otra-${marca}-C!`);
        assert.strictEqual(res.status, 400);
    });
});

test('recuperar: casos especiales', opcionesBD, async (t) => {
    await t.test('pedir un enlace nuevo anula el anterior', async () => {
        const luis = nuevaPersona('Luis');
        await registrar(luis);
        await pedirEnlace(luis.email);
        await recuperacion.esperarTareasEnMarcha();
        const primero = codigoDelUltimoEmail(luis.email);
        await pedirEnlace(luis.email);
        await recuperacion.esperarTareasEnMarcha();
        const segundo = codigoDelUltimoEmail(luis.email);

        assert.notStrictEqual(primero, segundo);
        assert.strictEqual((await restablecer(primero, `Nueva-${marca}-L!`)).status, 400);
        assert.strictEqual((await restablecer(segundo, `Nueva-${marca}-L!`)).status, 200);
    });

    await t.test('un enlace caducado no sirve', async () => {
        const eva = nuevaPersona('Eva');
        await registrar(eva);
        await pedirEnlace(eva.email);
        await recuperacion.esperarTareasEnMarcha();
        const codigo = codigoDelUltimoEmail(eva.email);
        // Simulamos que han pasado más de 30 minutos
        await dbTareas.query('UPDATE restablecimientos_contrasena SET caduca_en = NOW() - INTERVAL 1 MINUTE WHERE token_hash = ?', [
            recuperacion.huella(codigo),
        ]);
        assert.strictEqual((await restablecer(codigo, `Nueva-${marca}-E!`)).status, 400);
        assert.strictEqual((await entrar(eva.email, eva.contrasena)).status, 200); // su contraseña sigue igual
    });

    await t.test('dos peticiones a la vez con el mismo enlace: solo una cambia la contraseña', async () => {
        const leo = nuevaPersona('Leo');
        await registrar(leo);
        await pedirEnlace(leo.email);
        await recuperacion.esperarTareasEnMarcha();
        const codigo = codigoDelUltimoEmail(leo.email);
        const [a, b] = await Promise.all([restablecer(codigo, `Primera-${marca}-1!`), restablecer(codigo, `Segunda-${marca}-2!`)]);
        assert.deepStrictEqual([a.status, b.status].sort(), [200, 400]);
    });

    await t.test('una cuenta creada con Google puede ponerse contraseña con el enlace', async () => {
        const direccion = `google-${marca}@tachit.test`;
        emailsDePrueba.push(direccion);
        await dbTareas.query('INSERT INTO usuarios (nombre, email, contrasena, google_sub) VALUES (?, ?, NULL, ?)', [
            'Gala Google',
            direccion,
            `sub-recuperar-${marca}`,
        ]);
        await pedirEnlace(direccion);
        await recuperacion.esperarTareasEnMarcha();
        const codigo = codigoDelUltimoEmail(direccion);
        assert.strictEqual((await restablecer(codigo, `Nueva-${marca}-G!`)).status, 200);
        assert.strictEqual((await entrar(direccion, `Nueva-${marca}-G!`)).status, 200);
    });

    await t.test('el límite por email: el 4.º enlace en una hora a la misma dirección recibe 429', async () => {
        const direccion = `limite-${marca}@tachit.test`;
        for (let i = 1; i <= 3; i++) assert.strictEqual((await pedirEnlace(direccion)).status, 200);
        const res = await pedirEnlace(direccion);
        assert.strictEqual(res.status, 429);
        assert.match(res.body.mensaje, /varios enlaces/);
    });
});
