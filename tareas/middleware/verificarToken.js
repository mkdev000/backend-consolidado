const jwt = require('jsonwebtoken');

function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        return res.status(401).json({ mensaje: 'No se proporcionó ningún token' });
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ mensaje: 'Token inválido o caducado' });
        }

        req.usuario = decoded;
        next();
    });
}

module.exports = verificarToken;