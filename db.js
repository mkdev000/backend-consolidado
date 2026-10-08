const mysql = require('mysql2');
require('dotenv').config();

const configBase = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    dateStrings: true
};

const poolRutlink = mysql.createPool({
    ...configBase,
    database: 'defaultdb'
});

const poolTareas = mysql.createPool({
    ...configBase,
    // En tu ordenador (.env) usa la copia de pruebas; en Render, sin variable, usa la real
    database: process.env.DB_NAME_TAREAS || 'gestor_tareas'
});

// Versión con promesas del pool de tareas: permite usar async/await
// (const [filas] = await dbTareas.query(...)) en lugar de callbacks.
const dbTareas = poolTareas.promise();

// configBase también se exporta para el script de migraciones (scripts/migrar.js)
module.exports = { poolRutlink, poolTareas, dbTareas, configBase };