// tests/api-tachit.test.js
// Pruebas de las rutas nuevas de Tachit: campos nuevos de las tareas, historial, subtareas,
// categorías y ajustes. Siempre con dos usuarios para comprobar que NADIE toca lo de otro.
// SEGURIDAD: solo se ejecutan en la base de datos de pruebas (_dev) y borran sus datos al final.
const { test, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const request = require('supertest');
const app = require('../app');
const { dbTareas, poolTareas } = require('../db');

const nombreBD = process.env.DB_NAME_TAREAS || '';
const esBDPruebas = nombreBD.endsWith('_dev');
const opciones = esBDPruebas ? {} : { skip: 'No es la base de datos de pruebas (_dev): no se ejecuta' };

const marca = `${Date.now()}-${crypto.randomInt(1e6)}`;
const eva = { nombre: 'Eva Prueba', email: `eva-${marca}@tachit.test`, contrasena: `Clave-${marca}-E` };
const leo = { nombre: 'Leo Prueba', email: `leo-${marca}@tachit.test`, contrasena: `Clave-${marca}-L` };

after(async () => {
    if (esBDPruebas) {
        const emails = [eva.email, leo.email];
        await dbTareas.query('DELETE t FROM tareas t JOIN usuarios u ON u.id = t.user_id WHERE u.email IN (?)', [emails]);
        await dbTareas.query('DELETE FROM usuarios WHERE email IN (?)', [emails]);
    }
    await poolTareas.end();
});

// Ayudantes para no repetir código
const con = (token) => ({
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url, cuerpo) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(cuerpo),
    put: (url, cuerpo) => request(app).put(url).set('Authorization', `Bearer ${token}`).send(cuerpo),
    patch: (url, cuerpo) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(cuerpo),
    delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
});
async function registrarYEntrar(usuario) {
    assert.strictEqual((await request(app).post('/api/auth/register').send(usuario)).status, 201);
    const res = await request(app).post('/api/auth/login').send({ email: usuario.email, contrasena: usuario.contrasena });
    return con(res.body.token);
}
async function eventos(email, tipo) {
    const [filas] = await dbTareas.query(
        'SELECT e.* FROM tarea_eventos e JOIN usuarios u ON u.id = e.user_id WHERE u.email = ? AND e.tipo = ? ORDER BY e.id',
        [email, tipo]
    );
    return filas;
}
async function buscarTarea(cliente, id) {
    const res = await cliente.get('/api/tareas');
    return res.body.find((t) => t.id === id);
}

test('rutas nuevas de Tachit de principio a fin', opciones, async (t) => {
    const yo = await registrarYEntrar(eva);
    const otro = await registrarYEntrar(leo);
    const uuid = crypto.randomUUID();
    let idTarea;

    await t.test('crear tarea con los campos nuevos (y queda en el historial)', async () => {
        const res = await yo.post('/api/tareas', {
            titulo: 'Regar las plantas', uuid, fecha_limite: '2026-10-12', hora_limite: '09:00',
            duracion_min: 15, aviso_min: 10, repeticion: 'semanal', dias_semana: [3, 1], icono: 'hogar',
        });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.uuid, uuid);
        idTarea = res.body.id;

        const tarea = await buscarTarea(yo, idTarea);
        assert.strictEqual(tarea.duracion_min, 15);
        assert.strictEqual(tarea.aviso_min, 10);
        assert.strictEqual(tarea.repeticion, 'semanal');
        assert.deepStrictEqual(tarea.dias_semana, [1, 3]);
        assert.strictEqual(tarea.icono, 'hogar');
        assert.deepStrictEqual(tarea.subtareas, []);
        assert.deepStrictEqual(tarea.categorias, []);
        assert.strictEqual((await eventos(eva.email, 'creada')).length, 1);
    });

    await t.test('reenviar la misma tarea (mismo uuid) no la duplica; otro usuario no puede usar ese uuid', async () => {
        const repetida = await yo.post('/api/tareas', { titulo: 'Regar las plantas', uuid });
        assert.strictEqual(repetida.status, 200);
        assert.strictEqual(repetida.body.id, idTarea);
        assert.strictEqual((await otro.post('/api/tareas', { titulo: 'Copia', uuid })).status, 409);
    });

    await t.test('valores imposibles de los campos nuevos dan 400', async () => {
        for (const malo of [
            { aviso_min: 15 }, { icono: 'pizza' }, { duracion_min: 3 }, { repeticion: 'cada_hora' },
            { repeticion: 'semanal', dias_semana: [] }, { repeticion: 'diaria', dias_semana: [1] },
            { dias_semana: [7] }, { uuid: 'no-es-un-uuid' },
        ]) {
            const res = await yo.post('/api/tareas', { titulo: 'X', ...malo });
            assert.strictEqual(res.status, 400, `debería rechazar ${JSON.stringify(malo)}`);
        }
    });

    await t.test('editar con el formulario antiguo NO borra los campos nuevos', async () => {
        const res = await yo.put(`/api/tareas/${idTarea}`, {
            titulo: 'Regar las plantas del balcón', estado: 'pendiente', prioridad: 'media',
            proyecto: '', fecha_limite: '2026-10-12', hora_limite: null, descripcion: null,
        });
        assert.strictEqual(res.status, 200);
        const tarea = await buscarTarea(yo, idTarea);
        assert.strictEqual(tarea.titulo, 'Regar las plantas del balcón');
        assert.strictEqual(tarea.duracion_min, 15);
        assert.strictEqual(tarea.icono, 'hogar');
        assert.deepStrictEqual(tarea.dias_semana, [1, 3]);
    });

    await t.test('completar y desmarcar quedan en el historial', async () => {
        const tarea = await buscarTarea(yo, idTarea);
        assert.strictEqual((await yo.put(`/api/tareas/${idTarea}`, { ...tarea, estado: 'completada' })).status, 200);
        assert.strictEqual((await yo.put(`/api/tareas/${idTarea}`, { ...tarea, estado: 'pendiente' })).status, 200);
        assert.strictEqual((await eventos(eva.email, 'completada')).length, 1);
        assert.strictEqual((await eventos(eva.email, 'reabierta')).length, 1);
    });

    await t.test('mover a un día posterior cuenta como aplazada y queda en el historial', async () => {
        const tarea = await buscarTarea(yo, idTarea);
        await yo.put(`/api/tareas/${idTarea}`, { ...tarea, fecha_limite: '2026-10-19' });
        const movida = await buscarTarea(yo, idTarea);
        assert.strictEqual(movida.veces_aplazada, 1);
        const [evento] = await eventos(eva.email, 'movida');
        assert.strictEqual(evento.fecha_anterior, '2026-10-12');
        assert.strictEqual(evento.fecha_nueva, '2026-10-19');
    });

    await t.test('cambiar la repetición a diaria vacía los días', async () => {
        const tarea = await buscarTarea(yo, idTarea);
        const { dias_semana, ...sinDias } = tarea; // eslint-disable-line no-unused-vars
        await yo.put(`/api/tareas/${idTarea}`, { ...sinDias, repeticion: 'diaria' });
        assert.strictEqual((await buscarTarea(yo, idTarea)).dias_semana, null);
    });

    await t.test('subtareas: crear, marcar, ver dentro de la tarea y borrar', async () => {
        const a = await yo.post('/api/subtareas', { tarea_id: idTarea, titulo: 'Llenar la regadera' });
        const b = await yo.post('/api/subtareas', { tarea_id: idTarea, titulo: 'Regar' });
        assert.strictEqual(a.status, 201);
        assert.strictEqual(a.body.subtarea.orden, 0);
        assert.strictEqual(b.body.subtarea.orden, 1);

        assert.strictEqual((await yo.patch(`/api/subtareas/${a.body.subtarea.id}`, { hecha: true })).status, 200);
        const tarea = await buscarTarea(yo, idTarea);
        assert.deepStrictEqual(tarea.subtareas.map((s) => [s.titulo, s.hecha]), [['Llenar la regadera', true], ['Regar', false]]);

        assert.strictEqual((await yo.post('/api/subtareas', { tarea_id: idTarea, titulo: '  ' })).status, 400);
        assert.strictEqual((await yo.patch(`/api/subtareas/${a.body.subtarea.id}`, {})).status, 400);
        assert.strictEqual((await yo.delete(`/api/subtareas/${b.body.subtarea.id}`)).status, 200);
    });

    await t.test('subtareas: otro usuario NO puede crear, cambiar ni borrar en mi tarea', async () => {
        const tarea = await buscarTarea(yo, idTarea);
        const idSub = tarea.subtareas[0].id;
        assert.strictEqual((await otro.post('/api/subtareas', { tarea_id: idTarea, titulo: 'Intruso' })).status, 404);
        assert.strictEqual((await otro.patch(`/api/subtareas/${idSub}`, { titulo: 'Hackeada' })).status, 404);
        assert.strictEqual((await otro.delete(`/api/subtareas/${idSub}`)).status, 404);
        assert.strictEqual((await buscarTarea(yo, idTarea)).subtareas[0].titulo, 'Llenar la regadera');
    });

    await t.test('categorías: crear con color de la paleta y reutilizar la misma aunque cambien mayúsculas o tildes', async () => {
        const nueva = await yo.post('/api/categorias', { nombre: 'Casa' });
        assert.strictEqual(nueva.status, 201);
        assert.match(nueva.body.categoria.color, /^#[0-9a-f]{6}$/);
        const otraVez = await yo.post('/api/categorias', { nombre: 'CASA' });
        assert.strictEqual(otraVez.status, 200);
        assert.strictEqual(otraVez.body.existente, true);
        assert.strictEqual(otraVez.body.categoria.id, nueva.body.categoria.id);
        assert.strictEqual((await yo.post('/api/categorias', { nombre: 'Rojo', color: 'rojo' })).status, 400);
    });

    await t.test('categorías: unirlas a mi tarea, y que nadie más pueda usarlas ni tocarlas', async () => {
        const casa = (await yo.post('/api/categorias', { nombre: 'Casa' })).body.categoria;
        const ajena = (await otro.post('/api/categorias', { nombre: 'Secreta' })).body.categoria;

        assert.strictEqual((await yo.put(`/api/tareas/${idTarea}/categorias`, { ids: [casa.id] })).status, 200);
        assert.deepStrictEqual((await buscarTarea(yo, idTarea)).categorias.map((c) => c.nombre), ['Casa']);

        // Usar una categoría de otro usuario, o tocar la tarea de otro: no
        assert.strictEqual((await yo.put(`/api/tareas/${idTarea}/categorias`, { ids: [ajena.id] })).status, 404);
        assert.strictEqual((await otro.put(`/api/tareas/${idTarea}/categorias`, { ids: [ajena.id] })).status, 404);
        assert.strictEqual((await otro.patch(`/api/categorias/${casa.id}`, { nombre: 'Mía' })).status, 404);
        assert.strictEqual((await otro.delete(`/api/categorias/${casa.id}`)).status, 404);
        assert.ok(!(await otro.get('/api/categorias')).body.some((c) => c.id === casa.id));

        // Renombrar a un nombre que ya tengo: 409
        await yo.post('/api/categorias', { nombre: 'Estudio' });
        assert.strictEqual((await yo.patch(`/api/categorias/${casa.id}`, { nombre: 'estudio' })).status, 409);

        // Borrar la categoría: la tarea sigue, pero sin esa categoría
        assert.strictEqual((await yo.delete(`/api/categorias/${casa.id}`)).status, 200);
        assert.deepStrictEqual((await buscarTarea(yo, idTarea)).categorias, []);
    });

    await t.test('ajustes: leer los de por defecto y cambiarlos', async () => {
        const leidos = await yo.get('/api/ajustes');
        assert.strictEqual(leidos.status, 200);
        assert.strictEqual(leidos.body.tema, 'nube');
        assert.strictEqual(leidos.body.avisos_activos, true);
        assert.strictEqual(leidos.body.contrasena, undefined); // nunca sale la contraseña

        assert.strictEqual((await yo.patch('/api/ajustes', { tema: 'malva', idioma: 'en', zona_horaria: 'Europe/Paris' })).status, 200);
        const cambiados = (await yo.get('/api/ajustes')).body;
        assert.strictEqual(cambiados.tema, 'malva');
        assert.strictEqual(cambiados.idioma, 'en');
        assert.strictEqual(cambiados.zona_horaria, 'Europe/Paris');
        // Los ajustes de otro usuario no cambian
        assert.strictEqual((await otro.get('/api/ajustes')).body.tema, 'nube');
    });

    await t.test('ajustes: valores imposibles, nada que cambiar y Drive sin Google', async () => {
        assert.strictEqual((await yo.patch('/api/ajustes', { tema: 'neon' })).status, 400);
        assert.strictEqual((await yo.patch('/api/ajustes', { zona_horaria: 'Marte/Olympus' })).status, 400);
        const vacio = await yo.patch('/api/ajustes', {});
        assert.strictEqual(vacio.status, 400);
        assert.strictEqual(vacio.body.mensaje, 'No hay nada que cambiar');
        assert.strictEqual((await yo.patch('/api/ajustes', { copia_drive_activa: true })).status, 409);
    });

    await t.test('borrar la tarea deja constancia en el historial', async () => {
        assert.strictEqual((await otro.delete(`/api/tareas/${idTarea}`)).status, 404);
        assert.strictEqual((await yo.delete(`/api/tareas/${idTarea}`)).status, 200);
        const [borrada] = await eventos(eva.email, 'borrada');
        assert.ok(borrada);
        assert.strictEqual(borrada.tarea_id, null); // la tarea ya no existe, el historial sí
    });
});

test('rutas nuevas sin token devuelven 401', async () => {
    for (const [metodo, url] of [
        ['get', '/api/categorias'], ['post', '/api/subtareas'], ['get', '/api/ajustes'], ['put', '/api/tareas/1/categorias'],
    ]) {
        assert.strictEqual((await request(app)[metodo](url)).status, 401, `${metodo} ${url}`);
    }
});
