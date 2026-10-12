/* ============================================
   PAYMENT ROUTES - Mercado Pago Integration
   ============================================ */

const express = require('express');
const router = express.Router();
const { prepare } = require('../database');

// ============ CONFIGURAÇÃO MERCADO PAGO ============
// Token via .env (MP_ACCESS_TOKEN). Em produção use APP-..., nunca TEST-...
const { MP_ACCESS_TOKEN } = require('../config');

// Planos disponíveis (preço real vem do banco via pricing.js; months aqui define a duração)
const PLANS = {
    mensal: { title: 'Vision Plus - Mensal (30 dias)', price: 79, months: 1 },
    trimestral: { title: 'Vision Plus - Trimestral (3 meses)', price: 180, months: 3 },
    semestral: { title: 'Vision Plus - Semestral (6 meses)', price: 299, months: 6 },
    anual: { title: 'Vision Plus - Anual (12 meses)', price: 499, months: 12 }
};

// ============ CRIAR PREFERÊNCIA DE PAGAMENTO ============
router.post('/create', async (req, res) => {
    try {
        const { plan, email, qtdContas, extraInstagrams } = req.body;

        if (!plan || !PLANS[plan]) {
            return res.status(400).json({ success: false, message: 'Plano inválido.' });
        }

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email obrigatório.' });
        }

        // Verificar se o usuário existe
        const user = prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
        if (!user) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado. Cadastre-se primeiro.' });
        }

        const planInfo = PLANS[plan];
        const baseUrl = `${req.protocol}://${req.get('host')}`;

        // Preço por produtos (combo: instabot 100% + demais por ratio) + multi-conta
        const { quoteTotal } = require('../pricing');
        const reqProducts = req.body.products;
        const items = Array.isArray(reqProducts) && reqProducts.length ? reqProducts : ['instabot'];
        const quote = quoteTotal(items, plan, qtdContas);
        const numContas = quote.qtdContas;
        const totalPrice = quote.total;
        planInfo.quoteLines = quote.lines;
        planInfo.combo = quote.combo;

        // Criar preferência no Mercado Pago
        const prodLabel = quote.lines.map(l => l.name).join(' + ');
        const preference = {
            items: [{
                title: `Vision Plus - ${prodLabel} (${plan})${numContas > 1 ? ' (' + numContas + ' contas)' : ''}`,
                quantity: 1,
                currency_id: 'BRL',
                unit_price: totalPrice
            }],
            payer: {
                email: user.email,
                name: user.name
            },
            external_reference: JSON.stringify({
                userId: user.id,
                plan: plan,
                months: planInfo.months,
                email: user.email,
                qtdContas: numContas,
                extraInstagrams: extraInstagrams || [],
                products: quote.lines.map(l => l.product)
            }),
            back_urls: {
                success: `${baseUrl}/pagamento-sucesso.html`,
                failure: `${baseUrl}/pagamento-falha.html`,
                pending: `${baseUrl}/pagamento-pendente.html`
            }
            // auto_return e notification_url serão adicionados em produção (requer domínio público)
        };

        const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(preference)
        });

        const data = await response.json();

        if (data.id) {
            res.json({
                success: true,
                preferenceId: data.id,
                initPoint: data.init_point,
                sandboxInitPoint: data.sandbox_init_point
            });
        } else {
            console.error('MP Error:', JSON.stringify(data, null, 2));
            res.status(500).json({ success: false, message: 'Erro ao criar pagamento: ' + (data.message || 'erro desconhecido') });
        }

    } catch (err) {
        console.error('Erro ao criar pagamento:', err.message);
        res.status(500).json({ success: false, message: 'Erro ao processar pagamento.' });
    }
});

// ============ WEBHOOK - NOTIFICAÇÃO DO MERCADO PAGO ============
router.post('/webhook', async (req, res) => {
    try {
        const { type, data } = req.body;

        // O MP envia notificação quando pagamento é aprovado
        if (type === 'payment') {
            const paymentId = data.id;

            // Buscar detalhes do pagamento no MP
            const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` }
            });

            const payment = await response.json();

            if (payment.status === 'approved') {
                // Extrair referência externa
                let ref = payment.external_reference;
                if (typeof ref === 'string') {
                    try { ref = JSON.parse(ref); } catch (e) { ref = null; }
                }

                if (ref && ref.userId) {
                    const userId = ref.userId;
                    const plan = ref.plan;
                    const months = ref.months;
                    const qtdContas = Math.max(1, parseInt(ref.qtdContas) || 1);
                    const extraInstagrams = Array.isArray(ref.extraInstagrams) ? ref.extraInstagrams : [];

                    // Ativar assinatura
                    const now = new Date();
                    const subscriptionEnd = new Date(now.getTime() + months * 30 * 24 * 60 * 60 * 1000);

                    prepare('UPDATE users SET plan = ?, subscription_start = ?, subscription_end = ?, updated_at = datetime(\'now\') WHERE id = ?')
                        .run(plan, now.toISOString(), subscriptionEnd.toISOString(), userId);

                    // Sincronizar o @ principal na tabela user_instagrams
                    const user = prepare('SELECT instagram FROM users WHERE id = ?').get(userId);
                    if (user && user.instagram) {
                        const igRec = prepare('SELECT id FROM user_instagrams WHERE user_id = ? AND instagram = ?').get(userId, user.instagram);
                        if (igRec) {
                            prepare('UPDATE user_instagrams SET plan = ?, plan_start = ?, plan_end = ?, is_active = 1 WHERE id = ?')
                                .run(plan, now.toISOString(), subscriptionEnd.toISOString(), igRec.id);
                        } else {
                            prepare('INSERT INTO user_instagrams (user_id, instagram, plan, plan_start, plan_end, is_active) VALUES (?, ?, ?, ?, ?, 1)')
                                .run(userId, user.instagram, plan, now.toISOString(), subscriptionEnd.toISOString());
                        }
                    }

                    // Ativar direitos por produto comprado (combo ou avulso)
                    const bought = Array.isArray(ref.products) && ref.products.length ? ref.products : ['instabot'];
                    bought.forEach(code => {
                        const existing = prepare('SELECT id, plan_end FROM user_products WHERE user_id = ? AND product_code = ?').get(userId, String(code));
                        // Estende a partir do maior entre agora e o vencimento atual
                        let base = now;
                        if (existing && existing.plan_end && new Date(existing.plan_end) > now) base = new Date(existing.plan_end);
                        const end = new Date(base.getTime() + months * 30 * 24 * 60 * 60 * 1000);
                        if (existing) {
                            prepare('UPDATE user_products SET is_active = 1, plan = ?, plan_start = ?, plan_end = ? WHERE id = ?')
                                .run(plan, now.toISOString(), end.toISOString(), existing.id);
                        } else {
                            prepare('INSERT INTO user_products (user_id, product_code, is_active, plan, plan_start, plan_end) VALUES (?, ?, 1, ?, ?, ?)')
                                .run(userId, String(code), plan, now.toISOString(), end.toISOString());
                        }
                    });

                    // Registrar pagamento
                    prepare('INSERT INTO payments (user_id, amount, plan, payment_method, payment_id, status) VALUES (?, ?, ?, ?, ?, ?)')
                        .run(userId, payment.transaction_amount || 0, plan, 'mercadopago', String(paymentId), 'approved');

                    // Ativar/Criar @ adicionais comprados (multi-conta)
                    extraInstagrams.forEach(ig => {
                        const igUsername = String(ig).replace('@', '').trim().toLowerCase();
                        if (!igUsername) return;

                        const existing = prepare('SELECT id FROM user_instagrams WHERE instagram = ?').get(igUsername);
                        if (existing) {
                            prepare('UPDATE user_instagrams SET user_id = ?, plan = ?, plan_start = ?, plan_end = ?, is_active = 1 WHERE id = ?')
                                .run(userId, plan, now.toISOString(), subscriptionEnd.toISOString(), existing.id);
                        } else {
                            prepare('INSERT INTO user_instagrams (user_id, instagram, plan, plan_start, plan_end, is_active) VALUES (?, ?, ?, ?, ?, 1)')
                                .run(userId, igUsername, plan, now.toISOString(), subscriptionEnd.toISOString());
                        }
                    });

                    console.log(`✅ Pagamento aprovado! Usuário #${userId} → Plano ${plan} (${qtdContas} conta(s)) até ${subscriptionEnd.toISOString().split('T')[0]}`);
                }
            }
        }

        res.status(200).send('OK');

    } catch (err) {
        console.error('Webhook error:', err);
        res.status(200).send('OK'); // MP espera 200 sempre
    }
});

// ============ VERIFICAR STATUS DE PAGAMENTO ============
router.get('/status/:paymentId', async (req, res) => {
    try {
        const response = await fetch(`https://api.mercadopago.com/v1/payments/${req.params.paymentId}`, {
            headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` }
        });

        const payment = await response.json();
        res.json({
            success: true,
            status: payment.status,
            statusDetail: payment.status_detail
        });

    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao verificar pagamento.' });
    }
});

module.exports = router;
module.exports.PLANS = PLANS;
