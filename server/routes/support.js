/* ============================================
   SUPPORT ROUTES - Tickets de Suporte
   ============================================ */

const express = require('express');
const router = express.Router();
const { prepare } = require('../database');

// ============ CRIAR TICKET ============
router.post('/ticket', (req, res) => {
    try {
        const { name, email, instagram, subject, message } = req.body;

        if (!name || !email || !subject || !message) {
            return res.status(400).json({ success: false, message: 'Todos os campos são obrigatórios.' });
        }

        // Verificar se o usuário existe pelo email
        const user = prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
        const userId = user ? user.id : null;
        const igUsername = instagram ? instagram.replace('@', '').toLowerCase() : '';

        prepare('INSERT INTO support_tickets (user_id, name, email, instagram, subject, message) VALUES (?, ?, ?, ?, ?, ?)')
            .run(userId, name.trim(), email.toLowerCase().trim(), igUsername, subject, message.trim());

        res.json({ success: true, message: 'Ticket criado com sucesso.' });

    } catch (err) {
        console.error('Erro ao criar ticket:', err);
        res.status(500).json({ success: false, message: 'Erro ao criar ticket.' });
    }
});

module.exports = router;
