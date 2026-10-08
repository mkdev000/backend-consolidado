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

module.exports = app;
