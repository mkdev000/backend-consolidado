// tareas/email.js
// Envía emails con Resend (Fase 3, paso 9).
//
// Hablamos con la "ventanilla" (API) de Resend directamente con fetch, que ya viene con Node:
// así no hace falta instalar ninguna librería más. La API key (RESEND_API_KEY) es como el carné
// de socio: le dice a Resend que somos Tachit y que tenemos permiso para enviar.
//
// SEGURIDAD: la API key solo se lee de las variables de entorno y NUNCA se escribe en los logs.

const URL_RESEND = 'https://api.resend.com/emails';
const ESPERA_MAXIMA_MS = 10000; // si Resend no contesta en 10 segundos, lo damos por fallido

// ¿Están la clave y el remitente en el entorno?
function estaConfigurado() {
    return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_REMITENTE);
}

// Envía un email. Devuelve true si Resend lo acepta y false si no (nunca lanza el error hacia arriba,
// para que un fallo del email no tumbe el servidor). Solo registra el código de estado, sin datos.
async function enviarEmail({ para, asunto, texto, html }) {
    try {
        const respuesta = await fetch(URL_RESEND, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ from: process.env.EMAIL_REMITENTE, to: [para], subject: asunto, text: texto, html }),
            signal: AbortSignal.timeout(ESPERA_MAXIMA_MS),
        });
        if (!respuesta.ok) {
            console.error('[email] Resend no ha aceptado el email. Código:', respuesta.status);
            return false;
        }
        return true;
    } catch (error) {
        console.error('[email] No se ha podido contactar con Resend:', error.name);
        return false;
    }
}

module.exports = { estaConfigurado, enviarEmail };
