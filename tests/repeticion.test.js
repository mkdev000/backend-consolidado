// tests/repeticion.test.js
// Pruebas de "la siguiente vez" de una tarea que se repite (paso 6.5). Sin base de datos.
const { test } = require('node:test');
const assert = require('node:assert');
const { siguienteFecha } = require('../tareas/repeticion');

test('cada día: el día siguiente (también al cambiar de mes y de año)', () => {
    assert.strictEqual(siguienteFecha('2026-11-03', 'diaria'), '2026-11-04');
    assert.strictEqual(siguienteFecha('2026-10-31', 'diaria'), '2026-11-01');
    assert.strictEqual(siguienteFecha('2026-12-31', 'diaria'), '2027-01-01');
    // El cambio de hora de marzo no afecta (se calcula en UTC)
    assert.strictEqual(siguienteFecha('2026-03-28', 'diaria'), '2026-03-29');
});

test('cada semana: el próximo de los días elegidos, o 7 días después si no hay días', () => {
    // 3 nov 2026 es martes; días elegidos: lunes (1) y jueves (4)
    assert.strictEqual(siguienteFecha('2026-11-03', 'semanal', [1, 4]), '2026-11-05');
    // desde el jueves, el siguiente es el lunes
    assert.strictEqual(siguienteFecha('2026-11-05', 'semanal', [1, 4]), '2026-11-09');
    // solo el mismo día de la semana: una semana después
    assert.strictEqual(siguienteFecha('2026-11-03', 'semanal', [2]), '2026-11-10');
    assert.strictEqual(siguienteFecha('2026-11-03', 'semanal', null), '2026-11-10');
    assert.strictEqual(siguienteFecha('2026-11-03', 'semanal', []), '2026-11-10');
});

test('cada mes: el mismo día del mes siguiente, o el último si ese mes es más corto', () => {
    assert.strictEqual(siguienteFecha('2026-11-15', 'mensual'), '2026-12-15');
    assert.strictEqual(siguienteFecha('2026-12-15', 'mensual'), '2027-01-15');
    assert.strictEqual(siguienteFecha('2026-01-31', 'mensual'), '2026-02-28');
    assert.strictEqual(siguienteFecha('2028-01-31', 'mensual'), '2028-02-29'); // año bisiesto
    assert.strictEqual(siguienteFecha('2026-03-31', 'mensual'), '2026-04-30');
});

test('sin repetición no hay siguiente, y una fecha rota da error', () => {
    assert.strictEqual(siguienteFecha('2026-11-03', null), null);
    assert.throws(() => siguienteFecha('3/11/2026', 'diaria'), /Fecha no válida/);
});
