/* ============================================
   AUTH ROUTES - Cadastro e Login
   ============================================ */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prepare } = require('../database');
const { JWT_SECRET } = require('../config');
const { authLimiter } = require('../middleware');

const TRIAL_DAYS = 7;

// ============ CADASTRO ============
router.post('/register', authLimiter, (req, res) => {
    try {
        const { name, email, instagram, password, phone } = req.body;

        if (!name || !email || !instagram || !password) {
            return res.status(400).json({ success: false, message: 'Todos os campos obrigatórios devem ser preenchidos.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'A senha deve ter no mínimo 6 caracteres.' });
        }

        const igUsername = instagram.replace('@', '').trim().toLowerCase();

        // Verificar duplicados
        const existingEmail = prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
        if (existingEmail) {
            return res.status(400).json({ success: false, message: 'Este email já está cadastrado.' });
        }

        const existingIG = prepare('SELECT id FROM users WHERE instagram = ?').get(igUsername);
        if (existingIG) {
            return res.status(400).json({ success: false, message: 'Este @ do Instagram já está cadastrado.' });
        }

        // Hash da senha
        const hashedPassword = bcrypt.hashSync(password, 10);

        // Calcular trial
        const now = new Date();
        const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

        // Inserir
        const result = prepare(
            `INSERT INTO users (name, email, instagram, password, phone, plan, trial_start, trial_end) VALUES (?, ?, ?, ?, ?, 'trial', ?, ?)`
        ).run(name.trim(), email.toLowerCase().trim(), igUsername, hashedPassword, phone ? phone.trim() : null, now.toISOString(), trialEnd.toISOString());

        // Inserir na tabela user_instagrams
        prepare('INSERT INTO user_instagrams (user_id, instagram, plan, plan_start, plan_end) VALUES (?, ?, ?, ?, ?)')
            .run(result.lastInsertRowid, igUsername, 'trial', now.toISOString(), trialEnd.toISOString());

        // Trial libera TODOS os produtos ativos (combo de teste 7 dias)
        try {
            const prods = prepare('SELECT code FROM products WHERE is_active = 1').all();
            prods.forEach(p => {
                prepare('INSERT OR IGNORE INTO user_products (user_id, product_code, is_active, plan, plan_start, plan_end) VALUES (?, ?, 1, ?, ?, ?)')
                    .run(result.lastInsertRowid, p.code, 'trial', now.toISOString(), trialEnd.toISOString());
            });
        } catch (e) { console.error('Erro ao criar direitos trial:', e.message); }

        // Token JWT
        const token = jwt.sign({ userId: result.lastInsertRowid, email: email.toLowerCase() }, JWT_SECRET, { expiresIn: '30d' });

        res.status(201).json({
            success: true,
            message: 'Conta criada com sucesso!',
            token,
            user: {
                id: result.lastInsertRowid,
                name: name.trim(),
                email: email.toLowerCase(),
                instagram: igUsername,
                instagrams: [{ instagram: igUsername, plan: 'trial', plan_end: trialEnd.toISOString() }],
                plan: 'trial',
                trialStart: now.toISOString(),
                trialEnd: trialEnd.toISOString()
            }
        });

    } catch (err) {
        console.error('Erro no cadastro:', err);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});

// ============ LOGIN ============
router.post('/login', authLimiter, (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email e senha são obrigatórios.' });
        }

        const user = prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
        if (!user) {
            return res.status(401).json({ success: false, message: 'Email ou senha incorretos.' });
        }

        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ success: false, message: 'Email ou senha incorretos.' });
        }

        if (!user.is_active) {
            return res.status(403).json({ success: false, message: 'Conta desativada. Entre em contato pelo WhatsApp.' });
        }

        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        const licenseStatus = getLicenseStatus(user);

        // Buscar todos os @ do usuário
        const instagrams = prepare('SELECT id, instagram, plan, plan_start, plan_end, is_active FROM user_instagrams WHERE user_id = ?').all(user.id);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                instagram: user.instagram,
                instagrams: instagrams,
                plan: user.plan,
                trialStart: user.trial_start,
                trialEnd: user.trial_end,
                subscriptionStart: user.subscription_start,
                subscriptionEnd: user.subscription_end,
                licenseStatus
            }
        });

    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});

// ============ PERFIL ============
router.get('/profile', authenticateToken, (req, res) => {
    try {
        const user = prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        }

        // Buscar todos os @ do usuário
        const instagrams = prepare('SELECT id, instagram, plan, plan_start, plan_end, is_active FROM user_instagrams WHERE user_id = ?').all(user.id);

        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                instagram: user.instagram,
                instagrams: instagrams,
                plan: user.plan,
                trialStart: user.trial_start,
                trialEnd: user.trial_end,
                subscriptionStart: user.subscription_start,
                subscriptionEnd: user.subscription_end,
                licenseStatus: getLicenseStatus(user),
                createdAt: user.created_at
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});

// ============ RECUPERAÇÃO DE SENHA ============
router.post('/request-reset', authLimiter, (req, res) => {
    try {
        const { email, phone } = req.body;
        if (!email || !phone) return res.status(400).json({ success: false, message: 'Email e celular são obrigatórios.' });

        // Verifica email e celular. Remover caracteres especiais do celular para comparação (opcional, mas recomendado limpar espaços)
        const user = prepare('SELECT id FROM users WHERE email = ? AND phone = ?').get(email.toLowerCase().trim(), phone.trim());
        if (!user) {
            return res.status(404).json({ success: false, message: 'Nenhuma conta encontrada com esta combinação de email e celular.' });
        }

        const crypto = require('crypto');
        const token = crypto.randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + 15 * 60000).toISOString(); // 15 mins

        prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt);

        // SEGURANÇA: token NUNCA volta na resposta (antes vazava no F12/rede e permitia
        // tomar a conta de qualquer email+telefone). O suporte envia o código pelo
        // WhatsApp após conferir a identidade. Log servidor p/ relay manual:
        console.log('[RESET] código para user_id ' + user.id + ' (expira em 15min). Enviar via WhatsApp após identidade.');
        try { console.log('[RESET-TOKEN] user_id=' + user.id + ' token=' + token); } catch (e) {}

        res.json({ success: true, message: 'Se os dados conferirem, nosso suporte enviará o código de redefinição pelo WhatsApp em instantes.' });
    } catch (err) {
        console.error('Erro no request-reset:', err);
        res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
    }
});

router.post('/reset-password', (req, res) => {
    try {
        const { token, new_password, new_password_confirm } = req.body;
        if (!token || !new_password) return res.status(400).json({ success: false, message: 'Dados inválidos.' });
        if (new_password !== new_password_confirm) return res.status(400).json({ success: false, message: 'As senhas não coincidem.' });
        if (new_password.length < 6) return res.status(400).json({ success: false, message: 'A senha deve ter no mínimo 6 caracteres.' });

        const reset = prepare('SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > datetime("now")').get(token);
        if (!reset) return res.status(400).json({ success: false, message: 'Tempo expirado ou código inválido.' });

        // Atualizar senha
        const hashedPassword = bcrypt.hashSync(new_password, 10);
        prepare('UPDATE users SET password = ?, updated_at = datetime("now") WHERE id = ?').run(hashedPassword, reset.user_id);
        
        // Marcar token como usado
        prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);

        res.json({ success: true, message: 'Senha redefinida com sucesso! Você já pode fazer login.' });
    } catch (err) {
        console.error('Erro no reset-password:', err);
        res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
    }
});

// ============ HELPERS ============
function getLicenseStatus(user) {
    const now = new Date();

    // Admin tem licença permanente
    if (user.plan === 'admin') {
        return { active: true, type: 'admin', expiresAt: null, daysLeft: 99999 };
    }

    if (user.plan !== 'trial' && user.subscription_end) {
        const subEnd = new Date(user.subscription_end);
        if (subEnd > now) {
            return { active: true, type: user.plan, expiresAt: user.subscription_end, daysLeft: Math.ceil((subEnd - now) / 86400000) };
        }
    }

    if (user.trial_end) {
        const trialEnd = new Date(user.trial_end);
        if (trialEnd > now) {
            return { active: true, type: 'trial', expiresAt: user.trial_end, daysLeft: Math.ceil((trialEnd - now) / 86400000) };
        }
    }

    return { active: false, type: 'expired', expiresAt: null, daysLeft: 0 };
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Token não fornecido.' });

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Token inválido ou expirado.' });
    }
}

module.exports = router;
module.exports.authenticateToken = authenticateToken;
module.exports.getLicenseStatus = getLicenseStatus;
