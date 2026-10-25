// tareas/sesiones.js
// Renovación de sesión (Fase 3, paso 10.3): DOS pases en vez de uno.
//
//  1. Pase CORTO (JWT, 15 minutos): la app lo enseña en cada petición ("Authorization: Bearer …").
//     Vive solo en la memoria de la app. Si alguien lo robara, le serviría como mucho 15 minutos.
//  2. Pase de RENOVACIÓN (30 días): un código aleatorio enorme guardado en una cookie httpOnly,
//     una "caja fuerte" del navegador que el JavaScript de la página NO puede leer.
//     Solo sirve para una cosa: pedir un pase corto nuevo (POST /api/auth/renovar).
//
// Cada vez que se usa el pase de renovación, se cambia por uno nuevo (ROTACIÓN). Si alguien
// intenta usar uno que ya se cambió, es señal de robo: se anula toda la "familia" de pases.
// En la base de datos solo se guarda la HUELLA (SHA-256) de cada pase, nunca el pase.
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { dbTareas } = require('../db');
const { enTransaccion } = require('./utilidades');

const NOMBRE_COOKIE = 'tachit_renovar';
const DIAS_RENOVACION = 30;
const DURACION_PASE_CORTO = '15m';
// Margen para dos pestañas que renuevan a la vez: si un pase se cambió hace menos de 30 segundos,
// todavía se acepta una vez más (sin esto, abrir Tachit en dos pestañas te cerraría la sesión).
const SEGUNDOS_GRACIA = 30;

function huella(codigo) {
    return crypto.createHash('sha256').update(codigo).digest('hex');
}

// El pase corto: dice quién eres y caduca en 15 minutos. Firmado con JWT_SECRET (HS256).
function crearPaseCorto(usuario) {
    return jwt.sign({ id: usuario.id, nombre: usuario.nombre }, process.env.JWT_SECRET, {
        expiresIn: DURACION_PASE_CORTO,
        algorithm: 'HS256',
    });
}

// Cómo se guarda la cookie del pase de renovación:
//  httpOnly  → el JavaScript de la página no puede leerla (ni un código malicioso)
//  secure    → solo viaja por https (los navegadores hacen una excepción con localhost para programar)
//  sameSite  → 'strict': el navegador NO la envía si la petición viene de otra web (protege de CSRF)
//  path      → solo se envía a las rutas /api/auth (no a las de tareas, ni a Rutlink)
function opcionesCookie() {
    return {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/api/auth',
        maxAge: DIAS_RENOVACION * 24 * 60 * 60 * 1000,
    };
}

function ponerCookie(res, codigo) {
    res.cookie(NOMBRE_COOKIE, codigo, opcionesCookie());
}

function borrarCookie(res) {
    const { maxAge, ...opciones } = opcionesCookie(); // para borrarla, las mismas opciones sin la duración
    res.clearCookie(NOMBRE_COOKIE, opciones);
}

// Lee el pase de renovación de la cabecera "Cookie" (Express no trae lector de cookies y no hace
// falta instalar uno: solo buscamos una). Solo se aceptan letras, números, - y _ (el formato del pase).
function leerCookie(req) {
    const cabecera = req.headers.cookie;
    if (typeof cabecera !== 'string') return null;
    for (const trozo of cabecera.split(';')) {
        const [nombre, ...resto] = trozo.trim().split('=');
        if (nombre === NOMBRE_COOKIE) {
            const valor = resto.join('=');
            return /^[A-Za-z0-9_-]{40,100}$/.test(valor) ? valor : null;
        }
    }
    return null;
}

// Guarda un pase de renovación nuevo (dentro de una transacción o no) y devuelve el código
async function guardarPase(conexion, userId, familia) {
    const codigo = crypto.randomBytes(32).toString('base64url');
    // La caducidad la calcula MySQL (NOW() + 30 días): sin líos de zonas horarias
    await conexion.query(
        'INSERT INTO sesiones (user_id, familia, token_hash, caduca_en) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
        [userId, familia, huella(codigo), DIAS_RENOVACION]
    );
    return codigo;
}

// ---------- Al entrar (contraseña o Google) ----------
// Crea una familia nueva, pone la cookie y devuelve el pase corto.
async function iniciarSesion(res, usuario) {
    // Limpieza: borramos pases de esta persona que ya no sirven (caducados, anulados o cambiados hace días)
    await dbTareas.query(
        `DELETE FROM sesiones WHERE user_id = ?
         AND (caduca_en < NOW() OR revocada_en IS NOT NULL OR usado_en < NOW() - INTERVAL 7 DAY)`,
        [usuario.id]
    );
    const familia = crypto.randomBytes(16).toString('hex');
    const codigo = await guardarPase(dbTareas, usuario.id, familia);
    ponerCookie(res, codigo);
    return crearPaseCorto(usuario);
}

// ---------- Renovar ----------
// Devuelve { usuario, codigo } con el pase nuevo, o null si el pase no vale.
async function renovar(codigo) {
    return enTransaccion(dbTareas, async (conexion) => {
        // FOR UPDATE: "candado" sobre la fila mientras la cambiamos (dos peticiones a la vez no la usan dos veces)
        const [filas] = await conexion.query(
            `SELECT s.id, s.user_id, s.familia, s.usado_en, s.revocada_en,
                    s.caduca_en > NOW() AS vigente,
                    (s.usado_en IS NOT NULL AND s.usado_en > NOW() - INTERVAL ? SECOND) AS en_gracia,
                    u.nombre
             FROM sesiones s JOIN usuarios u ON u.id = s.user_id
             WHERE s.token_hash = ?
             FOR UPDATE`,
            [SEGUNDOS_GRACIA, huella(codigo)]
        );
        const pase = filas[0];
        if (!pase || pase.revocada_en || !pase.vigente) return null;

        if (pase.usado_en) {
            if (!pase.en_gracia) {
                // ¡Alguien usa un pase que ya se había cambiado! Anulamos toda la familia.
                await conexion.query('UPDATE sesiones SET revocada_en = NOW() WHERE familia = ? AND revocada_en IS NULL', [pase.familia]);
                return null;
            }
            // Dentro del margen de 30 s (otra pestaña renovó a la vez): damos otro pase de la misma familia
        } else {
            await conexion.query('UPDATE sesiones SET usado_en = NOW() WHERE id = ?', [pase.id]);
        }

        const codigoNuevo = await guardarPase(conexion, pase.user_id, pase.familia);
        return { usuario: { id: pase.user_id, nombre: pase.nombre }, codigo: codigoNuevo };
    });
}

// ---------- Cerrar sesión ----------
// Anula la familia del pase (este dispositivo). Si el pase no existe, no pasa nada.
async function cerrarSesion(codigo) {
    const [filas] = await dbTareas.query('SELECT familia FROM sesiones WHERE token_hash = ?', [huella(codigo)]);
    if (!filas[0]) return;
    await dbTareas.query('UPDATE sesiones SET revocada_en = NOW() WHERE familia = ? AND revocada_en IS NULL', [filas[0].familia]);
}

// Anula TODAS las sesiones de una persona (por ejemplo, al poner contraseña nueva).
// Recibe la conexión para poder hacerlo dentro de la misma transacción.
async function cerrarTodas(conexion, userId) {
    await conexion.query('UPDATE sesiones SET revocada_en = NOW() WHERE user_id = ? AND revocada_en IS NULL', [userId]);
}

module.exports = {
    NOMBRE_COOKIE,
    SEGUNDOS_GRACIA,
    huella,
    crearPaseCorto,
    iniciarSesion,
    renovar,
    cerrarSesion,
    cerrarTodas,
    leerCookie,
    ponerCookie,
    borrarCookie,
};
