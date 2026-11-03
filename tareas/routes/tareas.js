const express = require('express');
const router = express.Router();
const { dbTareas } = require('../../db');
const verificarToken = require('../middleware/verificarToken');
const validar = require('../middleware/validar');
const { esquemaTarea, esquemaTareaCrear, esquemaEstadoTarea, esquemaCategoriasDeTarea } = require('../validacion/esquemas');
const { leerId, registrarError, enTransaccion } = require('../utilidades');
const { siguienteFecha } = require('../repeticion');

// Todas las rutas de este archivo necesitan sesión
router.use(verificarToken);

// Columnas que el cliente puede enviar (las de siempre + las nuevas de Tachit)
const CAMPOS_BASICOS = ['titulo', 'descripcion', 'estado', 'prioridad', 'fecha_limite', 'hora_limite'];
const CAMPOS_NUEVOS = ['duracion_min', 'aviso_min', 'repeticion', 'dias_semana', 'icono', 'minutos_reales'];

// La base de datos guarda los días como texto "1,3"; la API los da como lista [1, 3]
const diasATexto = (dias) => (dias == null ? null : dias.join(','));
const textoADias = (texto) => (texto ? texto.split(',').map(Number) : null);

// Prepara una tarea para enviarla al cliente: días como lista, subtareas y categorías dentro
function formatearTarea(fila, subtareas = [], categorias = []) {
    return { ...fila, dias_semana: textoADias(fila.dias_semana), subtareas, categorias };
}

// Apunta un hecho en el historial (creada, completada, reabierta, movida, borrada)
function registrarEvento(conexion, { userId, tareaId, tipo, fechaAnterior = null, fechaNueva = null }) {
    return conexion.query(
        'INSERT INTO tarea_eventos (user_id, tarea_id, tipo, fecha_anterior, fecha_nueva) VALUES (?, ?, ?, ?, ?)',
        [userId, tareaId, tipo, fechaAnterior, fechaNueva]
    );
}

// Si la repetición deja de ser semanal, los días ya no tienen sentido: se vacían
function ajustarDias(datos) {
    if (datos.repeticion !== undefined && datos.repeticion !== 'semanal') datos.dias_semana = null;
}

// ---------- Listar MIS tareas, con sus subtareas y categorías ----------
router.get('/', async (req, res) => {
    const userId = req.usuario.id;

    try {
        const [tareas] = await dbTareas.query(
            'SELECT * FROM tareas WHERE user_id = ? ORDER BY fecha_creacion DESC',
            [userId]
        );
        if (tareas.length === 0) return res.json([]);

        const ids = tareas.map((t) => t.id);
        const [subtareas] = await dbTareas.query(
            'SELECT id, uuid, tarea_id, titulo, hecha, orden FROM subtareas WHERE tarea_id IN (?) ORDER BY orden, id',
            [ids]
        );
        const [uniones] = await dbTareas.query(
            `SELECT tc.tarea_id, c.id, c.nombre, c.color
             FROM tarea_categorias tc JOIN categorias c ON c.id = tc.categoria_id
             WHERE tc.user_id = ? ORDER BY c.nombre`,
            [userId]
        );

        const subtareasPorTarea = new Map();
        for (const { tarea_id, hecha, ...resto } of subtareas) {
            if (!subtareasPorTarea.has(tarea_id)) subtareasPorTarea.set(tarea_id, []);
            subtareasPorTarea.get(tarea_id).push({ ...resto, hecha: Boolean(hecha) });
        }
        const categoriasPorTarea = new Map();
        for (const { tarea_id, ...categoria } of uniones) {
            if (!categoriasPorTarea.has(tarea_id)) categoriasPorTarea.set(tarea_id, []);
            categoriasPorTarea.get(tarea_id).push(categoria);
        }

        res.json(tareas.map((t) => formatearTarea(t, subtareasPorTarea.get(t.id), categoriasPorTarea.get(t.id))));
    } catch (error) {
        registrarError('tareas/listar', error);
        res.status(500).json({ mensaje: 'Error al obtener las tareas' });
    }
});

// ---------- Crear tarea ----------
router.post('/', validar(esquemaTareaCrear), async (req, res) => {
    const userId = req.usuario.id;
    const datos = req.datos;
    ajustarDias(datos);

    // Solo se envían a la base de datos los campos que han llegado; el resto usa su valor por defecto
    const columnas = ['user_id'];
    const valores = [userId];
    for (const campo of [...CAMPOS_BASICOS, ...CAMPOS_NUEVOS, 'uuid']) {
        if (datos[campo] === undefined) continue;
        columnas.push(campo);
        valores.push(campo === 'dias_semana' ? diasATexto(datos[campo]) : datos[campo]);
    }

    try {
        const resultado = await enTransaccion(dbTareas, async (conexion) => {
            const [insercion] = await conexion.query(
                `INSERT INTO tareas (${columnas.join(', ')}) VALUES (?)`,
                [valores]
            );
            await registrarEvento(conexion, { userId, tareaId: insercion.insertId, tipo: 'creada' });
            const [[fila]] = await conexion.query('SELECT uuid FROM tareas WHERE id = ?', [insercion.insertId]);
            return { id: insercion.insertId, uuid: fila.uuid };
        });

        res.status(201).json({ mensaje: 'Tarea creada correctamente', ...resultado });
    } catch (error) {
        // El móvil reenvía una tarea que ya se guardó (modo sin conexión): no se duplica
        if (error.code === 'ER_DUP_ENTRY' && datos.uuid) {
            try {
                const [[existente]] = await dbTareas.query(
                    'SELECT id, uuid FROM tareas WHERE uuid = ? AND user_id = ?',
                    [datos.uuid, userId]
                );
                if (existente) {
                    return res.status(200).json({ mensaje: 'La tarea ya estaba guardada', ...existente, repetida: true });
                }
                return res.status(409).json({ mensaje: 'Ese identificador de tarea ya existe' });
            } catch (otroError) {
                registrarError('tareas/crear', otroError);
                return res.status(500).json({ mensaje: 'Error al crear la tarea' });
            }
        }
        registrarError('tareas/crear', error);
        res.status(500).json({ mensaje: 'Error al crear la tarea' });
    }
});

// ---------- Editar una tarea MÍA ----------
router.put('/:id', validar(esquemaTarea), async (req, res) => {
    const userId = req.usuario.id;
    const tareaId = leerId(req.params.id);
    if (tareaId === null) {
        return res.status(400).json({ mensaje: 'Identificador de tarea no válido' });
    }

    const datos = req.datos;
    ajustarDias(datos);

    try {
        const encontrada = await enTransaccion(dbTareas, async (conexion) => {
            // FOR UPDATE: bloquea la fila mientras la cambiamos, para que dos ediciones a la vez no se pisen
            const [[actual]] = await conexion.query(
                'SELECT estado, fecha_limite FROM tareas WHERE id = ? AND user_id = ? FOR UPDATE',
                [tareaId, userId]
            );
            if (!actual) return false;

            const cambios = [];
            const valores = [];
            for (const campo of [...CAMPOS_BASICOS, ...CAMPOS_NUEVOS]) {
                if (datos[campo] === undefined) continue; // los campos nuevos que no llegan, no se tocan
                cambios.push(`${campo} = ?`);
                valores.push(campo === 'dias_semana' ? diasATexto(datos[campo]) : datos[campo]);
            }

            // ¿Se ha movido a un día posterior? Entonces cuenta como "aplazada"
            const fechaAntes = actual.fecha_limite;
            const fechaDespues = datos.fecha_limite;
            const cambiaFecha = fechaAntes && fechaDespues && fechaAntes !== fechaDespues;
            if (cambiaFecha && fechaDespues > fechaAntes) cambios.push('veces_aplazada = veces_aplazada + 1');

            await conexion.query(
                `UPDATE tareas SET ${cambios.join(', ')} WHERE id = ? AND user_id = ?`,
                [...valores, tareaId, userId]
            );

            // Historial
            if (actual.estado !== 'completada' && datos.estado === 'completada') {
                await registrarEvento(conexion, { userId, tareaId, tipo: 'completada' });
            } else if (actual.estado === 'completada' && datos.estado !== 'completada') {
                await registrarEvento(conexion, { userId, tareaId, tipo: 'reabierta' });
            }
            if (cambiaFecha) {
                await registrarEvento(conexion, {
                    userId, tareaId, tipo: 'movida', fechaAnterior: fechaAntes, fechaNueva: fechaDespues,
                });
            }
            return true;
        });

        if (!encontrada) return res.status(404).json({ mensaje: 'Tarea no encontrada' });
        res.json({ mensaje: 'Tarea actualizada correctamente' });
    } catch (error) {
        registrarError('tareas/editar', error);
        res.status(500).json({ mensaje: 'Error al actualizar la tarea' });
    }
});

// ---------- Completar (o volver a dejar pendiente) una tarea MÍA ----------
// PATCH = cambiar SOLO una parte. Aquí solo llega { estado }, así que es imposible pisar
// sin querer el título, la hora o la descripción (con el PUT había que enviar la tarea entera).
// Si la tarea se repite, en la MISMA transacción se crea la siguiente vez: o se guarda todo o nada.
router.patch('/:id/estado', validar(esquemaEstadoTarea), async (req, res) => {
    const userId = req.usuario.id;
    const tareaId = leerId(req.params.id);
    if (tareaId === null) {
        return res.status(400).json({ mensaje: 'Identificador de tarea no válido' });
    }
    const { estado, hoy } = req.datos;

    try {
        const resultado = await enTransaccion(dbTareas, async (conexion) => {
            // FOR UPDATE: si llegan dos clics a la vez, el segundo espera a que termine el primero
            const [[tarea]] = await conexion.query(
                'SELECT * FROM tareas WHERE id = ? AND user_id = ? FOR UPDATE',
                [tareaId, userId]
            );
            if (!tarea) return null;

            // Ya estaba así (doble clic, o dos pestañas abiertas): no se cambia nada ni se duplica nada
            if (tarea.estado === estado) return { siguiente: null };

            const creaSiguiente = estado === 'completada' && tarea.repeticion !== null;
            // La que completas deja de repetirse: la repetición "pasa" a la tarea nueva
            await conexion.query(
                creaSiguiente
                    ? 'UPDATE tareas SET estado = ?, repeticion = NULL, dias_semana = NULL WHERE id = ? AND user_id = ?'
                    : 'UPDATE tareas SET estado = ? WHERE id = ? AND user_id = ?',
                [estado, tareaId, userId]
            );
            await registrarEvento(conexion, { userId, tareaId, tipo: estado === 'completada' ? 'completada' : 'reabierta' });
            if (!creaSiguiente) return { siguiente: null };

            // La siguiente vez: mismos datos, otro día, pendiente
            const desde = tarea.fecha_limite ?? hoy ?? new Date().toISOString().slice(0, 10);
            const fecha = siguienteFecha(desde, tarea.repeticion, textoADias(tarea.dias_semana));
            const [insercion] = await conexion.query(
                `INSERT INTO tareas (user_id, titulo, descripcion, estado, prioridad, fecha_limite, hora_limite,
                                     duracion_min, aviso_min, repeticion, dias_semana, icono)
                 VALUES (?, ?, ?, 'pendiente', ?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, tarea.titulo, tarea.descripcion, tarea.prioridad, fecha, tarea.hora_limite,
                    tarea.duracion_min, tarea.aviso_min, tarea.repeticion, tarea.dias_semana, tarea.icono]
            );
            const nuevaId = insercion.insertId;
            await registrarEvento(conexion, { userId, tareaId: nuevaId, tipo: 'creada' });
            // Sus categorías (copiadas de la tabla de unión, que solo tiene las MÍAS)
            await conexion.query(
                `INSERT INTO tarea_categorias (tarea_id, categoria_id, user_id)
                 SELECT ?, categoria_id, user_id FROM tarea_categorias WHERE tarea_id = ? AND user_id = ?`,
                [nuevaId, tareaId, userId]
            );
            // Sus subtareas, otra vez sin marcar y en el mismo orden
            await conexion.query(
                'INSERT INTO subtareas (tarea_id, titulo, orden) SELECT ?, titulo, orden FROM subtareas WHERE tarea_id = ? ORDER BY orden, id',
                [nuevaId, tareaId]
            );
            return { siguiente: { id: nuevaId, fecha_limite: fecha } };
        });

        if (!resultado) return res.status(404).json({ mensaje: 'Tarea no encontrada' });
        res.json({
            mensaje: estado === 'completada' ? 'Tarea completada' : 'Tarea pendiente otra vez',
            estado,
            siguiente: resultado.siguiente,
        });
    } catch (error) {
        registrarError('tareas/estado', error);
        res.status(500).json({ mensaje: 'Error al cambiar el estado de la tarea' });
    }
});

// ---------- Elegir las categorías de una tarea MÍA ----------
router.put('/:id/categorias', validar(esquemaCategoriasDeTarea), async (req, res) => {
    const userId = req.usuario.id;
    const tareaId = leerId(req.params.id);
    if (tareaId === null) {
        return res.status(400).json({ mensaje: 'Identificador de tarea no válido' });
    }
    const { ids } = req.datos;

    try {
        const resultado = await enTransaccion(dbTareas, async (conexion) => {
            const [[tarea]] = await conexion.query(
                'SELECT id FROM tareas WHERE id = ? AND user_id = ? FOR UPDATE',
                [tareaId, userId]
            );
            if (!tarea) return { estado: 404, mensaje: 'Tarea no encontrada' };

            if (ids.length > 0) {
                // Todas las categorías tienen que ser MÍAS
                const [[{ mias }]] = await conexion.query(
                    'SELECT COUNT(*) AS mias FROM categorias WHERE id IN (?) AND user_id = ?',
                    [ids, userId]
                );
                if (mias !== ids.length) return { estado: 404, mensaje: 'Alguna categoría no existe' };
            }

            await conexion.query('DELETE FROM tarea_categorias WHERE tarea_id = ? AND user_id = ?', [tareaId, userId]);
            if (ids.length > 0) {
                await conexion.query(
                    'INSERT INTO tarea_categorias (tarea_id, categoria_id, user_id) VALUES ?',
                    [ids.map((id) => [tareaId, id, userId])]
                );
            }
            return { estado: 200 };
        });

        if (resultado.estado !== 200) return res.status(resultado.estado).json({ mensaje: resultado.mensaje });
        res.json({ mensaje: 'Categorías actualizadas', ids });
    } catch (error) {
        registrarError('tareas/categorias', error);
        res.status(500).json({ mensaje: 'Error al guardar las categorías' });
    }
});

// ---------- Borrar una tarea MÍA ----------
router.delete('/:id', async (req, res) => {
    const userId = req.usuario.id;
    const tareaId = leerId(req.params.id);
    if (tareaId === null) {
        return res.status(400).json({ mensaje: 'Identificador de tarea no válido' });
    }

    try {
        const borrada = await enTransaccion(dbTareas, async (conexion) => {
            const [[tarea]] = await conexion.query(
                'SELECT id FROM tareas WHERE id = ? AND user_id = ? FOR UPDATE',
                [tareaId, userId]
            );
            if (!tarea) return false;
            // Se apunta ANTES de borrar; al borrar, el historial se queda sin tarea (SET NULL) pero se conserva
            await registrarEvento(conexion, { userId, tareaId, tipo: 'borrada' });
            await conexion.query('DELETE FROM tareas WHERE id = ? AND user_id = ?', [tareaId, userId]);
            return true;
        });

        if (!borrada) return res.status(404).json({ mensaje: 'Tarea no encontrada' });
        res.json({ mensaje: 'Tarea borrada correctamente' });
    } catch (error) {
        registrarError('tareas/borrar', error);
        res.status(500).json({ mensaje: 'Error al borrar la tarea' });
    }
});

module.exports = router;
