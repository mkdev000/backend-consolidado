// tests/validacion.test.js
// Pruebas de las normas de Zod (sin base de datos): qué se acepta, qué se rechaza y cómo se limpian los datos.
const { test } = require('node:test');
const assert = require('node:assert');
const { esquemaRegistro, esquemaLogin, esquemaTarea } = require('../tareas/validacion/esquemas');

// Devuelve el primer mensaje de error, o null si los datos son válidos
const primerError = (esquema, datos) => {
    const r = esquema.safeParse(datos);
    return r.success ? null : r.error.issues[0].message;
};

const registroBueno = { nombre: 'Kevin', email: 'kevin@tachit.test', contrasena: 'Segura-123' };

test('registro: datos correctos se aceptan y el email se guarda en minúsculas y sin espacios', () => {
    const r = esquemaRegistro.safeParse({ ...registroBueno, nombre: '  Kevin  ', email: '  Kevin@Tachit.TEST ' });
    assert.ok(r.success);
    assert.strictEqual(r.data.nombre, 'Kevin');
    assert.strictEqual(r.data.email, 'kevin@tachit.test');
});

test('registro: la contraseña cumple los 4 requisitos del prototipo', () => {
    assert.match(primerError(esquemaRegistro, { ...registroBueno, contrasena: 'Ab1!' }), /8 caracteres/);
    assert.match(primerError(esquemaRegistro, { ...registroBueno, contrasena: 'segura-123' }), /mayúscula/);
    assert.match(primerError(esquemaRegistro, { ...registroBueno, contrasena: 'Segura-abc' }), /número/);
    assert.match(primerError(esquemaRegistro, { ...registroBueno, contrasena: 'Segura123' }), /símbolo/);
    assert.strictEqual(primerError(esquemaRegistro, { ...registroBueno, contrasena: 'Ñandú#2026' }), null);
});

test('registro: contraseña de más de 72 bytes se rechaza (bcrypt la cortaría)', () => {
    const larga = 'Aa1!' + 'x'.repeat(69); // 73 caracteres
    assert.match(primerError(esquemaRegistro, { ...registroBueno, contrasena: larga }), /demasiado larga/);
});

test('registro: email inválido o campos que no son texto se rechazan', () => {
    assert.match(primerError(esquemaRegistro, { ...registroBueno, email: 'no-es-un-email' }), /email no es válido/);
    assert.ok(primerError(esquemaRegistro, { ...registroBueno, nombre: { $gt: '' } }));
    assert.ok(primerError(esquemaRegistro, {}));
});

test('login: NO exige los requisitos de contraseña (las cuentas antiguas pueden entrar)', () => {
    assert.ok(esquemaLogin.safeParse({ email: 'a@b.test', contrasena: '123' }).success);
    assert.ok(!esquemaLogin.safeParse({ email: 'a@b.test' }).success);
    assert.ok(!esquemaLogin.safeParse({ email: 'a@b.test', contrasena: 'x'.repeat(201) }).success);
});

test('tarea: valores por defecto y limpieza', () => {
    const r = esquemaTarea.safeParse({ titulo: '  Estudiar  ', proyecto: '', fecha_limite: '', hora_limite: null });
    assert.ok(r.success);
    assert.deepStrictEqual(r.data, {
        titulo: 'Estudiar',
        descripcion: null,
        estado: 'pendiente',
        prioridad: 'media',
        proyecto: null,
        fecha_limite: null,
        hora_limite: null,
    });
});

test('tarea: los campos que no están en las normas se ignoran (id, uuid, user_id...)', () => {
    // Es lo que envía el frontend actual al completar una tarea: la tarea entera
    const r = esquemaTarea.safeParse({
        id: 5, user_id: 999, uuid: 'x', titulo: 'T', estado: 'completada', prioridad: null,
        fecha_limite: '2026-10-09', hora_limite: '18:00:00', duracion_min: 30,
    });
    assert.ok(r.success);
    assert.strictEqual(r.data.user_id, undefined);
    assert.strictEqual(r.data.id, undefined);
    assert.strictEqual(r.data.prioridad, 'media');
    assert.strictEqual(r.data.hora_limite, '18:00:00');
});

test('tarea: fechas, horas, estados y prioridades imposibles se rechazan', () => {
    assert.match(primerError(esquemaTarea, { titulo: 'T', fecha_limite: '2026-02-30' }), /fecha no es válida/);
    assert.match(primerError(esquemaTarea, { titulo: 'T', hora_limite: '25:00' }), /hora no es válida/);
    assert.match(primerError(esquemaTarea, { titulo: 'T', estado: 'borrada' }), /estado no es válido/);
    assert.match(primerError(esquemaTarea, { titulo: 'T', prioridad: 'altísima' }), /prioridad no es válida/);
    assert.match(primerError(esquemaTarea, { titulo: 'x'.repeat(151) }), /150 caracteres/);
    assert.match(primerError(esquemaTarea, { titulo: '   ' }), /obligatorio/);
});
