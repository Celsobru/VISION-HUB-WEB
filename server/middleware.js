/* ============================================
   MIDDLEWARE - Autenticação compartilhada
   ============================================ */

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config');

function checkAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    // Suporte legado para chamadas com ?key= na query (ex: download de backup)
    const queryKey = req.query.key;
    if (!token) {
        if (queryKey) {
            try {
                const decoded = jwt.verify(queryKey, JWT_SECRET);
                if (decoded.role === 'admin') {
                    req.admin = decoded;
                    return next();
                }
            } catch (e) { /* token inválido */ }
        }
        return res.status(401).json({ success: false, message: 'Token não fornecido.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Acesso negado.' });
        }
        req.admin = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Token inválido ou expirado.' });
    }
}

// Rate limit simples em memória (sem dependências): protege login/cadastro/reset de força bruta
const __rlBuckets = new Map();
function authLimiter(req, res, next) {
    try {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const key = ip + ':' + req.path;
        const now = Date.now();
        const WINDOW = 15 * 60 * 1000;
        const MAX = 20;
        let entry = __rlBuckets.get(key);
        if (!entry || now - entry.start > WINDOW) {
            entry = { start: now, count: 0 };
            __rlBuckets.set(key, entry);
        }
        entry.count++;
        // Limpeza oportunista
        if (__rlBuckets.size > 5000) {
            for (const [k, v] of __rlBuckets) {
                if (now - v.start > WINDOW) __rlBuckets.delete(k);
            }
        }
        if (entry.count > MAX) {
            return res.status(429).json({ success: false, message: 'Muitas tentativas. Aguarde 15 minutos.' });
        }
        next();
    } catch (e) { next(); }
}

module.exports = { checkAdmin, authLimiter };
