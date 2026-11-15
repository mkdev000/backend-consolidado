// tareas/routes/ritmo.js
// Mi ritmo (Fase 9, paso 9.2). Dos rutas, siempre con sesión y siempre solo con lo TUYO:
//
//  GET  /api/ritmo?desde=&hasta=  Tu historial de esos días, "en crudo", para que la app calcule
//                                 (en ritmo.ts, paso 9.3) la racha amable, el mapa de energía,
//                                 lo que se te atasca y el plan contra lo real:
//                                   - eventos:   cuándo tachaste, destachaste o moviste cada tarea
//                                   - atascadas: las pendientes que has movido 2 veces o más
//                                   - cierres:   las semanas que ya cerraste
//  POST /api/ritmo/cierres        Cerrar la semana en 3 pasos: guarda el resumen, pasa al lunes
//                                 las pendientes que elijas y apunta el foco. TODO o NADA.
//
// La hora: el servidor no sabe en qué hora vives, así que la hora de cada evento va como
// "milisegundos desde 1970" (en), que es igual en todo el mundo. La app lo pasa a tu hora.
const express = require('express');
const router = express.Router();
const { dbTareas } = require('../../db');
const verificarToken = require('../middleware/verificarToken');
const validar = require('../middleware/validar');
const { esquemaRitmo, esquemaCierreSemana } = require('../validacion/esquemas');
const { registrarError, enTransaccion, registrarEvento } = require('../utilidades');

router.use(verificarToken);

const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTOS = 5000; // un año muy, muy activo; más que esto no hace falta para ninguna cuenta
const sumarDias = (fecha, dias) => new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);

// Un error "de los nuestros": para deshacer la transacción y responder con un mensaje claro
class ErrorCierre extends Error {
    constructor(estado, mensaje) {
        super(mensaje);
        this.estado = estado;
    }
}

// ---------- Mi historial ----------
router.get('/', validar(esquemaRitmo, 'query'), async (req, res) => {
    const userId = req.usuario.id;
    // Si no dices los días: las últimas 8 semanas (lo que enseña Mi ritmo)
    const hasta = req.datos.hasta ?? new Date().toISOString().slice(0, 10);
    const desde = req.datos.desde ?? sumarDias(hasta, -55);
    if (desde > hasta) return res.status(400).json({ mensaje: '"desde" tiene que ir antes que "hasta"' });

    try {
        // Un día de margen por cada lado: "tu" lunes puede empezar el domingo por la noche en UTC.
        // La app se queda solo con los que caen dentro de tus días.
        const [eventos] = await dbTareas.query(
            `SELECT tipo, tarea_id, UNIX_TIMESTAMP(ocurrido_en) AS segundos, fecha_anterior, fecha_nueva
             FROM tarea_eventos
             WHERE user_id = ? AND tipo IN ('completada', 'reabierta', 'movida')
               AND ocurrido_en >= ? AND ocurrido_en < ?
             ORDER BY ocurrido_en DESC, id DESC
             LIMIT ?`,
            [userId, sumarDias(desde, -1), sumarDias(hasta, 2), MAX_EVENTOS + 1]
        );
        const recortado = eventos.length > MAX_EVENTOS;
        if (recortado) eventos.pop();

        const [atascadas] = await dbTareas.query(
            `SELECT id, titulo, veces_aplazada, fecha_limite, prioridad
             FROM tareas
             WHERE user_id = ? AND estado = 'pendiente' AND veces_aplazada >= 2
             ORDER BY veces_aplazada DESC, id
             LIMIT 10`,
            [userId]
        );

        const [cierres] = await dbTareas.query(
            `SELECT semana_inicio, completadas, pasadas_al_lunes, foco_categoria_id
             FROM cierres_semana
             WHERE user_id = ? AND semana_inicio BETWEEN ? AND ?
             ORDER BY semana_inicio`,
            [userId, sumarDias(desde, -6), hasta]
        );

        res.json({
            desde,
            hasta,
            // Del más antiguo al más nuevo
            eventos: eventos.reverse().map((e) => ({
                tipo: e.tipo,
                tarea_id: e.tarea_id,
                en: Number(e.segundos) * 1000,
                fecha_anterior: e.fecha_anterior,
                fecha_nueva: e.fecha_nueva,
            })),
            recortado,
            atascadas,
            cierres,
        });
    } catch (error) {
        registrarError('ritmo/historial', error);
        res.status(500).json({ mensaje: 'Error al leer tu ritmo' });
    }
});

// ---------- Cerrar la semana ----------
router.post('/cierres', validar(esquemaCierreSemana), async (req, res) => {
    const userId = req.usuario.id;
    const { semana_inicio: semana, completadas, pasar_al_lunes: ids, foco_categoria_id: foco } = req.datos;
    const lunes = sumarDias(semana, 7); // el lunes de la semana que viene

    try {
        const movidas = await enTransaccion(dbTareas, async (conexion) => {
            // El foco tiene que ser una categoría TUYA
            if (foco !== null) {
                const [[categoria]] = await conexion.query('SELECT id FROM categorias WHERE id = ? AND user_id = ?', [foco, userId]);
                if (!categoria) throw new ErrorCierre(404, 'Esa categoría no existe');
            }

            // Primero el cierre: si esa semana ya estaba cerrada, falla aquí y no se mueve nada
            try {
                await conexion.query(
                    `INSERT INTO cierres_semana (user_id, semana_inicio, completadas, pasadas_al_lunes, foco_categoria_id)
                     VALUES (?, ?, ?, ?, ?)`,
                    [userId, semana, completadas, ids.length, foco]
                );
            } catch (error) {
                if (error.code === 'ER_DUP_ENTRY') throw new ErrorCierre(409, 'Esta semana ya está cerrada');
                throw error;
            }

            if (ids.length === 0) return 0;

            // FOR UPDATE y por orden de id, igual que en /api/tareas/horario (menos atascos)
            const [filas] = await conexion.query(
                'SELECT id, estado, fecha_limite FROM tareas WHERE user_id = ? AND id IN (?) ORDER BY id FOR UPDATE',
                [userId, ids]
            );
            // Alguna no existe o es de otra persona: no se toca NADA (y no decimos cuál, por seguridad)
            if (filas.length !== ids.length) throw new ErrorCierre(404, 'Alguna tarea no existe');
            if (filas.some((f) => f.estado !== 'pendiente')) throw new ErrorCierre(409, 'Solo se pueden pasar al lunes las tareas pendientes');

            for (const { id, fecha_limite: fechaAntes } of filas) {
                // Las mismas normas que al mover una tarea: "movida" si ya tenía otro día; "aplazada" si va a más tarde
                const cambiaFecha = Boolean(fechaAntes) && fechaAntes !== lunes;
                const aplazada = cambiaFecha && lunes > fechaAntes;
                await conexion.query(
                    `UPDATE tareas SET fecha_limite = ?${aplazada ? ', veces_aplazada = veces_aplazada + 1' : ''} WHERE id = ? AND user_id = ?`,
                    [lunes, id, userId]
                );
                if (cambiaFecha) {
                    await registrarEvento(conexion, { userId, tareaId: id, tipo: 'movida', fechaAnterior: fechaAntes, fechaNueva: lunes });
                }
            }
            return ids.length;
        });

        res.status(201).json({
            mensaje: 'Semana cerrada',
            cierre: { semana_inicio: semana, completadas, pasadas_al_lunes: movidas, foco_categoria_id: foco },
            lunes,
        });
    } catch (error) {
        if (error instanceof ErrorCierre) return res.status(error.estado).json({ mensaje: error.message });
        registrarError('ritmo/cierre', error);
        res.status(500).json({ mensaje: 'Error al cerrar la semana' });
    }
});

module.exports = router;
