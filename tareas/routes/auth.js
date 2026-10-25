const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { dbTareas } = require('../../db');
const validar = require('../middleware/validar');
const {
    esquemaRegistro,
    esquemaLogin,
    esquemaGoogle,
    esquemaOlvideContrasena,
    esquemaRestablecerContrasena,
} = require('../validacion/esquemas');
const {
    limiteLoginPorIp,
    limiteLoginPorEmail,
    limiteRegistro,
    limiteRecuperacionPorIp,
    limiteRecuperacionPorEmail,
    limiteRestablecer,
    limiteRenovar,
} = require('../middleware/limites');
// Se usa como "google.obtenerDatosDeGoogle(...)" (y no desestructurado) para que las pruebas
// puedan sustituir a Google por un doble de prueba sin conectarse a Internet.
const google = require('../google');
const recuperacion = require('../recuperacion');
const sesiones = require('../sesiones');

// Hash falso: si el email no existe, comparamos igualmente contra este hash.
// Así el login tarda lo mismo exista o no el email, y nadie puede averiguar
// qué emails están registrados midiendo el tiempo de respuesta.
const HASH_FALSO = bcrypt.hashSync('usuario-que-no-existe', 10);

// Registra el error SIN volcar la consulta SQL completa
// (podría incluir el email o el hash de la contraseña).
function registrarError(donde, error) {
    console.error(`[auth/${donde}]`, error.code ?? '', error.message);
}


// limiteRegistro: máximo 10 registros por hora desde la misma conexión
// validar(esquemaRegistro): nombre, email válido y contraseña segura (requisitos del prototipo)
router.post('/register', limiteRegistro, validar(esquemaRegistro), async (req, res) => {
    const { nombre, email, contrasena } = req.datos;

    try {
        const contrasenaHasheada = await bcrypt.hash(contrasena, 10);

        await dbTareas.query(
            'INSERT INTO usuarios (nombre, email, contrasena) VALUES (?, ?, ?)',
            [nombre, email, contrasenaHasheada]
        );

        res.status(201).json({ mensaje: 'Usuario registrado correctamente' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ mensaje: 'Ese email ya está registrado' });
        }
        registrarError('register', error);
        res.status(500).json({ mensaje: 'Error al registrar el usuario' });
    }
});

// Los límites van ANTES de validar: así también cuentan los intentos con datos mal formados.
// limiteLoginPorIp: 5 fallos por minuto desde la misma conexión
// limiteLoginPorEmail: 10 fallos cada 15 minutos contra la misma cuenta
// validar(esquemaLogin): email y contraseña son textos de tamaño razonable
router.post('/login', limiteLoginPorIp, limiteLoginPorEmail, validar(esquemaLogin), async (req, res) => {
    const { email, contrasena } = req.datos;

    try {
        const [filas] = await dbTareas.query(
            'SELECT id, nombre, contrasena FROM usuarios WHERE email = ?',
            [email]
        );
        const usuario = filas[0];

        // Las cuentas creadas con Google no tienen contraseña (NULL). Con ellas también se compara
        // contra el hash falso: tarda lo mismo y responde lo mismo, así nadie puede averiguar
        // qué emails usan Google. (bcrypt.compare con NULL, además, daría un error 500.)
        const tieneContrasena = Boolean(usuario?.contrasena);
        const contrasenaCorrecta = await bcrypt.compare(
            contrasena,
            tieneContrasena ? usuario.contrasena : HASH_FALSO
        );

        if (!tieneContrasena || !contrasenaCorrecta) {
            return res.status(401).json({ mensaje: 'Email o contraseña incorrectos' });
        }

        // Dos pases: el corto (15 min) va en la respuesta y el de renovación (30 días), en la cookie
        const token = await sesiones.iniciarSesion(res, usuario);
        res.json({ mensaje: 'Login correcto', token, nombre: usuario.nombre });
    } catch (error) {
        registrarError('login', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
});

// ---------- Continuar con Google ----------

// Nombre para una cuenta nueva: el de Google; si no hay, lo de antes de la @ del email.
function nombreParaCuentaNueva(persona) {
    const nombre = persona.nombre.trim() || persona.email.split('@')[0];
    return nombre.slice(0, 100) || 'Usuario';
}

// Busca la cuenta de esta persona o la crea. Devuelve { usuario, nuevo, unida }.
// Tres casos, en este orden:
//  1. Ya entró antes con Google  → la encontramos por su google_sub.
//  2. Tiene cuenta con contraseña y el MISMO email → unimos Google a esa cuenta (ver SEGURIDAD).
//  3. No tiene cuenta → la creamos sin contraseña.
async function buscarOCrearConGoogle(persona) {
    // Hasta 2 vueltas: si dos peticiones llegan a la vez (doble clic), la segunda choca con la
    // primera (email o google_sub repetido) y en la 2.ª vuelta ya encuentra la cuenta creada.
    for (let vuelta = 1; ; vuelta++) {
        try {
            const [porSub] = await dbTareas.query('SELECT id, nombre FROM usuarios WHERE google_sub = ?', [persona.sub]);
            if (porSub[0]) return { usuario: porSub[0], nuevo: false, unida: false };

            const [porEmail] = await dbTareas.query('SELECT id, nombre, google_sub FROM usuarios WHERE email = ?', [persona.email]);
            const existente = porEmail[0];

            if (existente) {
                // Doble clic: la otra petición acaba de crear la cuenta con ESTA misma cuenta de Google
                // entre nuestras dos búsquedas. No es un error: es la misma persona entrando.
                if (existente.google_sub === persona.sub) {
                    return { usuario: { id: existente.id, nombre: existente.nombre }, nuevo: false, unida: false };
                }
                if (existente.google_sub) {
                    throw new google.ErrorGoogle(409, 'Este email ya está unido a otra cuenta de Google.');
                }
                if (!persona.emailDeFiar) {
                    throw new google.ErrorGoogle(409, 'Ya tienes una cuenta de Tachit con este email. Entra con tu email y contraseña.');
                }
                // SEGURIDAD (robo de cuenta "por adelantado"): Tachit todavía no comprueba los emails al
                // registrarse, así que alguien pudo crear una cuenta con TU email y una contraseña suya,
                // esperando a que algún día entres con Google. Por eso, al unir Google, la contraseña
                // se borra: a partir de ahora solo entra quien controla de verdad ese email.
                // (Con "¿Olvidaste tu contraseña?", paso 9, podrás volver a ponerte una.)
                // "AND google_sub IS NULL": si otra petición la unió justo ahora, no la pisamos.
                const [resultado] = await dbTareas.query(
                    'UPDATE usuarios SET google_sub = ?, contrasena = NULL WHERE id = ? AND google_sub IS NULL',
                    [persona.sub, existente.id]
                );
                if (resultado.affectedRows === 1) {
                    return { usuario: { id: existente.id, nombre: existente.nombre }, nuevo: false, unida: true };
                }
                throw Object.assign(new Error('La cuenta cambió mientras la uníamos'), { code: 'ER_DUP_ENTRY' });
            }

            const nombre = nombreParaCuentaNueva(persona);
            const [resultado] = await dbTareas.query(
                'INSERT INTO usuarios (nombre, email, contrasena, google_sub) VALUES (?, ?, NULL, ?)',
                [nombre, persona.email, persona.sub]
            );
            return { usuario: { id: resultado.insertId, nombre }, nuevo: true, unida: false };
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY' && vuelta < 2) continue;
            throw error;
        }
    }
}

// limiteLoginPorIp: los intentos fallidos con Google también cuentan (5 por minuto por conexión)
// validar(esquemaGoogle): solo se acepta { codigo: "..." }
router.post('/google', limiteLoginPorIp, validar(esquemaGoogle), async (req, res) => {
    // Si faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET en el servidor, el botón no puede funcionar
    if (!google.estaConfigurado()) {
        return res.status(503).json({ mensaje: 'El acceso con Google no está disponible ahora mismo.' });
    }

    try {
        const persona = await google.obtenerDatosDeGoogle(req.datos.codigo);

        if (persona.email.length > 150) {
            return res.status(400).json({ mensaje: 'Ese email es demasiado largo para Tachit.' });
        }

        const { usuario, nuevo, unida } = await buscarOCrearConGoogle(persona);
        const token = await sesiones.iniciarSesion(res, usuario);

        res.status(nuevo ? 201 : 200).json({
            mensaje: nuevo ? 'Cuenta creada con Google' : 'Login correcto',
            token,
            nombre: usuario.nombre,
            nuevo,
            unida,
        });
    } catch (error) {
        // Errores "esperados" (código caducado, email sin verificar...): mensaje claro, sin detalles internos
        if (error instanceof google.ErrorGoogle) {
            return res.status(error.estado).json({ mensaje: error.message });
        }
        registrarError('google', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
});

// ---------- Renovar la sesión y cerrarla ----------

// Pedir un pase corto nuevo con el pase de renovación de la cookie (la app lo hace sola, sin que lo notes).
// Cada vez, el pase de renovación se cambia por uno nuevo (rotación).
router.post('/renovar', limiteRenovar, async (req, res) => {
    const codigo = sesiones.leerCookie(req);
    if (!codigo) {
        return res.status(401).json({ mensaje: 'Tu sesión ha caducado. Vuelve a entrar.' });
    }
    try {
        const resultado = await sesiones.renovar(codigo);
        if (!resultado) {
            sesiones.borrarCookie(res);
            return res.status(401).json({ mensaje: 'Tu sesión ha caducado. Vuelve a entrar.' });
        }
        sesiones.ponerCookie(res, resultado.codigo);
        res.json({ mensaje: 'Sesión renovada', token: sesiones.crearPaseCorto(resultado.usuario), nombre: resultado.usuario.nombre });
    } catch (error) {
        registrarError('renovar', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
});

// Cerrar sesión DE VERDAD: el pase de renovación de este dispositivo queda anulado en el servidor.
// Responde 200 siempre (aunque no hubiera sesión): el resultado para el usuario es el mismo.
router.post('/cerrar-sesion', async (req, res) => {
    const codigo = sesiones.leerCookie(req);
    try {
        if (codigo) await sesiones.cerrarSesion(codigo);
    } catch (error) {
        registrarError('cerrar-sesion', error);
    }
    sesiones.borrarCookie(res);
    res.json({ mensaje: 'Sesión cerrada' });
});

// ---------- ¿Olvidaste tu contraseña? ----------

// La MISMA respuesta exista o no la cuenta: así nadie puede averiguar qué emails están registrados
const RESPUESTA_ENLACE_PEDIDO =
    'Si ese email tiene una cuenta en Tachit, te hemos enviado un enlace para elegir una contraseña nueva. Caduca en 30 minutos.';

// 1) Pedir el enlace por email
router.post('/olvide-contrasena', limiteRecuperacionPorIp, limiteRecuperacionPorEmail, validar(esquemaOlvideContrasena), (req, res) => {
    // Si faltan RESEND_API_KEY, EMAIL_REMITENTE o FRONTEND_URL, no podemos mandar el email
    if (!recuperacion.estaConfigurado()) {
        return res.status(503).json({ mensaje: 'Recuperar la contraseña no está disponible ahora mismo. Inténtalo más tarde.' });
    }
    // Respondemos YA y el trabajo (buscar la cuenta, crear el enlace, mandar el email) se hace después.
    // Así la respuesta tarda lo mismo exista o no la cuenta (nadie lo puede deducir midiendo el tiempo).
    recuperacion.pedirEnlaceEnSegundoPlano(req.datos.email);
    res.json({ mensaje: RESPUESTA_ENLACE_PEDIDO });
});

// 2) Usar el enlace: poner la contraseña nueva
router.post('/restablecer-contrasena', limiteRestablecer, validar(esquemaRestablecerContrasena), async (req, res) => {
    try {
        const cambiada = await recuperacion.restablecer(req.datos.token, req.datos.contrasena);
        if (!cambiada) {
            return res.status(400).json({ mensaje: 'El enlace no es válido o ha caducado. Pide uno nuevo.' });
        }
        res.json({ mensaje: 'Contraseña cambiada. Ya puedes entrar con tu contraseña nueva.' });
    } catch (error) {
        registrarError('restablecer', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
});

module.exports = router;
