const express = require('express');
const router = express.Router();
const { dbTareas } = require('../../db');
const verificarToken = require('../middleware/verificarToken');
const validar = require('../middleware/validar');
const { esquemaTarea } = require('../validacion/esquemas');

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
    console.error(`[tareas/${donde}]`, error.code ?? '', error.message);
}

// Crear tarea
// Orden: primero el token (¿quién eres?) y después las normas de los datos (¿qué envías?)
router.post('/', verificarToken, validar(esquemaTarea), async (req, res) => {
    const { titulo, descripcion, estado, prioridad, proyecto, fecha_limite, hora_limite } = req.datos;
    const userId = req.usuario.id;

    try {
        const [resultado] = await dbTareas.query(
            `INSERT INTO tareas (user_id, titulo, descripcion, estado, prioridad, proyecto, fecha_limite, hora_limite)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, titulo, descripcion, estado, prioridad, proyecto, fecha_limite, hora_limite]
        );
        res.status(201).json({ mensaje: 'Tarea creada correctamente', id: resultado.insertId });
    } catch (error) {
        registrarError('crear', error);
        res.status(500).json({ mensaje: 'Error al crear la tarea' });
    }
});

// Listar MIS tareas (solo las del usuario del token)
router.get('/', verificarToken, async (req, res) => {
    const userId = req.usuario.id;

    try {
        const [tareas] = await dbTareas.query(
            'SELECT * FROM tareas WHERE user_id = ? ORDER BY fecha_creacion DESC',
            [userId]
        );
        res.json(tareas);
    } catch (error) {
        registrarError('listar', error);
        res.status(500).json({ mensaje: 'Error al obtener las tareas' });
    }
});

// Editar una tarea MÍA
router.put('/:id', verificarToken, validar(esquemaTarea), async (req, res) => {
    const userId = req.usuario.id;
    const tareaId = leerId(req.params.id);
    const { titulo, descripcion, estado, prioridad, proyecto, fecha_limite, hora_limite } = req.datos;

    if (tareaId === null) {
        return res.status(400).json({ mensaje: 'Identificador de tarea no válido' });
    }

    try {
        const [resultado] = await dbTareas.query(
            `UPDATE tareas
             SET titulo = ?, descripcion = ?, estado = ?, prioridad = ?, proyecto = ?, fecha_limite = ?, hora_limite = ?
             WHERE id = ? AND user_id = ?`,
            [titulo, descripcion, estado, prioridad, proyecto, fecha_limite, hora_limite, tareaId, userId]
        );

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ mensaje: 'Tarea no encontrada' });
        }

        res.json({ mensaje: 'Tarea actualizada correctamente' });
    } catch (error) {
        registrarError('editar', error);
        res.status(500).json({ mensaje: 'Error al actualizar la tarea' });
    }
});

// Borrar una tarea MÍA
router.delete('/:id', verificarToken, async (req, res) => {
    const userId = req.usuario.id;
    const tareaId = leerId(req.params.id);

    if (tareaId === null) {
        return res.status(400).json({ mensaje: 'Identificador de tarea no válido' });
    }

    try {
        const [resultado] = await dbTareas.query(
            'DELETE FROM tareas WHERE id = ? AND user_id = ?',
            [tareaId, userId]
        );

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ mensaje: 'Tarea no encontrada' });
        }

        res.json({ mensaje: 'Tarea borrada correctamente' });
    } catch (error) {
        registrarError('borrar', error);
        res.status(500).json({ mensaje: 'Error al borrar la tarea' });
    }
});

module.exports = router;
