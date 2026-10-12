const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { dbTareas } = require('../../db');
const validar = require('../middleware/validar');
const { esquemaRegistro, esquemaLogin } = require('../validacion/esquemas');
const { limiteLoginPorIp, limiteLoginPorEmail, limiteRegistro } = require('../middleware/limites');

// Hash falso: si el email no existe, comparamos igualmente contra este hash.
// Así el login tarda lo mismo exista o no el email, y nadie puede averiguar
// qué emails están registrados midiendo el tiempo de respuesta.
const HASH_FALSO = bcrypt.hashSync('usuario-que-no-existe', 10);

// Registra el error SIN volcar la consulta SQL completa
// (podría incluir el email o el hash de la contraseña).
function registrarError(donde, error) {
    console.error(`[auth/${donde}]`, error.code ?? '', error.message);
}

// limiteRegistro: máximo 10 registros por hora desde la misma conexión
// validar(esquemaRegistro): nombre, email válido y contraseña segura (requisitos del prototipo)
router.post('/register', limiteRegistro, validar(esquemaRegistro), async (req, res) => {
    const { nombre, email, contrasena } = req.datos;

    try {
        const contrasenaHasheada = await bcrypt.hash(contrasena, 10);

        await dbTareas.query(
            'INSERT INTO usuarios (nombre, email, contrasena) VALUES (?, ?, ?)',
            [nombre, email, contrasenaHasheada]
        );

        res.status(201).json({ mensaje: 'Usuario registrado correctamente' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ mensaje: 'Ese email ya está registrado' });
        }
        registrarError('register', error);
        res.status(500).json({ mensaje: 'Error al registrar el usuario' });
    }
});

// Los límites van ANTES de validar: así también cuentan los intentos con datos mal formados.
// limiteLoginPorIp: 5 fallos por minuto desde la misma conexión
// limiteLoginPorEmail: 10 fallos cada 15 minutos contra la misma cuenta
// validar(esquemaLogin): email y contraseña son textos de tamaño razonable
router.post('/login', limiteLoginPorIp, limiteLoginPorEmail, validar(esquemaLogin), async (req, res) => {
    const { email, contrasena } = req.datos;

    try {
        const [filas] = await dbTareas.query(
            'SELECT id, nombre, contrasena FROM usuarios WHERE email = ?',
            [email]
        );
        const usuario = filas[0];

        const contrasenaCorrecta = await bcrypt.compare(
            contrasena,
            usuario ? usuario.contrasena : HASH_FALSO
        );

        if (!usuario || !contrasenaCorrecta) {
            return res.status(401).json({ mensaje: 'Email o contraseña incorrectos' });
        }

        const token = jwt.sign(
            { id: usuario.id, nombre: usuario.nombre },
            process.env.JWT_SECRET,
            { expiresIn: '2h', algorithm: 'HS256' }
        );

        res.json({ mensaje: 'Login correcto', token, nombre: usuario.nombre });
    } catch (error) {
        registrarError('login', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
});

module.exports = router;
