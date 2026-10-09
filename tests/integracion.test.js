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
        // Al borrar el usuario, se borran solos (ON DELETE CASCADE) sus categorías, historial,
        // cierres de semana, cuenta de Google y dispositivos de avisos
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

    await t.test('completar enviando la tarea entera, como hace el frontend actual', async () => {
        const lista = await request(app).get('/api/tareas').set('Authorization', `Bearer ${tokenAna}`);
        const tarea = lista.body.find((t) => t.id === idTarea);
        // El frontend manda TODOS los campos que recibió (id, user_id, uuid...) más el estado nuevo
        const res = await request(app)
            .put(`/api/tareas/${idTarea}`)
            .set('Authorization', `Bearer ${tokenAna}`)
            .send({ ...tarea, user_id: 999999, estado: 'completada' });
        assert.strictEqual(res.status, 200);

        const despues = await request(app).get('/api/tareas').set('Authorization', `Bearer ${tokenAna}`);
        const editada = despues.body.find((t) => t.id === idTarea);
        assert.strictEqual(editada.estado, 'completada');
        assert.strictEqual(editada.titulo, tarea.titulo);
        assert.strictEqual(editada.user_id, tarea.user_id); // el user_id falso se ignora
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

    await t.test('subtareas y categorías: reglas de la base de datos', async () => {
        const [[{ id: idAna }]] = await dbTareas.query('SELECT id FROM usuarios WHERE email = ?', [ana.email]);
        const [[{ id: idLuis }]] = await dbTareas.query('SELECT id FROM usuarios WHERE email = ?', [luis.email]);

        // Dos subtareas en la tarea de Ana
        await dbTareas.query(
            'INSERT INTO subtareas (tarea_id, titulo, orden) VALUES (?, ?, 0), (?, ?, 1)',
            [idTarea, 'Primer paso', idTarea, 'Segundo paso']
        );
        // Una subtarea con el título vacío no se puede guardar
        await assert.rejects(
            dbTareas.query('INSERT INTO subtareas (tarea_id, titulo) VALUES (?, ?)', [idTarea, '   ']),
            (error) => error.code === 'ER_CHECK_CONSTRAINT_VIOLATED'
        );

        // Categoría de Ana. La misma con otras mayúsculas o tildes cuenta como repetida.
        const [catAna] = await dbTareas.query(
            'INSERT INTO categorias (user_id, nombre, color) VALUES (?, ?, ?)', [idAna, 'iLerna', '#17699e']
        );
        await assert.rejects(
            dbTareas.query('INSERT INTO categorias (user_id, nombre) VALUES (?, ?)', [idAna, 'ÍLERNA']),
            (error) => error.code === 'ER_DUP_ENTRY'
        );
        // Un color que no es #RRGGBB no se puede guardar
        await assert.rejects(
            dbTareas.query('INSERT INTO categorias (user_id, nombre, color) VALUES (?, ?, ?)', [idAna, 'Casa', 'rojo']),
            (error) => error.code === 'ER_CHECK_CONSTRAINT_VIOLATED'
        );

        // Unir la tarea de Ana con su categoría: permitido
        await dbTareas.query(
            'INSERT INTO tarea_categorias (tarea_id, categoria_id, user_id) VALUES (?, ?, ?)',
            [idTarea, catAna.insertId, idAna]
        );

        // Luis NO puede unir la tarea de Ana a una categoría suya (ni haciéndose pasar por Ana)
        const [catLuis] = await dbTareas.query(
            'INSERT INTO categorias (user_id, nombre) VALUES (?, ?)', [idLuis, 'Secreta']
        );
        for (const usuario of [idLuis, idAna]) {
            await assert.rejects(
                dbTareas.query(
                    'INSERT INTO tarea_categorias (tarea_id, categoria_id, user_id) VALUES (?, ?, ?)',
                    [idTarea, catLuis.insertId, usuario]
                ),
                (error) => error.code === 'ER_NO_REFERENCED_ROW_2'
            );
        }
    });

    await t.test('ajustes, historial, cierres, Google y avisos: reglas de la base de datos', async () => {
        const [[usuario]] = await dbTareas.query(
            'SELECT id, tema, idioma, zona_horaria, avisos_activos, copia_drive_activa FROM usuarios WHERE email = ?',
            [ana.email]
        );
        // Ajustes por defecto de un usuario nuevo (como en el prototipo)
        assert.strictEqual(usuario.tema, 'nube');
        assert.strictEqual(usuario.idioma, 'es');
        assert.strictEqual(usuario.zona_horaria, 'Europe/Madrid');
        assert.strictEqual(usuario.avisos_activos, 1);
        assert.strictEqual(usuario.copia_drive_activa, 0);
        // Un tema que no existe no se puede guardar
        await assert.rejects(dbTareas.query("UPDATE usuarios SET tema = 'neon' WHERE id = ?", [usuario.id]));

        // Historial: un evento "completada" de la tarea
        await dbTareas.query(
            "INSERT INTO tarea_eventos (user_id, tarea_id, tipo) VALUES (?, ?, 'completada')",
            [usuario.id, idTarea]
        );

        // Cierre de semana: semana_inicio tiene que ser lunes, y solo uno por semana
        await assert.rejects(
            dbTareas.query("INSERT INTO cierres_semana (user_id, semana_inicio) VALUES (?, '2026-10-07')", [usuario.id]),
            (error) => error.code === 'ER_CHECK_CONSTRAINT_VIOLATED'
        );
        await dbTareas.query("INSERT INTO cierres_semana (user_id, semana_inicio) VALUES (?, '2026-10-05')", [usuario.id]);
        await assert.rejects(
            dbTareas.query("INSERT INTO cierres_semana (user_id, semana_inicio) VALUES (?, '2026-10-05')", [usuario.id]),
            (error) => error.code === 'ER_DUP_ENTRY'
        );

        // Avisos: solo direcciones https, y la misma no se repite
        await assert.rejects(
            dbTareas.query(
                'INSERT INTO suscripciones_push (user_id, endpoint, clave_p256dh, clave_auth) VALUES (?, ?, ?, ?)',
                [usuario.id, 'http://inseguro.test/x', 'p', 'a']
            ),
            (error) => error.code === 'ER_CHECK_CONSTRAINT_VIOLATED'
        );
        const endpoint = `https://push.test/${marca}`;
        await dbTareas.query(
            'INSERT INTO suscripciones_push (user_id, endpoint, clave_p256dh, clave_auth) VALUES (?, ?, ?, ?)',
            [usuario.id, endpoint, 'p', 'a']
        );
        await assert.rejects(
            dbTareas.query(
                'INSERT INTO suscripciones_push (user_id, endpoint, clave_p256dh, clave_auth) VALUES (?, ?, ?, ?)',
                [usuario.id, endpoint, 'p', 'a']
            ),
            (error) => error.code === 'ER_DUP_ENTRY'
        );

        // Google: una sola cuenta de Google por usuario
        await dbTareas.query(
            'INSERT INTO cuentas_google (user_id, google_sub, email_google) VALUES (?, ?, ?)',
            [usuario.id, `sub-${marca}`, 'ana@gmail.test']
        );
        await assert.rejects(
            dbTareas.query(
                'INSERT INTO cuentas_google (user_id, google_sub, email_google) VALUES (?, ?, ?)',
                [usuario.id, `otro-sub-${marca}`, 'ana2@gmail.test']
            ),
            (error) => error.code === 'ER_DUP_ENTRY'
        );
    });

    await t.test('borrar mi tarea y que ya no exista (y sus subtareas y uniones tampoco)', async () => {
        const borrar = await request(app).delete(`/api/tareas/${idTarea}`).set('Authorization', `Bearer ${tokenAna}`);
        assert.strictEqual(borrar.status, 200);
        const otraVez = await request(app).delete(`/api/tareas/${idTarea}`).set('Authorization', `Bearer ${tokenAna}`);
        assert.strictEqual(otraVez.status, 404);

        // ON DELETE CASCADE: al borrar la tarea, se borran sus subtareas y sus uniones con categorías
        const [[{ subtareas }]] = await dbTareas.query('SELECT COUNT(*) AS subtareas FROM subtareas WHERE tarea_id = ?', [idTarea]);
        const [[{ uniones }]] = await dbTareas.query('SELECT COUNT(*) AS uniones FROM tarea_categorias WHERE tarea_id = ?', [idTarea]);
        assert.strictEqual(subtareas, 0);
        assert.strictEqual(uniones, 0);

        // El historial se conserva para las estadísticas, pero ya sin apuntar a la tarea borrada
        const [eventos] = await dbTareas.query(
            "SELECT tarea_id FROM tarea_eventos e JOIN usuarios u ON u.id = e.user_id WHERE u.email = ? AND e.tipo = 'completada'",
            [ana.email]
        );
        assert.strictEqual(eventos.length, 1);
        assert.strictEqual(eventos[0].tarea_id, null);
    });
});
