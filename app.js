// app.js
// Construye la aplicación de Express (rutas y configuración) SIN encender el servidor.
// Así la pueden usar tanto index.js (para arrancar) como las pruebas automáticas.
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

// Cuántos intermediarios (proxies) hay entre el usuario y este servidor.
// En tu ordenador no hay ninguno (0). En Render sí los hay: el número exacto lo mediremos
// en la Fase 14 y lo pondremos en la variable PROXIES_DE_CONFIANZA de Render.
// Hace falta para saber la IP real de cada usuario (la usan los límites de intentos).
// OJO: un número demasiado alto dejaría que un atacante se inventara su IP.
const proxies = Number.parseInt(process.env.PROXIES_DE_CONFIANZA ?? '0', 10);
app.set('trust proxy', Number.isInteger(proxies) && proxies >= 0 && proxies <= 5 ? proxies : 0);
// Render pone la variable RENDER en sus servidores: si estamos allí y falta el número, avisamos en los logs.
if (process.env.RENDER && process.env.PROXIES_DE_CONFIANZA === undefined) {
    console.warn('[aviso] Falta PROXIES_DE_CONFIANZA en Render: los límites de intentos no distinguirán a los usuarios.');
}

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
