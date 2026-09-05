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
    database: 'acortador_urls'
});

const poolTareas = mysql.createPool({
    ...configBase,
    database: 'gestor_tareas'
});

module.exports = { poolRutlink, poolTareas };