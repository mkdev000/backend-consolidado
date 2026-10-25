// tareas/middleware/limites.js
// Límites de intentos para el login y el registro (defensa contra la fuerza bruta).
// Funciona como un portero con libreta: apunta cuántos intentos fallidos hace cada uno
// y, si se pasa del límite, le dice "espera un poco" (código 429) sin mirar siquiera la contraseña.
const { rateLimit } = require('express-rate-limit');

const MINUTO = 60 * 1000;

// Opciones comunes de todos los límites
const comunes = {
    standardHeaders: 'draft-8', // cabecera RateLimit estándar: le dice al cliente cuánto le queda
    legacyHeaders: false,       // sin las cabeceras antiguas X-RateLimit-*
};

// 1) Login por conexión (IP): 5 intentos FALLIDOS por minuto.
//    Los logins correctos no cuentan (skipSuccessfulRequests), así un usuario normal nunca se bloquea.
const limiteLoginPorIp = rateLimit({
    ...comunes,
    windowMs: MINUTO,
    limit: 5,
    skipSuccessfulRequests: true,
    message: { mensaje: 'Demasiados intentos de inicio de sesión. Espera un minuto y vuelve a probar.' },
});

// 2) Login por cuenta (email): 10 intentos FALLIDOS cada 15 minutos.
//    Protege una cuenta aunque el atacante vaya cambiando de conexión (IP).
//    El email se normaliza igual que en la validación (sin espacios y en minúsculas),
//    para que "Ana@x.com" y "ana@x.com " cuenten como la misma cuenta.
const limiteLoginPorEmail = rateLimit({
    ...comunes,
    windowMs: 15 * MINUTO,
    limit: 10,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
        const email = req.body?.email;
        return typeof email === 'string' ? `email:${email.trim().toLowerCase().slice(0, 254)}` : 'email:(ninguno)';
    },
    message: { mensaje: 'Demasiados intentos de inicio de sesión en esta cuenta. Espera 15 minutos y vuelve a probar.' },
});

// 3) Registro por conexión (IP): 10 cuentas nuevas por hora.
//    Evita que alguien cree miles de cuentas falsas o sature el servidor
//    (cifrar cada contraseña con bcrypt cuesta trabajo al procesador).
const limiteRegistro = rateLimit({
    ...comunes,
    windowMs: 60 * MINUTO,
    limit: 10,
    message: { mensaje: 'Demasiados registros desde esta conexión. Inténtalo más tarde.' },
});

// 4) "¿Olvidaste tu contraseña?" por conexión (IP): 5 peticiones cada 15 minutos.
//    Aquí cuentan TODAS (la respuesta siempre es la misma), para que nadie use Tachit para llenar
//    de emails la bandeja de otra persona ni gaste los envíos gratis de Resend.
const limiteRecuperacionPorIp = rateLimit({
    ...comunes,
    windowMs: 15 * MINUTO,
    limit: 5,
    message: { mensaje: 'Demasiadas peticiones para recuperar la contraseña. Espera 15 minutos y vuelve a probar.' },
});

// 5) "¿Olvidaste tu contraseña?" por email: 3 enlaces por hora a la misma dirección,
//    aunque el atacante vaya cambiando de conexión.
const limiteRecuperacionPorEmail = rateLimit({
    ...comunes,
    windowMs: 60 * MINUTO,
    limit: 3,
    keyGenerator: (req) => {
        const email = req.body?.email;
        return typeof email === 'string' ? `recuperar:${email.trim().toLowerCase().slice(0, 254)}` : 'recuperar:(ninguno)';
    },
    message: { mensaje: 'Ya hemos enviado varios enlaces a este email. Revisa tu bandeja (y el spam) o espera una hora.' },
});

// 6) Usar el enlace (poner contraseña nueva): 10 intentos FALLIDOS cada 15 minutos por conexión.
const limiteRestablecer = rateLimit({
    ...comunes,
    windowMs: 15 * MINUTO,
    limit: 10,
    skipSuccessfulRequests: true,
    message: { mensaje: 'Demasiados intentos. Espera 15 minutos y vuelve a probar.' },
});

// 7) Renovar la sesión: 60 peticiones cada 15 minutos por conexión. Un uso normal pide 1 cada 15 minutos
//    por pestaña (más una al abrir la app), así que nadie normal llega; un atacante probando pases, sí.
const limiteRenovar = rateLimit({
    ...comunes,
    windowMs: 15 * MINUTO,
    limit: 60,
    message: { mensaje: 'Demasiadas peticiones. Espera unos minutos y vuelve a probar.' },
});

module.exports = {
    limiteLoginPorIp,
    limiteLoginPorEmail,
    limiteRegistro,
    limiteRecuperacionPorIp,
    limiteRecuperacionPorEmail,
    limiteRestablecer,
    limiteRenovar,
};
