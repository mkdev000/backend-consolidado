const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2');
require('dotenv').config();

// Certificado de Aiven (CA). Es PÚBLICO: no es una clave secreta.
// Sirve para comprobar que el servidor al otro lado es de verdad Aiven y no un impostor.
// Se descarga en Aiven → tu servicio MySQL → "CA certificate".
const RUTA_CERTIFICADO = path.join(__dirname, 'certs', 'aiven-ca.pem');
const certificadoAiven = fs.readFileSync(RUTA_CERTIFICADO);

const configBase = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    // La conexión va cifrada Y se comprueba que el certificado del servidor lo firmó Aiven.
    // (Antes era rejectUnauthorized: false, que cifraba pero NO comprobaba con quién hablábamos.)
    ssl: { ca: certificadoAiven, rejectUnauthorized: true },
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