// tareas/routes/ajustes.js
// Ajustes del usuario: lo que se cambia en el Menú (móvil) y en Ajustes (web) del prototipo.
const express = require('express');
const router = express.Router();
const { dbTareas } = require('../../db');
const verificarToken = require('../middleware/verificarToken');
const validar = require('../middleware/validar');
const { esquemaAjustes } = require('../validacion/esquemas');
const { registrarError } = require('../utilidades');

const INTERRUPTORES = [
    'avisos_activos', 'briefing_activo', 'copia_drive_activa', 'energia_al_reorganizar', 'corregir_tiempos',
];
// Lista fija de columnas que se pueden cambiar (nunca se construye SQL con nombres que manda el cliente)
const CAMBIABLES = ['tema', 'idioma', 'zona_horaria', ...INTERRUPTORES];

router.use(verificarToken);

// Mis ajustes (sin contraseña ni datos internos)
router.get('/', async (req, res) => {
    try {
        const [[usuario]] = await dbTareas.query(
            `SELECT nombre, email, ${CAMBIABLES.join(', ')} FROM usuarios WHERE id = ?`,
            [req.usuario.id]
        );
        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        for (const campo of INTERRUPTORES) usuario[campo] = Boolean(usuario[campo]);
        res.json(usuario);
    } catch (error) {
        registrarError('ajustes/leer', error);
        res.status(500).json({ mensaje: 'Error al obtener los ajustes' });
    }
});

// Cambiar uno o varios ajustes
router.patch('/', validar(esquemaAjustes), async (req, res) => {
    const userId = req.usuario.id;
    const datos = req.datos;

    try {
        // La copia en Drive solo se puede encender si la cuenta de Google está conectada (Fase 11)
        if (datos.copia_drive_activa === true) {
            const [[google]] = await dbTareas.query('SELECT user_id FROM cuentas_google WHERE user_id = ?', [userId]);
            if (!google) return res.status(409).json({ mensaje: 'Conecta tu cuenta de Google antes de activar la copia en Drive' });
        }

        const cambios = [];
        const valores = [];
        for (const campo of CAMBIABLES) {
            if (datos[campo] === undefined) continue;
            cambios.push(`${campo} = ?`);
            valores.push(datos[campo]);
        }

        const [resultado] = await dbTareas.query(
            `UPDATE usuarios SET ${cambios.join(', ')} WHERE id = ?`,
            [...valores, userId]
        );
        if (resultado.affectedRows === 0) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        res.json({ mensaje: 'Ajustes guardados' });
    } catch (error) {
        registrarError('ajustes/cambiar', error);
        res.status(500).json({ mensaje: 'Error al guardar los ajustes' });
    }
});

module.exports = router;
