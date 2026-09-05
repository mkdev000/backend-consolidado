const express = require('express');
const cors = require('cors');
require('dotenv').config();

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor consolidado corriendo en el puerto ${PORT}`);
});