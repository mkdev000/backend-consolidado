// tareas/recuperacion.js
// "¿Olvidaste tu contraseña?" (Fase 3, paso 9): crear enlaces de recuperación y usarlos.
//
// Cómo funciona, en corto:
//  1. Pides un enlace con tu email. Si la cuenta existe, creamos un CÓDIGO aleatorio enorme
//     (32 bytes = 256 bits: imposible de adivinar) y te lo mandamos por email dentro de un enlace.
//  2. En la base de datos guardamos solo su HUELLA (SHA-256), nunca el código.
//  3. Al abrir el enlace y elegir contraseña nueva, calculamos la huella del código recibido y la buscamos:
//     tiene que existir, no estar usada y no haber caducado (30 minutos).
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { dbTareas } = require('../db');
const { enTransaccion, registrarError } = require('./utilidades');
// Se usa como "email.enviarEmail(...)" para que las pruebas puedan sustituirlo por un doble
const email = require('./email');
const { cerrarTodas } = require('./sesiones');

const MINUTOS_VALIDEZ = 30;

// La huella (hash SHA-256) de un código: siempre 64 letras hexadecimales
function huella(codigo) {
    return crypto.createHash('sha256').update(codigo).digest('hex');
}

// La dirección de la web sale SIEMPRE de FRONTEND_URL (nunca de la petición: un atacante podría
// cambiarla para que el enlace del email apuntara a su web falsa). Solo se aceptan http y https.
function direccionWeb() {
    try {
        const url = new URL(process.env.FRONTEND_URL);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
    } catch {
        return null;
    }
}

// ¿Está todo lo necesario para mandar enlaces? (clave de Resend, remitente y dirección de la web)
function estaConfigurado() {
    return email.estaConfigurado() && direccionWeb() !== null;
}

// Evita que un nombre con símbolos raros (<, >, &...) se convierta en código HTML dentro del email
function escaparHtml(texto) {
    return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function contenidoEmail(nombre, enlace) {
    const asunto = 'Restablece tu contraseña de Tachit';
    const texto =
        `Hola, ${nombre}:\n\n` +
        'Has pedido restablecer tu contraseña de Tachit. Abre este enlace para elegir una nueva:\n\n' +
        `${enlace}\n\n` +
        `El enlace caduca en ${MINUTOS_VALIDEZ} minutos y solo se puede usar una vez.\n\n` +
        'Si no has sido tú, ignora este email: tu contraseña no cambiará.\n\n' +
        'Tachit';
    const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#0f1f2e">
<div style="max-width:480px;margin:0 auto;padding:32px 24px">
<p style="font-size:22px;font-weight:800;margin:0 0 24px">Tachit</p>
<p style="font-size:16px;margin:0 0 12px">Hola, ${escaparHtml(nombre)}:</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 24px">Has pedido restablecer tu contraseña de Tachit. Pulsa el botón para elegir una nueva.</p>
<p style="margin:0 0 24px"><a href="${escaparHtml(enlace)}" style="display:inline-block;background:#3a47b8;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 22px;border-radius:12px">Elegir contraseña nueva</a></p>
<p style="font-size:14px;line-height:1.5;color:#5b6b7c;margin:0 0 8px">El enlace caduca en ${MINUTOS_VALIDEZ} minutos y solo se puede usar una vez.</p>
<p style="font-size:14px;line-height:1.5;color:#5b6b7c;margin:0">Si no has sido tú, ignora este email: tu contraseña no cambiará.</p>
</div></body></html>`;
    return { asunto, texto, html };
}

// ---------- 1. Pedir un enlace ----------

// Crea el enlace y manda el email. Si el email no tiene cuenta, NO hace nada (y nadie lo nota:
// la ruta responde lo mismo en los dos casos y antes de llegar aquí).
async function pedirEnlace(direccionEmail) {
    const [filas] = await dbTareas.query('SELECT id, nombre FROM usuarios WHERE email = ?', [direccionEmail]);
    const usuario = filas[0];
    if (!usuario) return;

    const codigo = crypto.randomBytes(32).toString('base64url');

    await enTransaccion(dbTareas, async (conexion) => {
        // "Candado" sobre la fila de la persona: si pide dos enlaces a la vez, se hacen uno detrás de otro
        await conexion.query('SELECT id FROM usuarios WHERE id = ? FOR UPDATE', [usuario.id]);
        // Limpieza: anulamos los enlaces anteriores de esta persona (solo vale el último)
        // y borramos los viejos para que la tabla no crezca sin fin.
        await conexion.query(
            'DELETE FROM restablecimientos_contrasena WHERE user_id = ? AND (usado_en IS NOT NULL OR caduca_en < NOW())',
            [usuario.id]
        );
        await conexion.query(
            'UPDATE restablecimientos_contrasena SET usado_en = NOW() WHERE user_id = ? AND usado_en IS NULL',
            [usuario.id]
        );
        // La caducidad la calcula MySQL (NOW() + 30 min): así no hay líos de zonas horarias entre Node y MySQL
        await conexion.query(
            'INSERT INTO restablecimientos_contrasena (user_id, token_hash, caduca_en) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
            [usuario.id, huella(codigo), MINUTOS_VALIDEZ]
        );
    });

    // El código va DESPUÉS de "#": esa parte del enlace no viaja al servidor de la web ni queda en sus logs
    const enlace = `${direccionWeb()}/restablecer-contrasena#token=${codigo}`;
    const { asunto, texto, html } = contenidoEmail(usuario.nombre, enlace);
    await email.enviarEmail({ para: direccionEmail, asunto, texto, html });
}

// El trabajo de "pedir enlace" se hace DESPUÉS de responder (en segundo plano), para que la respuesta
// tarde lo mismo exista o no la cuenta. Guardamos las tareas en marcha para que las pruebas puedan esperarlas.
const enMarcha = new Set();
function pedirEnlaceEnSegundoPlano(direccionEmail) {
    const tarea = pedirEnlace(direccionEmail)
        .catch((error) => registrarError('recuperacion/pedir', error))
        .finally(() => enMarcha.delete(tarea));
    enMarcha.add(tarea);
}
function esperarTareasEnMarcha() {
    return Promise.all([...enMarcha]);
}

// ---------- 2. Usar el enlace ----------

// Devuelve true si la contraseña se ha cambiado, o false si el enlace no vale (no existe, usado o caducado).
async function restablecer(codigo, contrasenaNueva) {
    // bcrypt es lento A PROPÓSITO: lo hacemos antes de abrir la transacción para no tenerla abierta mucho rato
    const contrasenaHasheada = await bcrypt.hash(contrasenaNueva, 10);

    return enTransaccion(dbTareas, async (conexion) => {
        // FOR UPDATE: "bloquea" la fila mientras tanto. Si llegan dos peticiones a la vez con el mismo
        // enlace, la segunda espera y, cuando entra, el enlace ya está usado: solo funciona UNA vez.
        const [filas] = await conexion.query(
            `SELECT id, user_id FROM restablecimientos_contrasena
             WHERE token_hash = ? AND usado_en IS NULL AND caduca_en > NOW()
             FOR UPDATE`,
            [huella(codigo)]
        );
        const enlace = filas[0];
        if (!enlace) return false;

        await conexion.query('UPDATE usuarios SET contrasena = ? WHERE id = ?', [contrasenaHasheada, enlace.user_id]);
        // Este enlace queda usado, y cualquier otro que tuviera pendiente también se anula
        await conexion.query(
            'UPDATE restablecimientos_contrasena SET usado_en = NOW() WHERE user_id = ? AND usado_en IS NULL',
            [enlace.user_id]
        );
        // Y se cierran TODAS sus sesiones abiertas: si alguien se había colado en la cuenta, queda fuera
        await cerrarTodas(conexion, enlace.user_id);
        return true;
    });
}

module.exports = { estaConfigurado, pedirEnlaceEnSegundoPlano, esperarTareasEnMarcha, restablecer, huella, escaparHtml, MINUTOS_VALIDEZ };
