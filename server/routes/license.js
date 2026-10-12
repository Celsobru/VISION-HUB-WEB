/* ============================================
   LICENSE ROUTES - Verificação de Licença
   ============================================ */

const express = require('express');
const router = express.Router();
const { prepare } = require('../database');
const { getLicenseStatus } = require('./auth');

// ============ VERIFICAR LICENÇA POR @INSTAGRAM ============
router.get('/check', (req, res) => {
    try {
        const { instagram } = req.query;
        if (!instagram) {
            return res.status(400).json({ success: false, licensed: false, message: 'Parâmetro instagram é obrigatório.' });
        }

        const igUsername = instagram.replace('@', '').trim().toLowerCase();
        const product = String(req.query.product || 'instabot').trim().toLowerCase();

        // Log da verificação
        const logIt = (userId, result) => {
            try { prepare('INSERT INTO license_checks (user_id, instagram, ip_address, result) VALUES (?, ?, ?, ?)').run(userId, igUsername, req.ip, result); } catch(e) {}
        };

        // ============ DIREITO POR PRODUTO (admin liga/desliga cada extensão por cliente) ============
        try {
            let ownerId = null;
            let ownerPlan = null;
            let ownerName = null;
            const link = prepare('SELECT ui.user_id, u.plan AS user_plan, u.name AS user_name FROM user_instagrams ui JOIN users u ON ui.user_id = u.id WHERE ui.instagram = ?').get(igUsername);
            if (link) {
                ownerId = link.user_id; ownerPlan = link.user_plan; ownerName = link.user_name;
            } else {
                const fb = prepare('SELECT id AS user_id, plan AS user_plan, name AS user_name FROM users WHERE instagram = ?').get(igUsername);
                if (fb) { ownerId = fb.user_id; ownerPlan = fb.user_plan; ownerName = fb.user_name; }
            }
            if (ownerId) {
                const ent = prepare('SELECT * FROM user_products WHERE user_id = ? AND product_code = ?').get(ownerId, product);
                if (ent) {
                    const now = new Date();
                    if (ownerPlan === 'admin' || ent.plan === 'admin') {
                        logIt(ownerId, 'active');
                        return res.json({ success: true, licensed: true, status: 'admin', product, expiresAt: null, daysLeft: 99999, userName: ownerName, message: 'Acesso permanente de administrador.' });
                    }
                    if (ent.is_active && ent.plan_end && new Date(ent.plan_end) > now) {
                        const daysLeft = Math.ceil((new Date(ent.plan_end) - now) / 86400000);
                        logIt(ownerId, 'active');
                        return res.json({
                            success: true, licensed: true, status: ent.plan || 'trial', product,
                            expiresAt: ent.plan_end, daysLeft, userName: ownerName,
                            message: (ent.plan === 'trial' ? 'Período de teste: ' : 'Licença ativa: ') + daysLeft + ' dia(s) restante(s)'
                        });
                    }
                    logIt(ownerId, 'expired');
                    return res.json({ success: true, licensed: false, status: !ent.is_active ? 'disabled' : 'expired', product, message: !ent.is_active ? 'Esta extensão está desativada para sua conta. Fale com o suporte.' : 'Sua licença expirou. Renove para continuar.', siteUrl: '/painel.html' });
                }
            }
        } catch (e) { console.error('Erro na checagem por produto:', e.message); }
        // Sem linha em user_products: segue o fluxo legado abaixo.

        // Buscar na tabela user_instagrams
        const igRecord = prepare('SELECT ui.*, u.name as user_name, u.plan as user_plan, u.is_active as user_active, u.trial_end, u.subscription_end FROM user_instagrams ui JOIN users u ON ui.user_id = u.id WHERE ui.instagram = ?').get(igUsername);

        if (!igRecord) {
            // Fallback: buscar na tabela users (compatibilidade)
            const user = prepare('SELECT * FROM users WHERE instagram = ?').get(igUsername);
            if (!user) {
                logIt(null, 'not_found');
                return res.json({ success: true, licensed: false, status: 'not_found', message: 'Nenhuma conta encontrada. Crie sua conta em nosso site.', siteUrl: '/cadastro.html' });
            }

            if (!user.is_active) {
                logIt(user.id, 'deactivated');
                return res.json({ success: true, licensed: false, status: 'deactivated', message: 'Conta desativada. Entre em contato pelo suporte.' });
            }

            const licenseStatus = getLicenseStatus(user);
            logIt(user.id, licenseStatus.active ? 'active' : 'expired');

            if (licenseStatus.active) {
                return res.json({
                    success: true, licensed: true, status: licenseStatus.type,
                    expiresAt: licenseStatus.expiresAt, daysLeft: licenseStatus.daysLeft, userName: user.name,
                    message: licenseStatus.type === 'trial'
                        ? `Período de teste: ${licenseStatus.daysLeft} dia(s) restante(s)`
                        : `Licença ativa: ${licenseStatus.daysLeft} dia(s) restante(s)`
                });
            } else {
                return res.json({ success: true, licensed: false, status: 'expired', message: 'Sua licença expirou. Renove para continuar.', siteUrl: '/painel.html' });
            }
        }

        // Encontrou na user_instagrams
        if (!igRecord.user_active) {
            logIt(igRecord.user_id, 'deactivated');
            return res.json({ success: true, licensed: false, status: 'deactivated', message: 'Conta desativada. Entre em contato pelo suporte.' });
        }

        if (!igRecord.is_active) {
            logIt(igRecord.user_id, 'deactivated_ig');
            return res.json({ success: true, licensed: false, status: 'deactivated', message: 'Este @ foi desativado. Entre em contato pelo suporte.' });
        }

        // Verificar licença do @ específico
        const now = new Date();
        const planEnd = igRecord.plan_end;
        const userPlan = igRecord.user_plan || igRecord.plan;

        // Admin tem licença permanente
        if (userPlan === 'admin') {
            logIt(igRecord.user_id, 'active');
            return res.json({
                success: true, licensed: true, status: 'admin',
                expiresAt: null, daysLeft: 99999, userName: igRecord.user_name,
                message: 'Acesso permanente de administrador.'
            });
        }

        if (planEnd) {
            const endDate = new Date(planEnd);
            if (endDate > now) {
                const daysLeft = Math.ceil((endDate - now) / 86400000);
                const planType = igRecord.plan || 'trial';
                logIt(igRecord.user_id, 'active');
                return res.json({
                    success: true, licensed: true, status: planType,
                    expiresAt: planEnd, daysLeft: daysLeft, userName: igRecord.user_name,
                    message: planType === 'trial'
                        ? `Período de teste: ${daysLeft} dia(s) restante(s)`
                        : `Licença ativa: ${daysLeft} dia(s) restante(s)`
                });
            }
        }

        logIt(igRecord.user_id, 'expired');
        return res.json({ success: true, licensed: false, status: 'expired', message: 'Sua licença expirou. Renove para continuar.', siteUrl: '/painel.html' });

    } catch (err) {
        console.error('Erro na verificação:', err);
        res.status(500).json({ success: false, licensed: false, message: 'Erro ao verificar licença.' });
    }
});

// ============ ATIVAR ASSINATURA ============
router.post('/activate', (req, res) => {
    try {
        const { email, plan, months } = req.body;
        if (!email || !plan) {
            return res.status(400).json({ success: false, message: 'Email e plano são obrigatórios.' });
        }

        const user = prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
        if (!user) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        }

        const now = new Date();
        let subMonths = plan === 'annual' || plan === 'anual' ? 12 : (months ? parseInt(months) : 1);
        const subEnd = new Date(now.getTime() + subMonths * 30 * 24 * 60 * 60 * 1000);

        prepare('UPDATE users SET plan = ?, subscription_start = ?, subscription_end = ?, updated_at = datetime(\'now\') WHERE id = ?')
            .run(plan, now.toISOString(), subEnd.toISOString(), user.id);

        const amount = subMonths >= 12 ? 197 : 29.90 * subMonths;
        prepare('INSERT INTO payments (user_id, amount, plan, payment_method, status) VALUES (?, ?, ?, \'manual\', \'approved\')')
            .run(user.id, amount, plan);

        res.json({ success: true, message: `Assinatura ativada até ${subEnd.toISOString().split('T')[0]}`, subscriptionEnd: subEnd.toISOString() });

    } catch (err) {
        console.error('Erro ao ativar:', err);
        res.status(500).json({ success: false, message: 'Erro ao ativar assinatura.' });
    }
});

// ============ OBTER CONFIGURAÇÕES DE IA POR @INSTAGRAM ============
router.get('/ai-settings', (req, res) => {
    try {
        const { instagram } = req.query;
        if (!instagram) {
            return res.status(400).json({ error: 'Parâmetro instagram é obrigatório.' });
        }

        const igUsername = instagram.replace('@', '').trim().toLowerCase();

        // Buscar usuário dono desse instagram
        let user = prepare('SELECT user_id FROM user_instagrams WHERE instagram = ?').get(igUsername);
        if (!user) {
            user = prepare('SELECT id as user_id FROM users WHERE instagram = ?').get(igUsername);
        }

        if (!user) {
            return res.status(404).json({ error: 'Instagram não cadastrado.' });
        }

        const settings = prepare('SELECT niche_mode, niche_product, instructions, post_time, post_days, is_enabled FROM user_ai_posting_settings WHERE user_id = ?').get(user.user_id);
        if (!settings) {
            return res.json({
                niche_mode: 'manual',
                niche_product: '',
                instructions: '',
                post_time: '09:00',
                post_days: '1,2,3,4,5',
                is_enabled: 0
            });
        }
        res.json(settings);
    } catch (error) {
        console.error('Erro ao buscar configurações de IA via licença:', error);
        res.status(500).json({ error: 'Erro ao buscar configurações.' });
    }
});

module.exports = router;
