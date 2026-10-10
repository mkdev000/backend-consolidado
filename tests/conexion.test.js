// tests/conexion.test.js
// Comprueba que la conexión con la base de datos está configurada de forma segura
// (sin conectarse: solo mira la configuración).
const { test } = require('node:test');
const assert = require('node:assert');
const { configBase, poolRutlink, poolTareas } = require('../db');

test('la conexión exige comprobar el certificado del servidor (no acepta impostores)', async () => {
    assert.strictEqual(configBase.ssl.rejectUnauthorized, true);
    await Promise.all([poolRutlink.promise().end(), poolTareas.end()]);
});

test('el certificado de Aiven está cargado y tiene formato de certificado', () => {
    const texto = configBase.ssl.ca.toString();
    assert.match(texto, /-----BEGIN CERTIFICATE-----/);
    assert.match(texto, /-----END CERTIFICATE-----/);
    // Un certificado NUNCA debe llevar una clave privada dentro
    assert.doesNotMatch(texto, /PRIVATE KEY/);
});
