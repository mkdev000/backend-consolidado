// app.js
// Construye la aplicación de Express (rutas y configuración) SIN encender el servidor.
// Así la pueden usar tanto index.js (para arrancar) como las pruebas automáticas.
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

// Webs (orígenes) que pueden hablar con este backend desde el navegador.
// Tienen que ser direcciones EXACTAS: nada de comodines, para que nadie pueda colarse
// creando una web con un nombre parecido.
const ORIGENES_PERMITIDOS = [
    'https://kmtask.vercel.app',                        // Tachit (producción)
    'https://kmtask-git-tachit-2-kevin-62c6.vercel.app', // Tachit (vista previa de la rama tachit-2)
    'https://rutlink.vercel.app',                       // Rutlink
    'http://localhost:5173',                            // Tachit en tu ordenador (npm run dev)
];

// helmet: añade cabeceras de seguridad a TODAS las respuestas
// (y quita "X-Powered-By: Express", que da pistas de qué tecnología usamos).
app.use(helmet());

// CORS: el navegador solo deja leer las respuestas a las webs de la lista.
app.use(cors({ origin: ORIGENES_PERMITIDOS }));

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
const subtareasRoutes = require('./tareas/routes/subtareas');
const categoriasRoutes = require('./tareas/routes/categorias');
const ajustesRoutes = require('./tareas/routes/ajustes');
app.use('/api/auth', authRoutes);
app.use('/api/tareas', tareasRoutes);
app.use('/api/subtareas', subtareasRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/ajustes', ajustesRoutes);

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
