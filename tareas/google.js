// tareas/google.js
// Habla con Google para el botón "Continuar con Google" (Fase 3, paso 8).
//
// Cómo funciona, en corto:
//  1. El navegador abre la ventanita de Google, la persona elige su cuenta y Google le da al
//     frontend un "código" de un solo uso (vale unos minutos y solo sirve una vez).
//  2. El frontend nos manda ese código. Nosotros se lo enseñamos a Google JUNTO con el secreto
//     de la app (GOOGLE_CLIENT_SECRET, que solo está en el .env / Render y nunca sale de aquí).
//  3. Google nos devuelve un "carné" firmado (id_token) con quién es la persona.
//  4. Comprobamos la firma y que el carné es para NUESTRA app (audience = nuestro Client ID).
//
// SEGURIDAD: aquí nunca se escribe en los logs ni el código, ni los tokens, ni el secreto.
const { OAuth2Client } = require('google-auth-library');

// Error "controlado": lleva el código HTTP que debe recibir el frontend y un mensaje en español.
class ErrorGoogle extends Error {
    constructor(estado, mensaje) {
        super(mensaje);
        this.name = 'ErrorGoogle';
        this.estado = estado;
    }
}

// ¿Están las dos variables de Google en el entorno? (si faltan, el botón responde 503)
function estaConfigurado() {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// Un único cliente para toda la app (se crea la primera vez que hace falta)
let cliente = null;
function obtenerCliente() {
    if (!cliente) {
        cliente = new OAuth2Client({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            // 'postmessage' = el código vino de la ventanita (popup) de Google, no de una redirección
            redirectUri: 'postmessage',
        });
    }
    return cliente;
}

// Errores de red típicos de Node (Google no contesta, se corta la conexión...)
const ERRORES_DE_RED = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNABORTED']);

// Convierte cualquier fallo en un ErrorGoogle SIN copiar el error original
// (el error de la librería puede llevar dentro la petición, con el secreto de la app).
function traducirError(error) {
    if (error instanceof ErrorGoogle) return error;
    const estadoGoogle = error?.response?.status;
    if (estadoGoogle >= 500 || ERRORES_DE_RED.has(error?.code)) {
        return new ErrorGoogle(502, 'Google no responde ahora mismo. Inténtalo de nuevo en un momento.');
    }
    // Código caducado, ya usado, inventado, o carné con firma falsa: la persona tiene que volver a intentarlo
    return new ErrorGoogle(401, 'No hemos podido comprobar tu cuenta de Google. Inténtalo de nuevo.');
}

// El email de Google es "de fiar al 100 %" si es de Gmail o de una empresa/centro con Google Workspace
// (campo hd). Con otros emails (por ejemplo, una cuenta de Google creada con un email de Outlook),
// Google comprobó el email al crearla, pero no garantiza que la persona lo siga controlando hoy.
function emailEsDeFiar(email, dominioWorkspace) {
    return /@(gmail|googlemail)\.com$/.test(email) || Boolean(dominioWorkspace);
}

// Recibe el código de un solo uso y devuelve los datos de la persona ya comprobados.
async function obtenerDatosDeGoogle(codigo) {
    const clienteGoogle = obtenerCliente();
    let datos;
    try {
        const { tokens } = await clienteGoogle.getToken(codigo);
        if (!tokens?.id_token) throw new ErrorGoogle(401, 'Google no ha enviado los datos de la cuenta. Inténtalo de nuevo.');

        // Comprueba la firma de Google, la caducidad, quién lo emite y que es para NUESTRA app
        const carne = await clienteGoogle.verifyIdToken({
            idToken: tokens.id_token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        datos = carne.getPayload();
        // Los demás tokens (access/refresh) no los guardamos: para entrar no hacen falta.
    } catch (error) {
        throw traducirError(error);
    }

    if (!datos?.sub || typeof datos.email !== 'string') {
        throw new ErrorGoogle(401, 'No hemos podido comprobar tu cuenta de Google. Inténtalo de nuevo.');
    }
    if (datos.email_verified !== true) {
        throw new ErrorGoogle(403, 'Tu cuenta de Google no tiene el email verificado. Verifícalo en Google y vuelve a intentarlo.');
    }

    const email = datos.email.trim().toLowerCase();
    return {
        sub: String(datos.sub),
        email,
        emailDeFiar: emailEsDeFiar(email, datos.hd),
        nombre: typeof datos.name === 'string' ? datos.name : '',
    };
}

module.exports = { estaConfigurado, obtenerDatosDeGoogle, emailEsDeFiar, traducirError, ErrorGoogle };
