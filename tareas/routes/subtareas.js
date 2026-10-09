// tareas/routes/subtareas.js
// Subtareas: los pasos de cada tarea (el hilo punteado con rombos del prototipo).
// Regla de oro: solo puedes tocar subtareas de TUS tareas (se comprueba en cada consulta).
const express = require('express');
const router = express.Router();
const { dbTareas } = require('../../db');
const verificarToken = require('../middleware/verificarToken');
const validar = require('../middleware/validar');
const { esquemaSubtareaCrear, esquemaSubtareaCambiar } = require('../validacion/esquemas');
const { leerId, registrarError, enTransaccion } = require('../utilidades');

const MAXIMO_POR_TAREA = 50;

router.use(verificarToken);

// Crear una subtarea al final de la lista de una tarea MÍA
router.post('/', validar(esquemaSubtareaCrear), async (req, res) => {
    const userId = req.usuario.id;
    const { tarea_id: tareaId, titulo } = req.datos;

    try {
        const resultado = await enTransaccion(dbTareas, async (conexion) => {
            const [[tarea]] = await conexion.query(
                'SELECT id FROM tareas WHERE id = ? AND user_id = ? FOR UPDATE',
                [tareaId, userId]
            );
            if (!tarea) return { estado: 404, mensaje: 'Tarea no encontrada' };

            const [[{ total, ultimo }]] = await conexion.query(
                'SELECT COUNT(*) AS total, MAX(orden) AS ultimo FROM subtareas WHERE tarea_id = ?',
                [tareaId]
            );
            if (total >= MAXIMO_POR_TAREA) {
                return { estado: 400, mensaje: `Una tarea puede tener como máximo ${MAXIMO_POR_TAREA} subtareas` };
            }

            const orden = ultimo === null ? 0 : ultimo + 1;
            const [insercion] = await conexion.query(
                'INSERT INTO subtareas (tarea_id, titulo, orden) VALUES (?, ?, ?)',
                [tareaId, titulo, orden]
            );
            const [[subtarea]] = await conexion.query(
                'SELECT id, uuid, tarea_id, titulo, hecha, orden FROM subtareas WHERE id = ?',
                [insercion.insertId]
            );
            return { estado: 201, subtarea: { ...subtarea, hecha: Boolean(subtarea.hecha) } };
        });

        if (resultado.estado !== 201) return res.status(resultado.estado).json({ mensaje: resultado.mensaje });
        res.status(201).json({ mensaje: 'Subtarea creada', subtarea: resultado.subtarea });
    } catch (error) {
        registrarError('subtareas/crear', error);
        res.status(500).json({ mensaje: 'Error al crear la subtarea' });
    }
});

// Cambiar el título o marcar/desmarcar una subtarea MÍA
router.patch('/:id', validar(esquemaSubtareaCambiar), async (req, res) => {
    const userId = req.usuario.id;
    const subtareaId = leerId(req.params.id);
    if (subtareaId === null) return res.status(400).json({ mensaje: 'Identificador de subtarea no válido' });

    const { titulo, hecha } = req.datos;
    const cambios = [];
    const valores = [];
    if (titulo !== undefined) { cambios.push('s.titulo = ?'); valores.push(titulo); }
    if (hecha !== undefined) { cambios.push('s.hecha = ?'); valores.push(hecha); }

    try {
        // El JOIN con tareas comprueba que la subtarea es de una tarea MÍA
        const [resultado] = await dbTareas.query(
            `UPDATE subtareas s JOIN tareas t ON t.id = s.tarea_id
             SET ${cambios.join(', ')}
             WHERE s.id = ? AND t.user_id = ?`,
            [...valores, subtareaId, userId]
        );
        if (resultado.affectedRows === 0) return res.status(404).json({ mensaje: 'Subtarea no encontrada' });
        res.json({ mensaje: 'Subtarea actualizada' });
    } catch (error) {
        registrarError('subtareas/cambiar', error);
        res.status(500).json({ mensaje: 'Error al actualizar la subtarea' });
    }
});

// Borrar una subtarea MÍA
router.delete('/:id', async (req, res) => {
    const userId = req.usuario.id;
    const subtareaId = leerId(req.params.id);
    if (subtareaId === null) return res.status(400).json({ mensaje: 'Identificador de subtarea no válido' });

    try {
        const [resultado] = await dbTareas.query(
            'DELETE s FROM subtareas s JOIN tareas t ON t.id = s.tarea_id WHERE s.id = ? AND t.user_id = ?',
            [subtareaId, userId]
        );
        if (resultado.affectedRows === 0) return res.status(404).json({ mensaje: 'Subtarea no encontrada' });
        res.json({ mensaje: 'Subtarea borrada' });
    } catch (error) {
        registrarError('subtareas/borrar', error);
        res.status(500).json({ mensaje: 'Error al borrar la subtarea' });
    }
});

module.exports = router;
