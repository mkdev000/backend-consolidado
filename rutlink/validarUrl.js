// rutlink/validarUrl.js
// Comprueba que un enlace es una dirección web normal (http:// o https://).
// Así Rutlink no guarda ni redirige a cosas raras o peligrosas como
// "javascript:...", "data:..." o "file:...", ni textos que no son enlaces.
// NO ponemos límite de tamaño propio: acortar URLs muy largas es justo para lo que sirve Rutlink.

const PROTOCOLOS_PERMITIDOS = ['http:', 'https:'];

// Devuelve el enlace "limpio" (normalizado por el navegador estándar de URLs)
// si es válido, o null si no lo es.
function limpiarUrl(texto) {
    if (typeof texto !== 'string') return null;

    let url;
    try {
        // new URL() es el "analizador oficial" de direcciones (el mismo estándar que usan los navegadores).
        // Si el texto no es una URL completa (por ejemplo "hola" o "google.com"), lanza un error.
        url = new URL(texto.trim());
    } catch {
        return null;
    }

    if (!PROTOCOLOS_PERMITIDOS.includes(url.protocol)) return null;

    // url.href es la versión normalizada y bien codificada (sin espacios ni saltos de línea sueltos)
    return url.href;
}

module.exports = { limpiarUrl };
