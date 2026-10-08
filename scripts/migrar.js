// scripts/migrar.js
// Aplica, en orden, los cambios de la base de datos guardados en la carpeta "migraciones".
// Apunta en la tabla "migraciones" cuáles se han aplicado ya, para no repetir nunca ninguna.
//
// Uso:
//   npm run migrar          -> aplica las migraciones pendientes (solo en la base de datos de pruebas _dev)
//   npm run migrar:estado   -> solo enseña cuáles están aplicadas y cuáles pendientes (no cambia nada)
//   node scripts/migrar.js --base-real   -> SOLO en la Fase 14, para la base de datos real
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { configBase } = require('../db');

const CARPETA_MIGRACIONES = path.join(__dirname, '..', 'migraciones');
// Formato obligatorio del nombre: tres cifras, guion bajo y descripción. Ejemplo: 001_esquema_inicial.sql
const PATRON_NOMBRE = /^\d{3}_[a-z0-9_]+\.sql$/;
const NOMBRE_BLOQUEO = 'tachit_migraciones';

// "Huella" del archivo: si alguien cambia una migración ya aplicada, la huella deja de coincidir.
// Quitamos los \r para que la huella sea igual en Windows (CRLF) y en Linux/Render (LF).
function calcularHuella(sql) {
    return crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

// Lee la carpeta de migraciones, comprueba los nombres y las devuelve ordenadas.
function listarMigraciones(carpeta = CARPETA_MIGRACIONES) {
    const archivos = fs.readdirSync(carpeta).filter((nombre) => nombre.endsWith('.sql'));

    const nombresMalos = archivos.filter((nombre) => !PATRON_NOMBRE.test(nombre));
    if (nombresMalos.length > 0) {
        throw new Error(`Nombres de migración no válidos: ${nombresMalos.join(', ')} (formato: 001_descripcion.sql)`);
    }

    archivos.sort();

    const numeros = archivos.map((nombre) => nombre.slice(0, 3));
    const repetidos = numeros.filter((numero, i) => numeros.indexOf(numero) !== i);
    if (repetidos.length > 0) {
        throw new Error(`Hay dos migraciones con el mismo número: ${[...new Set(repetidos)].join(', ')}`);
    }

    return archivos.map((nombre) => {
        const sql = fs.readFileSync(path.join(carpeta, nombre), 'utf8');
        return { nombre, sql, huella: calcularHuella(sql) };
    });
}

// Compara lo que hay en la carpeta con lo que la base de datos dice que ya está aplicado.
// Devuelve las pendientes o lanza un error si algo no cuadra.
function calcularPendientes(migraciones, aplicadas) {
    for (const [nombre, huella] of aplicadas) {
        const migracion = migraciones.find((m) => m.nombre === nombre);
        if (!migracion) {
            throw new Error(`La migración ${nombre} está aplicada en la base de datos, pero su archivo ya no existe`);
        }
        if (migracion.huella !== huella) {
            throw new Error(
                `La migración ${nombre} ya se aplicó y su archivo ha cambiado. ` +
                'Una migración aplicada no se modifica nunca: crea una nueva con el siguiente número.'
            );
        }
    }

    const pendientes = migraciones.filter((m) => !aplicadas.has(m.nombre));
    const ultimaAplicada = [...aplicadas.keys()].sort().pop();
    const desordenada = pendientes.find((m) => ultimaAplicada && m.nombre < ultimaAplicada);
    if (desordenada) {
        throw new Error(`La migración ${desordenada.nombre} tiene un número anterior a una ya aplicada (${ultimaAplicada}). Usa un número mayor.`);
    }
    return pendientes;
}

async function main() {
    const soloEstado = process.argv.includes('--estado');
    const permitirBaseReal = process.argv.includes('--base-real');
    const nombreBD = process.env.DB_NAME_TAREAS || 'gestor_tareas';
    const esBDPruebas = nombreBD.endsWith('_dev');

    // Seguro: sin --base-real, nunca se cambia una base de datos que no sea de pruebas.
    if (!esBDPruebas && !soloEstado && !permitirBaseReal) {
        console.error(`🛑 La base de datos es "${nombreBD}" y NO es de pruebas (_dev). No se ha cambiado nada.`);
        process.exitCode = 1;
        return;
    }

    const migraciones = listarMigraciones();

    // Conexión propia, solo para este script. multipleStatements permite ejecutar
    // un archivo .sql con varias órdenes; NO se activa en la app, porque allí sería un riesgo.
    const conexion = await mysql.createConnection({ ...configBase, database: nombreBD, multipleStatements: true });

    let bloqueado = false;
    try {
        // Cerrojo: evita que dos personas (o dos servidores) apliquen migraciones a la vez.
        const [[{ ok }]] = await conexion.query('SELECT GET_LOCK(?, 10) AS ok', [NOMBRE_BLOQUEO]);
        if (ok !== 1) throw new Error('Otra ejecución de migraciones está en marcha. Espera y vuelve a intentarlo.');
        bloqueado = true;

        // ¿Existe ya la tabla "migraciones"? (en modo --estado no creamos nada: solo miramos)
        const [[{ existe }]] = await conexion.query(
            "SELECT COUNT(*) AS existe FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'migraciones'"
        );
        if (!existe && !soloEstado) {
            await conexion.query(`
                CREATE TABLE migraciones (
                    nombre VARCHAR(255) NOT NULL PRIMARY KEY,
                    huella CHAR(64) NOT NULL,
                    aplicada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            `);
        }

        const [filas] = existe
            ? await conexion.query('SELECT nombre, huella FROM migraciones')
            : [[]];
        const aplicadas = new Map(filas.map((fila) => [fila.nombre, fila.huella]));
        const pendientes = calcularPendientes(migraciones, aplicadas);

        console.log(`Base de datos: ${nombreBD}`);
        console.log(`Aplicadas: ${aplicadas.size} · Pendientes: ${pendientes.length}`);
        pendientes.forEach((m) => console.log(`  · pendiente: ${m.nombre}`));

        if (soloEstado || pendientes.length === 0) return;

        for (const migracion of pendientes) {
            console.log(`→ Aplicando ${migracion.nombre}...`);
            // Si una orden del archivo falla, paramos aquí y la migración NO se apunta como aplicada.
            await conexion.query(migracion.sql);
            await conexion.query('INSERT INTO migraciones (nombre, huella) VALUES (?, ?)', [migracion.nombre, migracion.huella]);
            console.log(`  ✔ ${migracion.nombre} aplicada`);
        }
        console.log('Migraciones terminadas.');
    } finally {
        if (bloqueado) await conexion.query('SELECT RELEASE_LOCK(?)', [NOMBRE_BLOQUEO]).catch(() => {});
        await conexion.end();
    }
}

// Solo se ejecuta si lanzamos este archivo directamente (no cuando lo usan las pruebas)
if (require.main === module) {
    main().catch((error) => {
        // Solo el tipo y el mensaje del error, nunca la configuración de conexión
        console.error('✖ Error en las migraciones:', error.code ?? '', error.message);
        process.exitCode = 1;
    });
}

module.exports = { listarMigraciones, calcularPendientes, calcularHuella };
