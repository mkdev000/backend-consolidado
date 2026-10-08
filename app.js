// app.js
// Construye la aplicación de Express (rutas y configuración) SIN encender el servidor.
// Así la pueden usar tanto index.js (para arrancar) como las pruebas automáticas.
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Backend consolidado funcionando');
});

// Rutlink
const rutasRutlink = require('./rutlink/rutas');
app.use('/', rutasRutlink);

// Gestor de tareas
const authRoutes = require('./tareas/routes/auth');
const tareasRoutes = require('./tareas/routes/tareas');
app.use('/api/auth', authRoutes);
app.use('/api/tareas', tareasRoutes);

// Manejador de errores (siempre el último).
// Si algo falla y nadie lo ha controlado, responde con un JSON genérico
// en lugar de la página de error de Express, que puede enseñar detalles internos del código.
app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ mensaje: 'El cuerpo de la petición no es un JSON válido' });
    }
    // Otros errores "del cliente" (por ejemplo, un cuerpo demasiado grande): devolvemos su código sin detalles
    if (err.status >= 400 && err.status < 500) {
        return res.status(err.status).json({ mensaje: 'Petición no válida' });
    }
    console.error('[error no controlado]', err.code ?? '', err.message, err.stack);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
});

module.exports = app;
