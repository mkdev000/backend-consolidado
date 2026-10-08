// tests/migraciones.test.js
// Pruebas del sistema de migraciones (sin base de datos): nombres, orden y huellas.
const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { listarMigraciones, calcularPendientes, calcularHuella } = require('../scripts/migrar');

// Carpetas temporales creadas en las pruebas (se borran al final)
const carpetasTemporales = [];
after(() => carpetasTemporales.forEach((c) => fs.rmSync(c, { recursive: true, force: true })));

// Crea una carpeta temporal con los archivos indicados
function carpetaCon(archivos) {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'migraciones-'));
    carpetasTemporales.push(carpeta);
    for (const [nombre, contenido] of Object.entries(archivos)) {
        fs.writeFileSync(path.join(carpeta, nombre), contenido);
    }
    return carpeta;
}

test('las migraciones salen ordenadas por número', () => {
    const carpeta = carpetaCon({ '002_b.sql': 'SELECT 2;', '001_a.sql': 'SELECT 1;', 'leeme.txt': 'no' });
    const nombres = listarMigraciones(carpeta).map((m) => m.nombre);
    assert.deepStrictEqual(nombres, ['001_a.sql', '002_b.sql']);
});

test('un nombre con formato incorrecto da error', () => {
    const carpeta = carpetaCon({ '1_mal.sql': 'SELECT 1;' });
    assert.throws(() => listarMigraciones(carpeta), /no válidos/);
});

test('dos migraciones con el mismo número dan error', () => {
    const carpeta = carpetaCon({ '001_a.sql': 'SELECT 1;', '001_b.sql': 'SELECT 2;' });
    assert.throws(() => listarMigraciones(carpeta), /mismo número/);
});

test('la huella es igual con saltos de línea de Windows y de Linux', () => {
    assert.strictEqual(calcularHuella('SELECT 1;\r\nSELECT 2;'), calcularHuella('SELECT 1;\nSELECT 2;'));
});

test('solo quedan pendientes las que no están aplicadas', () => {
    const migraciones = [
        { nombre: '001_a.sql', huella: calcularHuella('A') },
        { nombre: '002_b.sql', huella: calcularHuella('B') },
    ];
    const aplicadas = new Map([['001_a.sql', calcularHuella('A')]]);
    assert.deepStrictEqual(calcularPendientes(migraciones, aplicadas).map((m) => m.nombre), ['002_b.sql']);
});

test('cambiar una migración ya aplicada da error', () => {
    const migraciones = [{ nombre: '001_a.sql', huella: calcularHuella('A cambiada') }];
    const aplicadas = new Map([['001_a.sql', calcularHuella('A')]]);
    assert.throws(() => calcularPendientes(migraciones, aplicadas), /ha cambiado/);
});

test('borrar el archivo de una migración aplicada da error', () => {
    const aplicadas = new Map([['001_a.sql', calcularHuella('A')]]);
    assert.throws(() => calcularPendientes([], aplicadas), /ya no existe/);
});

test('una migración nueva con número anterior a una aplicada da error', () => {
    const migraciones = [
        { nombre: '001_a.sql', huella: calcularHuella('A') },
        { nombre: '002_b.sql', huella: calcularHuella('B') },
        { nombre: '003_c.sql', huella: calcularHuella('C') },
    ];
    const aplicadas = new Map([
        ['001_a.sql', calcularHuella('A')],
        ['003_c.sql', calcularHuella('C')],
    ]);
    assert.throws(() => calcularPendientes(migraciones, aplicadas), /número anterior/);
});
