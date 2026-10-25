// tareas/utilidades.js
// Pequeñas herramientas que usan varias rutas de Tachit.

// Convierte el :id de la URL en número. Solo acepta dígitos ("15"), nada de "1e3", " 5" o "0x10".
// Devuelve null si no es un entero positivo válido.
function leerId(valor) {
    if (!/^[1-9][0-9]{0,9}$/.test(valor)) return null;
    const id = Number(valor);
    return id <= 2147483647 ? id : null; // máximo de un INT en MySQL
}

// Registra el error en el servidor SIN volcar la consulta SQL completa
// (que puede incluir datos personales del usuario, como el texto de sus tareas).
function registrarError(donde, error) {
    console.error(`[${donde}]`, error.code ?? '', error.message);
}

// Errores de "atasco" de MySQL: dos transacciones se esperan la una a la otra (deadlock) o una espera
// demasiado. MySQL deshace una de ellas y recomienda simplemente volver a intentarlo.
const ERRORES_DE_ATASCO = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);
const INTENTOS_MAXIMOS = 4;
const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

// Ejecuta varias órdenes como UNA transacción: o se guardan todas o ninguna.
// Si algo falla a mitad, se deshace todo (rollback) y el error sigue hacia arriba.
// Si el fallo es un atasco (deadlock), se repite la transacción entera (hasta 4 veces), esperando
// un poco al azar entre intentos para que las dos peticiones no vuelvan a chocar a la vez.
// Es seguro repetir porque el rollback deja la base de datos como estaba antes de empezar.
async function enTransaccion(db, trabajo) {
    for (let intento = 1; ; intento++) {
        const conexion = await db.getConnection();
        try {
            await conexion.beginTransaction();
            const resultado = await trabajo(conexion);
            await conexion.commit();
            return resultado;
        } catch (error) {
            await conexion.rollback().catch(() => {});
            if (!ERRORES_DE_ATASCO.has(error.code) || intento >= INTENTOS_MAXIMOS) throw error;
        } finally {
            conexion.release();
        }
        await esperar(15 + Math.floor(Math.random() * 60 * intento));
    }
}

// Colores de las categorías nuevas, por turnos (PALETTE del prototipo)
const PALETA_CATEGORIAS = ['#17699e', '#6d4fc9', '#1b7a50', '#9a5b00', '#b83a70', '#0e6f78'];

module.exports = { leerId, registrarError, enTransaccion, PALETA_CATEGORIAS };
