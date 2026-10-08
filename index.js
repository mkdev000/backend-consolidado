// index.js
// Enciende el servidor: coge la app de app.js y la pone a escuchar en un puerto.
require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor consolidado corriendo en el puerto ${PORT}`);
});
