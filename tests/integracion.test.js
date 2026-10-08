// tests/integracion.test.js
// Pruebas completas contra la base de datos: registro, login y tareas.
// SEGURIDAD: solo se ejecutan si la base de datos es la de PRUEBAS (nombre acabado en _dev).
// Crean usuarios de prueba y al final los borran, junto con sus tareas.
const { test, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../app');
const { dbTareas, poolTareas } = require('../db');

const nombreBD = process.env.DB_NAME_TAREAS || '';
const esBDPruebas = nombreBD.endsWith('_dev');
const opciones = esBDPruebas ? {} : { skip: 'No es la base de datos de pruebas (_dev): no se ejecuta' };

const marca = Date.now();
const ana = { nombre: 'Ana Prueba', email: `ana-${marca}@tachit.test`, contrasena: `Clave-${marca}-A` };
const luis = { nombre: 'Luis Prueba', email: `luis-${marca}@tachit.test`, contrasena: `Clave-${marca}-L` };

async function loginYToken(usuario) {
    const res = await request(app).post('/api/auth/login').send({ email: usuario.email, contrasena: usuario.contrasena });
    assert.strictEqual(res.status, 200);
    return res.body.token;
}

after(async () => {
    if (esBDPruebas) {
        const emails = [ana.email, luis.email];
        await dbTareas.query(
            'DELETE t FROM tareas t JOIN usuarios u ON u.id = t.user_id WHERE u.email IN (?)',
            [emails]
        );
        await dbTareas.query('DELETE FROM usuarios WHERE email IN (?)', [emails]);
    }
    await poolTareas.end(); // cierra las conexiones para que la prueba termine
});

test('registro, login y tareas de principio a fin', opciones, async (t) => {
    await t.test('registrar dos usuarios', async () => {
        assert.strictEqual((await request(app).post('/api/auth/register').send(ana)).status, 201);
        assert.strictEqual((await request(app).post('/api/auth/register').send(luis)).status, 201);
    });

    await t.test('el mismo email no se puede registrar dos veces (409)', async () => {
        const res = await request(app).post('/api/auth/register').send(ana);
        assert.strictEqual(res.status, 409);
    });

    await t.test('contraseña incorrecta y email inexistente dan el mismo 401', async () => {
        const mala = await request(app).post('/api/auth/login').send({ email: ana.email, contrasena: 'mal' });
        const noExiste = await request(app).post('/api/auth/login').send({ email: `nadie-${marca}@tachit.test`, contrasena: 'mal' });
        assert.strictEqual(mala.status, 401);
        assert.strictEqual(noExiste.status, 401);
        assert.strictEqual(mala.body.mensaje, noExiste.body.mensaje);
    });

    const tokenAna = await loginYToken(ana);
    const tokenLuis = await loginYToken(luis);
    let idTarea;

    await t.test('crear, listar y editar una tarea', async () => {
        const creada = await request(app)
            .post('/api/tareas')
            .set('Authorization', `Bearer ${tokenAna}`)
            .send({ titulo: 'Tarea de prueba', prioridad: 'alta', estado: 'pendiente' });
        assert.strictEqual(creada.status, 201);
        idTarea = creada.body.id;

        const lista = await request(app).get('/api/tareas').set('Authorization', `Bearer ${tokenAna}`);
        assert.strictEqual(lista.status, 200);
        const tarea = lista.body.find((t) => t.id === idTarea);
        assert.ok(tarea);

        // Columnas nuevas de las migraciones 002 y 003, con sus valores por defecto
        assert.strictEqual(tarea.duracion_min, 30);
        assert.strictEqual(tarea.aviso_min, null);
        assert.strictEqual(tarea.repeticion, null);
        assert.strictEqual(tarea.veces_aplazada, 0);
        assert.match(tarea.uuid, /^[0-9a-f-]{36}$/);
        assert.ok(tarea.actualizada_en);

        const editada = await request(app)
            .put(`/api/tareas/${idTarea}`)
            .set('Authorization', `Bearer ${tokenAna}`)
            .send({ titulo: 'Tarea editada', prioridad: 'baja', estado: 'completada' });
        assert.strictEqual(editada.status, 200);
    });

    await t.test('otro usuario NO puede ver, editar ni borrar mi tarea', async () => {
        const lista = await request(app).get('/api/tareas').set('Authorization', `Bearer ${tokenLuis}`);
        assert.ok(!lista.body.some((tarea) => tarea.id === idTarea));

        const editar = await request(app)
            .put(`/api/tareas/${idTarea}`)
            .set('Authorization', `Bearer ${tokenLuis}`)
            .send({ titulo: 'Hackeada' });
        assert.strictEqual(editar.status, 404);

        const borrar = await request(app).delete(`/api/tareas/${idTarea}`).set('Authorization', `Bearer ${tokenLuis}`);
        assert.strictEqual(borrar.status, 404);
    });

    await t.test('la base de datos rechaza valores imposibles (reglas CHECK)', async () => {
        // Duración de 0 minutos: la regla tareas_chk_duracion lo impide
        await assert.rejects(
            dbTareas.query('UPDATE tareas SET duracion_min = 0 WHERE id = ?', [idTarea]),
            (error) => error.code === 'ER_CHECK_CONSTRAINT_VIOLATED'
        );
        // Una repetición que no existe: el ENUM lo impide
        await assert.rejects(
            dbTareas.query("UPDATE tareas SET repeticion = 'cada_hora' WHERE id = ?", [idTarea])
        );
    });

    await t.test('borrar mi tarea y que ya no exista', async () => {
        const borrar = await request(app).delete(`/api/tareas/${idTarea}`).set('Authorization', `Bearer ${tokenAna}`);
        assert.strictEqual(borrar.status, 200);
        const otraVez = await request(app).delete(`/api/tareas/${idTarea}`).set('Authorization', `Bearer ${tokenAna}`);
        assert.strictEqual(otraVez.status, 404);
    });
});
