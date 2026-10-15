// tareas/validacion/esquemas.js
// Las "normas de la puerta" (esquemas de Zod) de cada ruta de la API.
// Cada esquema describe qué datos se aceptan, los limpia (quita espacios, pasa '' a null...)
// y, si algo no cumple, devuelve un mensaje claro en español.
//
// Basado en los prototipos de Tachit (web y móvil) y en los límites de la base de datos.
const { z } = require('zod');

// ---------- Ayudantes ----------

// Texto opcional: quita espacios, limita la longitud y convierte '' en null.
const textoOpcional = (maximo, nombre) =>
    z
        .string({ error: `${nombre} tiene que ser un texto` })
        .trim()
        .max(maximo, `${nombre} puede tener como máximo ${maximo} caracteres`)
        .nullish()
        .transform((valor) => (valor ? valor : null));

// Fecha u hora opcional: acepta el formato correcto, '' o null. '' se guarda como null.
// El mismo mensaje se pone en el formato y en la unión, para que siempre salga en español.
const opcionalConFormato = (crearFormato, mensaje) =>
    z
        .union([crearFormato({ error: mensaje }), z.literal(''), z.null()], { error: mensaje })
        .optional()
        .transform((valor) => (valor ? valor : null));

// ---------- Cuentas ----------

// Requisitos de contraseña del prototipo: "8 caracteres o más", "Una mayúscula", "Un número", "Un símbolo (!@#…)".
// Máximo 72 bytes: bcrypt ignora lo que pasa de 72 bytes, así que una contraseña más larga
// sería "más corta de lo que parece". Mejor avisar que guardarla a medias.
const contrasenaSegura = z
    .string({ error: 'La contraseña es obligatoria' })
    .min(8, 'La contraseña necesita 8 caracteres o más')
    .regex(/\p{Lu}/u, 'La contraseña necesita una mayúscula')
    .regex(/\p{N}/u, 'La contraseña necesita un número')
    .regex(/[^\p{L}\p{N}\s]/u, 'La contraseña necesita un símbolo (!@#…)')
    .refine((valor) => Buffer.byteLength(valor, 'utf8') <= 72, 'La contraseña es demasiado larga (máximo 72 caracteres)');

const esquemaRegistro = z.object({
    nombre: z
        .string({ error: 'El nombre es obligatorio' })
        .trim()
        .min(1, 'El nombre es obligatorio')
        .max(100, 'El nombre puede tener como máximo 100 caracteres'),
    email: z
        .string({ error: 'El email es obligatorio' })
        .trim()
        .toLowerCase()
        .pipe(z.email('El email no es válido').max(150, 'El email puede tener como máximo 150 caracteres')),
    contrasena: contrasenaSegura,
});

// En el login NO se exigen los requisitos de contraseña: las cuentas antiguas deben poder entrar.
// Solo se comprueba que lleguen dos textos de un tamaño razonable.
const esquemaLogin = z.object({
    email: z
        .string({ error: 'Faltan datos obligatorios' })
        .trim()
        .toLowerCase()
        .min(1, 'Faltan datos obligatorios')
        .max(150, 'Email o contraseña incorrectos'),
    contrasena: z
        .string({ error: 'Faltan datos obligatorios' })
        .min(1, 'Faltan datos obligatorios')
        .max(200, 'Email o contraseña incorrectos'),
});

// "Continuar con Google": solo llega el código de un solo uso que da la ventanita de Google.
// (Los códigos de Google miden unos 70-100 caracteres; 1024 deja margen sin aceptar textos enormes.)
const esquemaGoogle = z.object({
    codigo: z
        .string({ error: 'Falta el código de Google' })
        .trim()
        .min(1, 'Falta el código de Google')
        .max(1024, 'El código de Google no es válido'),
});

// ---------- Tareas ----------

const ESTADOS = ['pendiente', 'en_progreso', 'en_pausa', 'completada'];
// 'urgente' no está en el prototipo, pero el frontend actual lo ofrece.
// Se quitará cuando se rehaga la pantalla de crear tarea (Fase 6).
const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'];

// Iconos de tarea del prototipo (TICON_KEYS), avisos posibles (RSTEPS) y repeticiones.
const ICONOS = ['tarta', 'regalo', 'medico', 'viaje', 'estudio', 'deporte', 'compras', 'hogar', 'trabajo', 'llamada'];
const AVISOS = [0, 10, 60, 1440]; // en punto, 10 min, 1 h, 1 día (null = sin aviso)
const REPETICIONES = ['diaria', 'semanal', 'mensual'];

// Campos nuevos de Tachit. Todos son OPCIONALES:
//   - si NO se envían (undefined), al crear se usa el valor por defecto y al editar NO se tocan;
//   - si se envían como null, se vacían (sin aviso, sin repetición, sin icono...).
// Así el formulario actual del frontend, que no los conoce, no los borra al editar.
const camposNuevosTarea = {
    duracion_min: z
        .number({ error: 'La duración tiene que ser un número de minutos' })
        .int('La duración tiene que ser un número entero de minutos')
        .min(5, 'La duración mínima es de 5 minutos')
        .max(1440, 'La duración máxima es de 24 horas')
        .optional(),
    aviso_min: z
        .literal(AVISOS, { error: 'El aviso tiene que ser: en punto, 10 min, 1 h o 1 día' })
        .nullable()
        .optional(),
    repeticion: z.enum(REPETICIONES, { error: 'La repetición no es válida' }).nullable().optional(),
    // Días de la semana para la repetición semanal: 0 = domingo ... 6 = sábado
    dias_semana: z
        .array(z.number().int().min(0).max(6), { error: 'Los días de la semana no son válidos' })
        .max(7)
        .nullable()
        .optional()
        .transform((dias) => (dias == null ? dias : [...new Set(dias)].sort((a, b) => a - b))),
    icono: z.enum(ICONOS, { error: 'El icono no es válido' }).nullable().optional(),
    minutos_reales: z
        .number({ error: 'Los minutos reales tienen que ser un número' })
        .int()
        .min(0)
        .max(1440, 'Los minutos reales no pueden pasar de 24 horas')
        .nullable()
        .optional(),
};

// Reglas que mezclan dos campos: la repetición semanal necesita días, y los días solo valen con "semanal".
function comprobarRepeticion(datos, ctx) {
    const hayDias = Array.isArray(datos.dias_semana) && datos.dias_semana.length > 0;
    if (datos.repeticion === 'semanal' && datos.dias_semana !== undefined && !hayDias) {
        ctx.addIssue({ code: 'custom', path: ['dias_semana'], message: 'Elige al menos un día para la repetición semanal' });
    }
    if (hayDias && datos.repeticion !== undefined && datos.repeticion !== 'semanal') {
        ctx.addIssue({ code: 'custom', path: ['dias_semana'], message: 'Los días solo se usan con la repetición semanal' });
    }
}

// Los campos que no aparecen aquí (id, user_id, veces_aplazada...) se IGNORAN: nunca llegan a la base de datos.
const esquemaTareaBase = z.object({
    titulo: z
        .string({ error: 'El título es obligatorio' })
        .trim()
        .min(1, 'El título es obligatorio')
        .max(150, 'El título puede tener como máximo 150 caracteres'),
    descripcion: textoOpcional(2000, 'La descripción'),
    estado: z
        .enum(ESTADOS, { error: 'El estado no es válido' })
        .nullish()
        .transform((valor) => valor ?? 'pendiente'),
    prioridad: z
        .enum(PRIORIDADES, { error: 'La prioridad no es válida' })
        .nullish()
        .transform((valor) => valor ?? 'media'),
    proyecto: textoOpcional(100, 'El proyecto'),
    fecha_limite: opcionalConFormato(z.iso.date, 'La fecha no es válida (formato AAAA-MM-DD)'),
    hora_limite: opcionalConFormato(z.iso.time, 'La hora no es válida (formato HH:MM)'),
    ...camposNuevosTarea,
});

// Editar (PUT): el uuid no se puede cambiar, así que ni se acepta.
const esquemaTarea = esquemaTareaBase.superRefine(comprobarRepeticion);

// Crear (POST): además, el móvil puede mandar su propio uuid (modo sin conexión, Fase 12).
const esquemaTareaCrear = esquemaTareaBase
    .extend({ uuid: z.uuid('El identificador (uuid) no es válido').optional() })
    .superRefine(comprobarRepeticion);

// ---------- Subtareas ----------

const tituloSubtarea = z
    .string({ error: 'El título de la subtarea es obligatorio' })
    .trim()
    .min(1, 'El título de la subtarea es obligatorio')
    .max(150, 'La subtarea puede tener como máximo 150 caracteres');

const esquemaSubtareaCrear = z.object({
    tarea_id: z.number({ error: 'Falta la tarea' }).int().positive('Falta la tarea'),
    titulo: tituloSubtarea,
});

const esquemaSubtareaCambiar = z
    .object({
        titulo: tituloSubtarea.optional(),
        hecha: z.boolean({ error: '"hecha" tiene que ser verdadero o falso' }).optional(),
    })
    .refine((d) => d.titulo !== undefined || d.hecha !== undefined, 'No hay nada que cambiar');

// ---------- Categorías ----------

const nombreCategoria = z
    .string({ error: 'El nombre de la categoría es obligatorio' })
    .trim()
    .min(1, 'El nombre de la categoría es obligatorio')
    .max(40, 'La categoría puede tener como máximo 40 caracteres');

const colorCategoria = z
    .string({ error: 'El color no es válido' })
    .regex(/^#[0-9a-fA-F]{6}$/, 'El color tiene que tener el formato #RRGGBB')
    .transform((c) => c.toLowerCase());

const esquemaCategoriaCrear = z.object({
    nombre: nombreCategoria,
    color: colorCategoria.optional(),
});

const esquemaCategoriaCambiar = z
    .object({ nombre: nombreCategoria.optional(), color: colorCategoria.optional() })
    .refine((d) => d.nombre !== undefined || d.color !== undefined, 'No hay nada que cambiar');

// Las categorías de una tarea (como mucho 10, sin repetir)
const esquemaCategoriasDeTarea = z.object({
    ids: z
        .array(z.number().int().positive(), { error: 'Las categorías no son válidas' })
        .max(10, 'Una tarea puede tener como máximo 10 categorías')
        .transform((ids) => [...new Set(ids)]),
});

// ---------- Ajustes del usuario ----------

const TEMAS = ['nube', 'malva', 'peonia', 'cacao'];
const IDIOMAS = ['es', 'en', 'fr'];

// Una zona horaria es válida si el propio Node la reconoce (Europe/Madrid sí, Marte/Olympus no)
function esZonaHoraria(zona) {
    try {
        new Intl.DateTimeFormat('es', { timeZone: zona });
        return true;
    } catch {
        return false;
    }
}

const interruptor = (nombre) => z.boolean({ error: `"${nombre}" tiene que ser verdadero o falso` }).optional();

const esquemaAjustes = z
    .object({
        tema: z.enum(TEMAS, { error: 'El tema no es válido' }).optional(),
        idioma: z.enum(IDIOMAS, { error: 'El idioma no es válido' }).optional(),
        zona_horaria: z
            .string({ error: 'La zona horaria no es válida' })
            .max(64)
            .refine(esZonaHoraria, 'La zona horaria no es válida')
            .optional(),
        avisos_activos: interruptor('avisos_activos'),
        briefing_activo: interruptor('briefing_activo'),
        copia_drive_activa: interruptor('copia_drive_activa'),
        energia_al_reorganizar: interruptor('energia_al_reorganizar'),
        corregir_tiempos: interruptor('corregir_tiempos'),
    })
    .refine((d) => Object.values(d).some((v) => v !== undefined), 'No hay nada que cambiar');

module.exports = {
    esquemaRegistro,
    esquemaLogin,
    esquemaGoogle,
    esquemaTarea,
    esquemaTareaCrear,
    esquemaSubtareaCrear,
    esquemaSubtareaCambiar,
    esquemaCategoriaCrear,
    esquemaCategoriaCambiar,
    esquemaCategoriasDeTarea,
    esquemaAjustes,
    ESTADOS,
    PRIORIDADES,
    ICONOS,
    AVISOS,
};
