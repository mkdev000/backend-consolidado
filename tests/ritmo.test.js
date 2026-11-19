// tests/ritmo.test.js
// Pruebas de Mi ritmo (Fase 9, paso 9.2): el tiempo real de una tarea, el historial y el cierre de semana.
// Siempre con dos usuarios para comprobar que NADIE ve ni toca lo de otro.
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
const eva = { nombre: 'Eva Ritmo', email: `eva-ritmo-${marca}@tachit.test`, contrasena: `Clave-${marca}-E` };
const leo = { nombre: 'Leo Ritmo', email: `leo-ritmo-${marca}@tachit.test`, contrasena: `Clave-${marca}-L` };

after(async () => {
    if (esBDPruebas) {
        const emails = [eva.email, leo.email];
        await dbTareas.query('DELETE t FROM tareas t JOIN usuarios u ON u.id = t.user_id WHERE u.email IN (?)', [emails]);
        await dbTareas.query('DELETE FROM usuarios WHERE email IN (?)', [emails]);
    }
    await poolTareas.end();
});

const con = (token) => ({
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url, cuerpo) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(cuerpo),
    patch: (url, cuerpo) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(cuerpo),
});
async function registrarYEntrar(usuario) {
    assert.strictEqual((await request(app).post('/api/auth/register').send(usuario)).status, 201);
    const res = await request(app).post('/api/auth/login').send({ email: usuario.email, contrasena: usuario.contrasena });
    return con(res.body.token);
}
const crear = async (cliente, datos) => (await cliente.post('/api/tareas', datos)).body.id;
const tachar = (cliente, id) => cliente.patch(`/api/tareas/${id}/estado`, { estado: 'completada' });
const buscar = async (cliente, id) => (await cliente.get('/api/tareas')).body.find((t) => t.id === id);

// El lunes de esta semana y el de la anterior (en UTC, como el servidor)
const iso = (d) => d.toISOString().slice(0, 10);
const hoy = new Date();
const lunesEsta = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - ((hoy.getUTCDay() + 6) % 7)));
const lunesPasado = iso(new Date(lunesEsta.getTime() - 7 * 864e5));
const lunesSiguiente = iso(lunesEsta); // el lunes "de la semana que viene" de la semana pasada

test('Mi ritmo de principio a fin', opciones, async (t) => {
    const yo = await registrarYEntrar(eva);
    const otro = await registrarYEntrar(leo);

    await t.test('minutos reales: solo en tareas MÍAS y ya tachadas, y con un número sensato', async () => {
        const id = await crear(yo, { titulo: 'Pasear al perro', duracion_min: 30 });
        // Aún sin tachar: no se puede
        assert.strictEqual((await yo.patch(`/api/tareas/${id}/minutos-reales`, { minutos_reales: 25 })).status, 409);
        assert.strictEqual((await tachar(yo, id)).status, 200);

        const bien = await yo.patch(`/api/tareas/${id}/minutos-reales`, { minutos_reales: 45 });
        assert.strictEqual(bien.status, 200);
        assert.strictEqual((await buscar(yo, id)).minutos_reales, 45);
        // Mismo valor otra vez: sigue yendo bien
        assert.strictEqual((await yo.patch(`/api/tareas/${id}/minutos-reales`, { minutos_reales: 45 })).status, 200);

        // Otra persona no puede tocarla (ni saber si existe)
        assert.strictEqual((await otro.patch(`/api/tareas/${id}/minutos-reales`, { minutos_reales: 5 })).status, 404);
        assert.strictEqual((await buscar(yo, id)).minutos_reales, 45);

        // null lo quita
        assert.strictEqual((await yo.patch(`/api/tareas/${id}/minutos-reales`, { minutos_reales: null })).status, 200);
        assert.strictEqual((await buscar(yo, id)).minutos_reales, null);

        for (const malo of [{}, { minutos_reales: 0 }, { minutos_reales: 721 }, { minutos_reales: 2.5 }, { minutos_reales: '30' }, { minutos_reales: -5 }]) {
            const r = await yo.patch(`/api/tareas/${id}/minutos-reales`, malo);
            assert.strictEqual(r.status, 400, `debería rechazar ${JSON.stringify(malo)}`);
        }
        assert.strictEqual((await yo.patch('/api/tareas/abc/minutos-reales', { minutos_reales: 10 })).status, 400);
        assert.strictEqual((await yo.patch('/api/tareas/999999999/minutos-reales', { minutos_reales: 10 })).status, 404);
    });

    await t.test('historial: mis tachadas con su hora, sin nada de otra persona', async () => {
        const a = await crear(yo, { titulo: 'Comprar fruta' });
        const antes = Date.now() - 5000;
        await tachar(yo, a);
        const ajena = await crear(otro, { titulo: 'Tarea de Leo' });
        await tachar(otro, ajena);

        const res = await yo.get('/api/ritmo');
        assert.strictEqual(res.status, 200);
        assert.match(res.body.desde, /^\d{4}-\d{2}-\d{2}$/);
        assert.strictEqual(res.body.recortado, false);
        const tachadas = res.body.eventos.filter((e) => e.tipo === 'completada');
        assert.strictEqual(tachadas.length, 2); // la del perro y la de la fruta
        const fruta = tachadas.find((e) => e.tarea_id === a);
        assert.ok(fruta.en >= antes && fruta.en <= Date.now() + 5000, 'la hora va en milisegundos y es la de ahora');
        assert.ok(!res.body.eventos.some((e) => e.tarea_id === ajena), 'nunca sale nada de otra persona');

        // Destachar también queda (la racha lo necesita)
        await yo.patch(`/api/tareas/${a}/estado`, { estado: 'pendiente' });
        const otraVez = await yo.get('/api/ritmo');
        assert.ok(otraVez.body.eventos.some((e) => e.tipo === 'reabierta' && e.tarea_id === a));

        // Días muy antiguos: vacío
        const viejo = await yo.get('/api/ritmo?desde=2020-01-01&hasta=2020-01-31');
        assert.strictEqual(viejo.status, 200);
        assert.deepStrictEqual(viejo.body.eventos, []);

        for (const malo of [
            '?desde=2026-02-30', '?hasta=ayer', '?desde=2026-10-10&hasta=2026-10-01', '?desde=2024-01-01&hasta=2026-01-01',
            '?desde=2026-10-01&desde=2026-10-02',
        ]) {
            assert.strictEqual((await yo.get(`/api/ritmo${malo}`)).status, 400, `debería rechazar ${malo}`);
        }
    });

    await t.test('lo que se te atasca: las pendientes movidas 2 veces o más', async () => {
        const id = await crear(yo, { titulo: 'Llamar al dentista', fecha_limite: '2026-11-02' });
        for (const fecha of ['2026-11-03', '2026-11-04']) {
            await yo.patch('/api/tareas/horario', { cambios: [{ id, fecha_limite: fecha, hora_limite: '10:00' }] });
        }
        const { atascadas } = (await yo.get('/api/ritmo')).body;
        assert.strictEqual(atascadas.length, 1);
        assert.strictEqual(atascadas[0].titulo, 'Llamar al dentista');
        assert.strictEqual(atascadas[0].veces_aplazada, 2);
        assert.deepStrictEqual((await otro.get('/api/ritmo')).body.atascadas, []);
    });

    await t.test('«Hoy, sí»: la tarea atascada pasa a hoy, sin hora y deja de estar atascada', async () => {
        const id = await crear(yo, { titulo: 'Ordenar el trastero', fecha_limite: '2026-11-02', hora_limite: '18:00' });
        for (const fecha of ['2026-11-04', '2026-11-06', '2026-11-09']) {
            await yo.patch('/api/tareas/horario', { cambios: [{ id, fecha_limite: fecha, hora_limite: '18:00' }] });
        }
        assert.ok((await yo.get('/api/ritmo')).body.atascadas.some((a) => a.id === id));

        // Otra persona no puede
        assert.strictEqual((await otro.patch(`/api/tareas/${id}/desatascar`, { hoy: '2026-11-19' })).status, 404);

        const res = await yo.patch(`/api/tareas/${id}/desatascar`, { hoy: '2026-11-19' });
        assert.strictEqual(res.status, 200);
        const tarea = await buscar(yo, id);
        assert.strictEqual(tarea.fecha_limite, '2026-11-19');
        assert.strictEqual(tarea.hora_limite, null);
        assert.strictEqual(tarea.veces_aplazada, 0);
        assert.ok(!(await yo.get('/api/ritmo')).body.atascadas.some((a) => a.id === id), 'ya no sale en lo que se te atasca');

        // Tachada: no se puede; datos raros: no
        await tachar(yo, id);
        assert.strictEqual((await yo.patch(`/api/tareas/${id}/desatascar`, { hoy: '2026-11-19' })).status, 409);
        for (const malo of [{}, { hoy: 'hoy' }, { hoy: '2026-02-30' }]) {
            assert.strictEqual((await yo.patch(`/api/tareas/${id}/desatascar`, malo)).status, 400);
        }
        assert.strictEqual((await yo.patch('/api/tareas/abc/desatascar', { hoy: '2026-11-19' })).status, 400);
    });

    await t.test('cerrar la semana: pasa al lunes, apunta el foco y es todo o nada', async () => {
        const salud = (await yo.post('/api/categorias', { nombre: 'Salud' })).body.categoria.id;
        const deLeo = (await otro.post('/api/categorias', { nombre: 'Casa' })).body.categoria.id;
        const p1 = await crear(yo, { titulo: 'Ordenar el armario', fecha_limite: lunesPasado });
        const p2 = await crear(yo, { titulo: 'Escribir a la abuela' }); // sin día
        const hecha = await crear(yo, { titulo: 'Tender la ropa', fecha_limite: lunesPasado });
        await tachar(yo, hecha);
        const ajena = await crear(otro, { titulo: 'Tarea de Leo', fecha_limite: lunesPasado });

        // Lo que NO se puede: nada cambia
        const base = { semana_inicio: lunesPasado, completadas: 4 };
        assert.strictEqual((await yo.post('/api/ritmo/cierres', { ...base, foco_categoria_id: deLeo })).status, 404);
        assert.strictEqual((await yo.post('/api/ritmo/cierres', { ...base, pasar_al_lunes: [p1, ajena] })).status, 404);
        assert.strictEqual((await yo.post('/api/ritmo/cierres', { ...base, pasar_al_lunes: [p1, hecha] })).status, 409);
        assert.strictEqual((await buscar(yo, p1)).fecha_limite, lunesPasado, 'si algo falla, no se mueve ninguna');
        assert.strictEqual((await buscar(otro, ajena)).fecha_limite, lunesPasado);

        // Bien: dos pendientes al lunes y foco en Salud
        const res = await yo.post('/api/ritmo/cierres', { ...base, pasar_al_lunes: [p2, p1, p1], foco_categoria_id: salud });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.lunes, lunesSiguiente);
        assert.strictEqual(res.body.cierre.pasadas_al_lunes, 2);
        const t1 = await buscar(yo, p1);
        assert.strictEqual(t1.fecha_limite, lunesSiguiente);
        assert.strictEqual(t1.veces_aplazada, 1); // tenía día y va a más tarde: aplazada
        const t2 = await buscar(yo, p2);
        assert.strictEqual(t2.fecha_limite, lunesSiguiente);
        assert.strictEqual(t2.veces_aplazada, 0); // no tenía día: no cuenta como aplazada

        // Sale en el historial
        const { cierres, eventos } = (await yo.get('/api/ritmo')).body;
        const cierre = cierres.find((c) => c.semana_inicio === lunesPasado);
        assert.deepStrictEqual(cierre, { semana_inicio: lunesPasado, completadas: 4, pasadas_al_lunes: 2, foco_categoria_id: salud });
        assert.ok(eventos.some((e) => e.tipo === 'movida' && e.tarea_id === p1 && e.fecha_nueva === lunesSiguiente));
        assert.deepStrictEqual((await otro.get('/api/ritmo')).body.cierres, []);

        // La misma semana dos veces: no
        assert.strictEqual((await yo.post('/api/ritmo/cierres', base)).status, 409);
        // Otra persona sí puede cerrar SU semana
        assert.strictEqual((await otro.post('/api/ritmo/cierres', base)).status, 201);

        for (const malo of [
            {}, { ...base, semana_inicio: iso(new Date(lunesEsta.getTime() - 6 * 864e5)) }, // un martes
            { ...base, semana_inicio: '2099-01-05' }, // aún no ha empezado
            { ...base, completadas: -1 }, { ...base, completadas: 'muchas' },
            { ...base, pasar_al_lunes: 'todas' }, { ...base, pasar_al_lunes: Array.from({ length: 101 }, (_, i) => i + 1) },
            { ...base, foco_categoria_id: 'Salud' },
        ]) {
            assert.strictEqual((await yo.post('/api/ritmo/cierres', malo)).status, 400, `debería rechazar ${JSON.stringify(malo).slice(0, 80)}`);
        }
    });
});

test('Mi ritmo sin token devuelve 401', async () => {
    for (const [metodo, url] of [['get', '/api/ritmo'], ['post', '/api/ritmo/cierres'], ['patch', '/api/tareas/1/minutos-reales'], ['patch', '/api/tareas/1/desatascar']]) {
        assert.strictEqual((await request(app)[metodo](url)).status, 401, `${metodo} ${url}`);
    }
});
