// tareas/middleware/validar.js
// El "portero": comprueba el cuerpo de la petición con un esquema de Zod ANTES de llegar a la ruta.
//  - Si algo no cumple: responde 400 con el primer mensaje (para enseñarlo en pantalla)
//    y la lista de errores por campo. Nunca repite los datos que envió el usuario.
//  - Si todo cumple: deja en req.datos los datos YA LIMPIOS y solo con los campos permitidos.
function validar(esquema) {
    return (req, res, next) => {
        const resultado = esquema.safeParse(req.body ?? {});

        if (!resultado.success) {
            const errores = resultado.error.issues.map((problema) => ({
                campo: problema.path.join('.') || null,
                // Si el cuerpo entero tiene el tipo equivocado (por ejemplo, llega una lista en vez de
                // un objeto), usamos un mensaje propio en español en lugar del de Zod.
                mensaje: problema.path.length === 0 && problema.code === 'invalid_type'
                    ? 'Los datos enviados no tienen el formato correcto'
                    : problema.message,
            }));
            return res.status(400).json({ mensaje: errores[0].mensaje, errores });
        }

        req.datos = resultado.data;
        next();
    };
}

module.exports = validar;
