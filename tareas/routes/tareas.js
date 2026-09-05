const express = require('express');
const router = express.Router();
const { poolTareas } = require('../../db');
const verificarToken = require('../middleware/verificarToken');

router.post('/', verificarToken, (req, res) => {
    const { titulo, descripcion, estado, prioridad, proyecto, fecha_limite, hora_limite } = req.body;
    const userId = req.usuario.id;

    if (!titulo) {
        return res.status(400).json({ mensaje: 'El título es obligatorio' });
    }

    poolTareas.query(
        `INSERT INTO tareas (user_id, titulo, descripcion, estado, prioridad, proyecto, fecha_limite, hora_limite)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, titulo, descripcion, estado, prioridad, proyecto, fecha_limite, hora_limite],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ mensaje: 'Error al crear la tarea' });
            }
            res.status(201).json({ mensaje: 'Tarea creada correctamente', id: results.insertId });
        }
    );
});

router.get('/', verificarToken, (req, res) => {
    const userId = req.usuario.id;

    poolTareas.query(
        'SELECT * FROM tareas WHERE user_id = ? ORDER BY fecha_creacion DESC',
        [userId],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ mensaje: 'Error al obtener las tareas' });
            }
            res.json(results);
        }
    );
});

router.put('/:id', verificarToken, (req, res) => {
    const userId = req.usuario.id;
    const tareaId = req.params.id;
    const { titulo, descripcion, estado, prioridad, proyecto, fecha_limite, hora_limite } = req.body;

    if (!titulo) {
        return res.status(400).json({ mensaje: 'El título es obligatorio' });
    }

    poolTareas.query(
        `UPDATE tareas
         SET titulo = ?, descripcion = ?, estado = ?, prioridad = ?, proyecto = ?, fecha_limite = ?, hora_limite = ?
         WHERE id = ? AND user_id = ?`,
        [titulo, descripcion, estado, prioridad, proyecto, fecha_limite, hora_limite, tareaId, userId],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ mensaje: 'Error al actualizar la tarea' });
            }

            if (results.affectedRows === 0) {
                return res.status(404).json({ mensaje: 'Tarea no encontrada' });
            }

            res.json({ mensaje: 'Tarea actualizada correctamente' });
        }
    );
});

router.delete('/:id', verificarToken, (req, res) => {
    const userId = req.usuario.id;
    const tareaId = req.params.id;

    poolTareas.query(
        'DELETE FROM tareas WHERE id = ? AND user_id = ?',
        [tareaId, userId],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ mensaje: 'Error al borrar la tarea' });
            }

            if (results.affectedRows === 0) {
                return res.status(404).json({ mensaje: 'Tarea no encontrada' });
            }

            res.json({ mensaje: 'Tarea borrada correctamente' });
        }
    );
});

module.exports = router;