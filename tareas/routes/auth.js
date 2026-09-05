const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { poolTareas } = require('../../db');
const jwt = require('jsonwebtoken');

router.post('/register', async (req, res) => {
    const { nombre, email, contrasena } = req.body;

    if (!nombre || !email || !contrasena) {
        return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });
    }

    try {
        const contrasenaHasheada = await bcrypt.hash(contrasena, 10);

        poolTareas.query(
            'INSERT INTO usuarios (nombre, email, contrasena) VALUES (?, ?, ?)',
            [nombre, email, contrasenaHasheada],
            (err, results) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        return res.status(409).json({ mensaje: 'Ese email ya está registrado' });
                    }
                    console.error(err);
                    return res.status(500).json({ mensaje: 'Error al registrar el usuario' });
                }
                res.status(201).json({ mensaje: 'Usuario registrado correctamente' });
            }
        );
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
});

router.post('/login', (req, res) => {
    const { email, contrasena } = req.body;

    if (!email || !contrasena) {
        return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });
    }

    poolTareas.query('SELECT * FROM usuarios WHERE email = ?', [email], async (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ mensaje: 'Error interno del servidor' });
        }

        if (results.length === 0) {
            return res.status(401).json({ mensaje: 'Email o contraseña incorrectos' });
        }

        const usuario = results[0];
        const contrasenaCorrecta = await bcrypt.compare(contrasena, usuario.contrasena);

        if (!contrasenaCorrecta) {
            return res.status(401).json({ mensaje: 'Email o contraseña incorrectos' });
        }

        const token = jwt.sign(
            { id: usuario.id, nombre: usuario.nombre },
            process.env.JWT_SECRET,
            { expiresIn: '2h' }
        );

        res.json({ mensaje: 'Login correcto', token, nombre: usuario.nombre });
    });
});
module.exports = router;