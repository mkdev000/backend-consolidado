// tareas/routes/categorias.js
// Categorías (iLerna, Portfolio, Casa...): cada usuario tiene las suyas, con su color.
// Igual que en el prototipo: si creas una que ya existe (aunque cambien mayúsculas o tildes),
// se usa la que ya hay en vez de duplicarla.
const express = require('express');
const router = express.Router();
const { dbTareas } = require('../../db');
const verificarToken = require('../middleware/verificarToken');
const validar = require('../middleware/validar');
const { esquemaCategoriaCrear, esquemaCategoriaCambiar } = require('../validacion/esquemas');
const { leerId, registrarError, enTransaccion, PALETA_CATEGORIAS } = require('../utilidades');

const MAXIMO_POR_USUARIO = 100;
const COLUMNAS = 'id, uuid, nombre, color';

router.use(verificarToken);

// Mis categorías
router.get('/', async (req, res) => {
    try {
        const [categorias] = await dbTareas.query(
            `SELECT ${COLUMNAS} FROM categorias WHERE user_id = ? ORDER BY nombre`,
            [req.usuario.id]
        );
        res.json(categorias);
    } catch (error) {
        registrarError('categorias/listar', error);
        res.status(500).json({ mensaje: 'Error al obtener las categorías' });
    }
});

// Crear (o reutilizar si ya existe)
router.post('/', validar(esquemaCategoriaCrear), async (req, res) => {
    const userId = req.usuario.id;
    const { nombre, color } = req.datos;

    try {
        const resultado = await enTransaccion(dbTareas, async (conexion) => {
            // La comparación ignora mayúsculas y tildes (collation utf8mb4_0900_ai_ci)
            const [[existente]] = await conexion.query(
                `SELECT ${COLUMNAS} FROM categorias WHERE user_id = ? AND nombre = ?`,
                [userId, nombre]
            );
            if (existente) return { estado: 200, categoria: existente, existente: true };

            const [[{ total }]] = await conexion.query(
                'SELECT COUNT(*) AS total FROM categorias WHERE user_id = ?',
                [userId]
            );
            if (total >= MAXIMO_POR_USUARIO) {
                return { estado: 400, mensaje: `Puedes tener como máximo ${MAXIMO_POR_USUARIO} categorías` };
            }

            // Sin color elegido: el siguiente de la paleta del prototipo
            const colorFinal = color ?? PALETA_CATEGORIAS[total % PALETA_CATEGORIAS.length];
            const [insercion] = await conexion.query(
                'INSERT INTO categorias (user_id, nombre, color) VALUES (?, ?, ?)',
                [userId, nombre, colorFinal]
            );
            const [[nueva]] = await conexion.query(`SELECT ${COLUMNAS} FROM categorias WHERE id = ?`, [insercion.insertId]);
            return { estado: 201, categoria: nueva, existente: false };
        });

        if (resultado.mensaje) return res.status(resultado.estado).json({ mensaje: resultado.mensaje });
        res.status(resultado.estado).json({ categoria: resultado.categoria, existente: resultado.existente });
    } catch (error) {
        // Dos peticiones a la vez con el mismo nombre: la segunda se encuentra la primera ya creada
        if (error.code === 'ER_DUP_ENTRY') {
            const [[existente]] = await dbTareas
                .query(`SELECT ${COLUMNAS} FROM categorias WHERE user_id = ? AND nombre = ?`, [userId, nombre])
                .catch(() => [[null]]);
            if (existente) return res.status(200).json({ categoria: existente, existente: true });
        }
        registrarError('categorias/crear', error);
        res.status(500).json({ mensaje: 'Error al crear la categoría' });
    }
});

// Cambiar nombre o color de una categoría MÍA
router.patch('/:id', validar(esquemaCategoriaCambiar), async (req, res) => {
    const userId = req.usuario.id;
    const categoriaId = leerId(req.params.id);
    if (categoriaId === null) return res.status(400).json({ mensaje: 'Identificador de categoría no válido' });

    const { nombre, color } = req.datos;
    const cambios = [];
    const valores = [];
    if (nombre !== undefined) { cambios.push('nombre = ?'); valores.push(nombre); }
    if (color !== undefined) { cambios.push('color = ?'); valores.push(color); }

    try {
        const [resultado] = await dbTareas.query(
            `UPDATE categorias SET ${cambios.join(', ')} WHERE id = ? AND user_id = ?`,
            [...valores, categoriaId, userId]
        );
        if (resultado.affectedRows === 0) return res.status(404).json({ mensaje: 'Categoría no encontrada' });
        res.json({ mensaje: 'Categoría actualizada' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ mensaje: 'Ya tienes una categoría con ese nombre' });
        }
        registrarError('categorias/cambiar', error);
        res.status(500).json({ mensaje: 'Error al actualizar la categoría' });
    }
});

// Borrar una categoría MÍA (las tareas no se borran: solo se les quita esa categoría)
router.delete('/:id', async (req, res) => {
    const categoriaId = leerId(req.params.id);
    if (categoriaId === null) return res.status(400).json({ mensaje: 'Identificador de categoría no válido' });

    try {
        const [resultado] = await dbTareas.query(
            'DELETE FROM categorias WHERE id = ? AND user_id = ?',
            [categoriaId, req.usuario.id]
        );
        if (resultado.affectedRows === 0) return res.status(404).json({ mensaje: 'Categoría no encontrada' });
        res.json({ mensaje: 'Categoría borrada' });
    } catch (error) {
        registrarError('categorias/borrar', error);
        res.status(500).json({ mensaje: 'Error al borrar la categoría' });
    }
});

module.exports = router;
