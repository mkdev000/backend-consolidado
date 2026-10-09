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

// Ejecuta varias órdenes como UNA transacción: o se guardan todas o ninguna.
// Si algo falla a mitad, se deshace todo (rollback) y el error sigue hacia arriba.
async function enTransaccion(db, trabajo) {
    const conexion = await db.getConnection();
    try {
        await conexion.beginTransaction();
        const resultado = await trabajo(conexion);
        await conexion.commit();
        return resultado;
    } catch (error) {
        await conexion.rollback().catch(() => {});
        throw error;
    } finally {
        conexion.release();
    }
}

// Colores de las categorías nuevas, por turnos (PALETTE del prototipo)
const PALETA_CATEGORIAS = ['#17699e', '#6d4fc9', '#1b7a50', '#9a5b00', '#b83a70', '#0e6f78'];

module.exports = { leerId, registrarError, enTransaccion, PALETA_CATEGORIAS };
