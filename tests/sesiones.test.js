// tests/sesiones.test.js
// Pruebas de la renovación de sesión (Fase 3, paso 10.3.1): pase corto de 15 minutos +
// pase de renovación de 30 días en una cookie httpOnly que rota en cada uso.
//  - Las del principio no tocan la base de datos (se ejecutan siempre).
//  - Las del final solo se ejecutan en la base de datos de PRUEBAS (_dev) y borran sus usuarios al acabar.
const { test, after, mock } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../app');
const sesiones = require('../tareas/sesiones');
const email = require('../tareas/email');
const recuperacion = require('../tareas/recuperacion');
const google = require('../tareas/google');
const { dbTareas, poolTareas, poolRutlink } = require('../db');

const nombreBD = process.env.DB_NAME_TAREAS || '';
const esBDPruebas = nombreBD.endsWith('_dev');
const opcionesBD = esBDPruebas ? {} : { skip: 'No es la base de datos de pruebas (_dev): no se ejecuta' };

// Cada petición sale de una IP distinta, para que los límites de intentos no interfieran
app.set('trust proxy', 1);
let ultimaIp = 0;
const desdeOtraIp = (peticion) => peticion.set('X-Forwarded-For', `192.0.2.${(ultimaIp = (ultimaIp % 250) + 1)}`);

// Saca el pase de renovación de la cabecera Set-Cookie de una respuesta (o null)
function paseDeLaRespuesta(res) {
    const cookie = (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${sesiones.NOMBRE_COOKIE}=`));
    if (!cookie) return null;
    const valor = cookie.split(';')[0].split('=')[1];
    return valor || null;
}
const renovar = (pase) => {
    const peticion = desdeOtraIp(request(app).post('/api/auth/renovar'));
    return pase ? peticion.set('Cookie', `${sesiones.NOMBRE_COOKIE}=${pase}`) : peticion;
};
const cerrarSesion = (pase) =>
    desdeOtraIp(request(app).post('/api/auth/cerrar-sesion')).set('Cookie', `${sesiones.NOMBRE_COOKIE}=${pase}`);

const marca = `${Date.now()}-${crypto.randomInt(1e6)}`;
const emailsDePrueba = [];
function nuevaPersona(nombre) {
    const direccion = `${nombre.toLowerCase()}-ses-${marca}@tachit.test`;
    emailsDePrueba.push(direccion);
    return { nombre, email: direccion, contrasena: `Clave-${marca}-S!` };
}
async function registrarYEntrar(persona) {
    assert.strictEqual((await desdeOtraIp(request(app).post('/api/auth/register')).send(persona)).status, 201);
    const res = await desdeOtraIp(request(app).post('/api/auth/login')).send({ email: persona.email, contrasena: persona.contrasena });
    assert.strictEqual(res.status, 200);
    return res;
}

after(async () => {
    app.set('trust proxy', 0);
    mock.restoreAll();
    await recuperacion.esperarTareasEnMarcha();
    if (esBDPruebas && emailsDePrueba.length) {
        await dbTareas.query('DELETE FROM usuarios WHERE email IN (?)', [emailsDePrueba]);
    }
    await poolTareas.promise().end();
    await poolRutlink.promise().end();
});

// ---------- Sin base de datos ----------

test('sesión: renovar sin cookie responde 401', async () => {
    const res = await renovar(null);
    assert.strictEqual(res.status, 401);
    assert.match(res.body.mensaje, /sesión ha caducado/);
});

test('sesión: una cookie con formato raro se ignora (401 sin tocar la base de datos)', async () => {
    const res = await desdeOtraIp(request(app).post('/api/auth/renovar')).set('Cookie', `${sesiones.NOMBRE_COOKIE}=<script>`);
    assert.strictEqual(res.status, 401);
});

test('sesión: un pase corto CADUCADO responde 401 con el código TOKEN_CADUCADO', async () => {
    const caducado = jwt.sign({ id: 1, nombre: 'X', exp: Math.floor(Date.now() / 1000) - 10 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    const res = await request(app).get('/api/tareas').set('Authorization', `Bearer ${caducado}`);
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.codigo, 'TOKEN_CADUCADO');
});

test('sesión: CORS deja enviar la cookie solo a las webs permitidas', async () => {
    const permitida = await request(app).post('/api/auth/renovar').set('Origin', 'http://localhost:5173');
    assert.strictEqual(permitida.headers['access-control-allow-credentials'], 'true');
    assert.strictEqual(permitida.headers['access-control-allow-origin'], 'http://localhost:5173');
    const otra = await request(app).post('/api/auth/renovar').set('Origin', 'https://web-mala.example');
    assert.strictEqual(otra.headers['access-control-allow-origin'], undefined);
});

test('sesión: cerrar sesión sin cookie responde 200 y borra la cookie igualmente', async () => {
    const res = await desdeOtraIp(request(app).post('/api/auth/cerrar-sesion'));
    assert.strictEqual(res.status, 200);
});

// ---------- Con la base de datos de pruebas ----------

test('sesión: entrar, renovar y cerrar sesión', opcionesBD, async (t) => {
    const ana = nuevaPersona('Ana');
    let login;
    let pase;

    await t.test('al entrar llegan los dos pases: el corto (15 min) y la cookie segura', async () => {
        login = await registrarYEntrar(ana);
        const datos = jwt.decode(login.body.token);
        assert.ok(datos.exp - datos.iat <= 15 * 60, 'el pase corto dura 15 minutos');

        const cookie = login.headers['set-cookie'].find((c) => c.startsWith(`${sesiones.NOMBRE_COOKIE}=`));
        assert.match(cookie, /HttpOnly/i);
        assert.match(cookie, /Secure/i);
        assert.match(cookie, /SameSite=Strict/i);
        assert.match(cookie, /Path=\/api\/auth/i);
        assert.match(cookie, /Max-Age=2592000/); // 30 días
        pase = paseDeLaRespuesta(login);
        assert.ok(pase);
    });

    await t.test('la base de datos guarda solo la huella del pase, nunca el pase', async () => {
        const [filas] = await dbTareas.query('SELECT s.token_hash FROM sesiones s JOIN usuarios u ON u.id = s.user_id WHERE u.email = ?', [ana.email]);
        assert.strictEqual(filas.length, 1);
        assert.strictEqual(filas[0].token_hash, sesiones.huella(pase));
    });

    let paseNuevo;
    await t.test('renovar da un pase corto nuevo y CAMBIA el pase de renovación (rotación)', async () => {
        const res = await renovar(pase);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.nombre, 'Ana');
        assert.strictEqual(jwt.decode(res.body.token).id, jwt.decode(login.body.token).id);
        paseNuevo = paseDeLaRespuesta(res);
        assert.ok(paseNuevo);
        assert.notStrictEqual(paseNuevo, pase);

        const tareas = await request(app).get('/api/tareas').set('Authorization', `Bearer ${res.body.token}`);
        assert.strictEqual(tareas.status, 200);
    });

    await t.test('dos pestañas a la vez: el pase recién cambiado vale una vez más (margen de 30 s)', async () => {
        const res = await renovar(pase); // el viejo, usado hace un momento
        assert.strictEqual(res.status, 200);
    });

    await t.test('PASE ROBADO: usar un pase cambiado hace más de 30 s anula toda la familia', async () => {
        await dbTareas.query('UPDATE sesiones SET usado_en = NOW() - INTERVAL 5 MINUTE WHERE token_hash = ?', [sesiones.huella(pase)]);
        const robado = await renovar(pase);
        assert.strictEqual(robado.status, 401);
        // También deja de valer el pase bueno: el dueño tiene que volver a entrar (y el ladrón también)
        assert.strictEqual((await renovar(paseNuevo)).status, 401);
    });

    await t.test('cerrar sesión anula el pase en el servidor: ya no sirve para renovar', async () => {
        const otraVez = await desdeOtraIp(request(app).post('/api/auth/login')).send({ email: ana.email, contrasena: ana.contrasena });
        const paseActual = paseDeLaRespuesta(otraVez);
        assert.strictEqual((await cerrarSesion(paseActual)).status, 200);
        assert.strictEqual((await renovar(paseActual)).status, 401);
    });
});

test('sesión: casos especiales', opcionesBD, async (t) => {
    await t.test('un pase caducado (más de 30 días) no sirve', async () => {
        const leo = nuevaPersona('Leo');
        const pase = paseDeLaRespuesta(await registrarYEntrar(leo));
        await dbTareas.query('UPDATE sesiones SET caduca_en = NOW() - INTERVAL 1 MINUTE WHERE token_hash = ?', [sesiones.huella(pase)]);
        assert.strictEqual((await renovar(pase)).status, 401);
    });

    await t.test('cerrar sesión en un dispositivo NO cierra la de otro', async () => {
        const eva = nuevaPersona('Eva');
        const movil = paseDeLaRespuesta(await registrarYEntrar(eva));
        const portatil = paseDeLaRespuesta(
            await desdeOtraIp(request(app).post('/api/auth/login')).send({ email: eva.email, contrasena: eva.contrasena })
        );
        await cerrarSesion(movil);
        assert.strictEqual((await renovar(movil)).status, 401);
        assert.strictEqual((await renovar(portatil)).status, 200);
    });

    await t.test('restablecer la contraseña cierra TODAS las sesiones abiertas', async () => {
        mock.method(email, 'estaConfigurado', () => true);
        const enviados = [];
        mock.method(email, 'enviarEmail', async (datos) => { enviados.push(datos); return true; });
        const urlOriginal = process.env.FRONTEND_URL;
        process.env.FRONTEND_URL = 'http://localhost:5173';

        const gala = nuevaPersona('Gala');
        const pase1 = paseDeLaRespuesta(await registrarYEntrar(gala));
        const pase2 = paseDeLaRespuesta(
            await desdeOtraIp(request(app).post('/api/auth/login')).send({ email: gala.email, contrasena: gala.contrasena })
        );
        await desdeOtraIp(request(app).post('/api/auth/olvide-contrasena')).send({ email: gala.email });
        await recuperacion.esperarTareasEnMarcha();
        const codigo = enviados.pop().texto.match(/#token=([A-Za-z0-9_-]+)/)[1];
        const res = await desdeOtraIp(request(app).post('/api/auth/restablecer-contrasena')).send({ token: codigo, contrasena: `Nueva-${marca}-G!` });
        assert.strictEqual(res.status, 200);

        assert.strictEqual((await renovar(pase1)).status, 401);
        assert.strictEqual((await renovar(pase2)).status, 401);
        if (urlOriginal === undefined) delete process.env.FRONTEND_URL;
        else process.env.FRONTEND_URL = urlOriginal;
    });

    await t.test('entrar con Google también da los dos pases', async () => {
        mock.method(google, 'estaConfigurado', () => true);
        const direccion = `google-ses-${marca}@tachit.test`;
        emailsDePrueba.push(direccion);
        mock.method(google, 'obtenerDatosDeGoogle', async () => ({ sub: `sub-ses-${marca}`, email: direccion, emailDeFiar: true, nombre: 'Gus Google' }));
        const res = await desdeOtraIp(request(app).post('/api/auth/google')).send({ codigo: 'codigo-de-prueba' });
        assert.strictEqual(res.status, 201);
        const pase = paseDeLaRespuesta(res);
        assert.ok(pase);
        assert.strictEqual((await renovar(pase)).status, 200);
    });

    await t.test('si se borra la cuenta, sus pases desaparecen con ella', async () => {
        const ivo = nuevaPersona('Ivo');
        const pase = paseDeLaRespuesta(await registrarYEntrar(ivo));
        await dbTareas.query('DELETE FROM usuarios WHERE email = ?', [ivo.email]);
        assert.strictEqual((await renovar(pase)).status, 401);
    });
});
