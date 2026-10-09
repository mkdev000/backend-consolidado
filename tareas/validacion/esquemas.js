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

// ---------- Tareas ----------

const ESTADOS = ['pendiente', 'en_progreso', 'en_pausa', 'completada'];
// 'urgente' no está en el prototipo, pero el frontend actual lo ofrece.
// Se quitará cuando se rehaga la pantalla de crear tarea (Fase 6).
const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'];

// Los campos que no aparecen aquí (id, uuid, user_id...) se IGNORAN: nunca llegan a la base de datos.
const esquemaTarea = z.object({
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
});

module.exports = { esquemaRegistro, esquemaLogin, esquemaTarea, ESTADOS, PRIORIDADES };
