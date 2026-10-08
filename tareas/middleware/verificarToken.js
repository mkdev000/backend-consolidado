const jwt = require('jsonwebtoken');

// Comprueba que la petición trae un token válido ("Authorization: Bearer <token>").
// Si es válido, guarda los datos del usuario en req.usuario y deja pasar.
function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        return res.status(401).json({ mensaje: 'No se proporcionó ningún token' });
    }

    const [tipo, token] = authHeader.split(' ');
    if (tipo !== 'Bearer' || !token) {
        return res.status(401).json({ mensaje: 'Formato de token no válido' });
    }

    // algorithms: solo aceptamos tokens firmados con HS256 (el que usamos al crearlos)
    jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }, (err, decoded) => {
        if (err) {
            return res.status(403).json({ mensaje: 'Token inválido o caducado' });
        }

        req.usuario = decoded;
        next();
    });
}

module.exports = verificarToken;
