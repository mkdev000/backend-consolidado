const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { dbTareas } = require('../../db');

// Hash falso: si el email no existe, comparamos igualmente contra este hash.
// Así el login tarda lo mismo exista o no el email, y nadie puede averiguar
// qué emails están registrados midiendo el tiempo de respuesta.
const HASH_FALSO = bcrypt.hashSync('usuario-que-no-existe', 10);

// true si el valor es un texto con algo escrito
const esTexto = (valor) => typeof valor === 'string' && valor.trim() !== '';

// Registra el error SIN volcar la consulta SQL completa
// (podría incluir el email o el hash de la contraseña).
function registrarError(donde, error) {
    console.error(`[auth/${donde}]`, error.code ?? '', error.message);
}

router.post('/register', async (req, res) => {
    const { nombre, email, contrasena } = req.body ?? {};

    if (!esTexto(nombre) || !esTexto(email) || !esTexto(contrasena)) {
        return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });
    }

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

router.post('/login', async (req, res) => {
    const { email, contrasena } = req.body ?? {};

    if (!esTexto(email) || !esTexto(contrasena)) {
        return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });
    }

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
