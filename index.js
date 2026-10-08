// index.js
// Enciende el servidor: coge la app de app.js y la pone a escuchar en un puerto.
require('dotenv').config();

// Antes de arrancar, comprobamos que existen las variables secretas necesarias.
// Solo se muestran los NOMBRES que faltan, nunca los valores.
const obligatorias = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET'];
const faltan = obligatorias.filter((nombre) => !process.env[nombre]);
if (faltan.length > 0) {
    console.error(`Faltan variables de entorno: ${faltan.join(', ')}`);
    process.exit(1);
}

const app = require('./app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor consolidado corriendo en el puerto ${PORT}`);
});
