/* ============================================
   ADMIN ROUTES - Gerenciamento Completo
   ============================================ */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prepare, getDb, saveDatabase, initDatabase } = require('../database');

const { checkAdmin } = require('../middleware');
const { JWT_SECRET } = require('../config');

// ============ ADMIN LOGIN ============
router.post('/login', (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: 'Email e senha são obrigatórios.' });

        const admin = prepare('SELECT * FROM admins WHERE email = ?').get(email.toLowerCase().trim());
        if (!admin) return res.status(401).json({ success: false, message: 'Credenciais inválidas.' });

        const valid = bcrypt.compareSync(password, admin.password);
        if (!valid) return res.status(401).json({ success: false, message: 'Credenciais inválidas.' });

        const token = jwt.sign({ adminId: admin.id, email: admin.email, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });

        res.json({ success: true, token, email: admin.email, name: admin.name });
    } catch (err) {
        console.error('Erro no login admin:', err);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});

// ============ ADMIN CONFIGURAÇÕES ============
router.put('/settings', checkAdmin, (req, res) => {
    try {
        const { email, new_password, current_password } = req.body;
        const adminId = req.admin.adminId;

        const admin = prepare('SELECT * FROM admins WHERE id = ?').get(adminId);
        if (!admin) return res.status(404).json({ success: false, message: 'Admin não encontrado.' });

        // Senha atual é obrigatória para alterar
        if (!current_password || !bcrypt.compareSync(current_password, admin.password)) {
            return res.status(403).json({ success: false, message: 'Senha atual incorreta.' });
        }

        let updateSQL = 'UPDATE admins SET email = ?';
        let params = [email ? email.toLowerCase().trim() : admin.email];

        if (new_password) {
            if (new_password.length < 6) return res.status(400).json({ success: false, message: 'A nova senha deve ter no mínimo 6 caracteres.' });
            const hashed = bcrypt.hashSync(new_password, 10);
            updateSQL += ', password = ?';
            params.push(hashed);
        }

        updateSQL += ' WHERE id = ?';
        params.push(adminId);

        prepare(updateSQL).run(...params);

        res.json({ success: true, message: 'Configurações atualizadas com sucesso.', email: params[0] });
    } catch (err) {
        console.error('Erro ao atualizar admin:', err);
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ success: false, message: 'Este email já está em uso.' });
        }
        res.status(500).json({ success: false, message: 'Erro interno ao salvar configurações.' });
    }
});

// ============ LISTAR USUÁRIOS ============
router.get('/users', checkAdmin, (req, res) => {
    try {
        const users = prepare('SELECT id, name, email, instagram, plan, trial_start, trial_end, subscription_start, subscription_end, is_active, created_at FROM users ORDER BY created_at DESC').all();
        // Anexar lista de @ e direitos por extensão de cada usuário
        users.forEach(u => {
            u.instagrams = prepare('SELECT id, instagram, plan, plan_start, plan_end, is_active FROM user_instagrams WHERE user_id = ?').all(u.id);
            u.products = prepare('SELECT product_code, is_active, plan, plan_end FROM user_products WHERE user_id = ?').all(u.id);
        });
        res.json({ success: true, total: users.length, users });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao listar usuários.' });
    }
});

// ============ EDITAR USUÁRIO (completo) ============
router.put('/users/:id', checkAdmin, (req, res) => {
    try {
        const { name, email, instagram, plan, expiry, bonus, is_active } = req.body;
        const userId = parseInt(req.params.id);

        const user = prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!user) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });

        // Calcular data de expiração final
        let finalExpiry = expiry ? new Date(expiry) : null;

        // Se alterou o plano, calcular nova data
        if (plan && plan !== user.plan) {
            const now = new Date();
            if (plan === 'admin') {
                // Admin tem licença permanente (99 anos)
                finalExpiry = new Date(now.getTime() + 99 * 365 * 24 * 60 * 60 * 1000);
            } else if (plan === 'trial') {
                finalExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            } else if (plan === 'mensal') {
                finalExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            } else if (plan === 'trimestral') {
                finalExpiry = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
            } else if (plan === 'semestral') {
                finalExpiry = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
            } else if (plan === 'anual') {
                finalExpiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
            }
        }

        // Adicionar bônus de dias
        if (bonus && bonus > 0 && finalExpiry) {
            finalExpiry = new Date(finalExpiry.getTime() + bonus * 24 * 60 * 60 * 1000);
        } else if (bonus && bonus > 0 && !finalExpiry) {
            const currentExpiry = user.subscription_end || user.trial_end;
            const base = currentExpiry ? new Date(currentExpiry) : new Date();
            finalExpiry = new Date(base.getTime() + bonus * 24 * 60 * 60 * 1000);
        }

        const finalPlan = plan || user.plan;
        const finalExpiryStr = finalExpiry ? finalExpiry.toISOString() : (user.subscription_end || user.trial_end);

        // Update fields 
        if (finalPlan === 'trial') {
            prepare('UPDATE users SET name=?, email=?, instagram=?, plan=?, trial_start=datetime(\'now\'), trial_end=?, is_active=?, updated_at=datetime(\'now\') WHERE id=?')
                .run(name || user.name, email || user.email, (instagram || user.instagram).replace('@', '').toLowerCase(), finalPlan, finalExpiryStr, is_active !== undefined ? is_active : user.is_active, userId);
        } else {
            prepare('UPDATE users SET name=?, email=?, instagram=?, plan=?, subscription_start=COALESCE(subscription_start, datetime(\'now\')), subscription_end=?, is_active=?, updated_at=datetime(\'now\') WHERE id=?')
                .run(name || user.name, email || user.email, (instagram || user.instagram).replace('@', '').toLowerCase(), finalPlan, finalExpiryStr, is_active !== undefined ? is_active : user.is_active, userId);
        }

        res.json({ success: true, message: 'Cliente atualizado com sucesso.' });

        // Sincronizar plano para user_instagrams (@ principal)
        try {
            prepare('UPDATE user_instagrams SET plan = ?, plan_end = ? WHERE user_id = ? AND instagram = ?')
                .run(finalPlan, finalExpiryStr, userId, (instagram || user.instagram).replace('@', '').toLowerCase());
        } catch(e) {}

    } catch (err) {
        console.error('Erro ao editar:', err);
        res.status(500).json({ success: false, message: 'Erro ao editar cliente.' });
    }
});

// ============ ATIVAR/DESATIVAR ============
router.put('/users/:id/toggle', checkAdmin, (req, res) => {
    try {
        const user = prepare('SELECT * FROM users WHERE id = ?').get(parseInt(req.params.id));
        if (!user) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        const newStatus = user.is_active ? 0 : 1;
        prepare('UPDATE users SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newStatus, parseInt(req.params.id));
        res.json({ success: true, message: `Usuário ${newStatus ? 'ativado' : 'desativado'}.`, is_active: newStatus });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao alterar status.' });
    }
});

// ============ ADICIONAR @ AO CLIENTE (grátis, pelo admin) ============
router.post('/users/:id/add-instagram', checkAdmin, (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { instagram } = req.body;
        if (!instagram) return res.status(400).json({ success: false, message: '@ do Instagram é obrigatório.' });

        const igUsername = instagram.replace('@', '').trim().toLowerCase();

        // Verificar se já existe
        const existing = prepare('SELECT id FROM user_instagrams WHERE instagram = ?').get(igUsername);
        if (existing) return res.status(400).json({ success: false, message: 'Este @ já está cadastrado.' });

        // Pegar dados do usuário para copiar plano e datas
        const user = prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!user) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });

        const planEnd = user.subscription_end || user.trial_end;
        const planStart = user.subscription_start || user.trial_start;

        prepare('INSERT INTO user_instagrams (user_id, instagram, plan, plan_start, plan_end) VALUES (?, ?, ?, ?, ?)')
            .run(userId, igUsername, user.plan, planStart, planEnd);

        res.json({ success: true, message: `@${igUsername} adicionado com sucesso.` });
    } catch (err) {
        console.error('Erro ao adicionar @:', err);
        res.status(500).json({ success: false, message: 'Erro ao adicionar @.' });
    }
});

// ============ REMOVER @ DO CLIENTE ============
router.delete('/users/:id/instagram/:igId', checkAdmin, (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const igId = parseInt(req.params.igId);

        // Não permitir remover o @ principal
        const user = prepare('SELECT instagram FROM users WHERE id = ?').get(userId);
        const ig = prepare('SELECT instagram FROM user_instagrams WHERE id = ?').get(igId);
        if (user && ig && user.instagram === ig.instagram) {
            return res.status(400).json({ success: false, message: 'Não é possível remover o @ principal.' });
        }

        prepare('DELETE FROM user_instagrams WHERE id = ? AND user_id = ?').run(igId, userId);
        res.json({ success: true, message: '@ removido com sucesso.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao remover @.' });
    }
});

// ============ ESTATÍSTICAS ============
router.get('/stats', checkAdmin, (req, res) => {
    try {
        const totalUsers = prepare("SELECT COUNT(*) as count FROM users").get().count;
        const activeTrials = prepare("SELECT COUNT(*) as count FROM users WHERE plan = 'trial' AND trial_end > datetime('now')").get().count;
        const activeSubs = prepare("SELECT COUNT(*) as count FROM users WHERE plan != 'trial' AND plan != 'admin' AND subscription_end > datetime('now')").get().count;
        const totalPayments = prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'approved'").get().total;
        const totalDownloads = prepare("SELECT COUNT(*) as count FROM downloads").get().count;

        res.json({
            success: true,
            stats: { totalUsers, activeTrials, activeSubscriptions: activeSubs, totalPayments: `R$ ${Number(totalPayments).toFixed(2)}`, totalDownloads }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao buscar estatísticas.' });
    }
});

// ============ TICKETS DE SUPORTE ============
router.get('/tickets', checkAdmin, (req, res) => {
    try {
        const tickets = prepare('SELECT * FROM support_tickets ORDER BY created_at DESC').all();
        res.json({ success: true, tickets });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao listar tickets.' });
    }
});

router.put('/tickets/:id/resolve', checkAdmin, (req, res) => {
    try {
        prepare("UPDATE support_tickets SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?").run(parseInt(req.params.id));
        res.json({ success: true, message: 'Ticket resolvido.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao resolver ticket.' });
    }
});

// ============ REGISTRAR DOWNLOAD ============
router.post('/download-track', (req, res) => {
    try {
        const { email } = req.body;
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

        let userId = null;
        if (email) {
            const user = prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
            if (user) userId = user.id;
        }

        prepare('INSERT INTO downloads (user_id, email, ip_address) VALUES (?, ?, ?)').run(userId, email || 'anônimo', ip);
        res.json({ success: true });
    } catch (err) {
        console.error('Download track error:', err);
        res.json({ success: false });
    }
});

// ============ BACKUP - DOWNLOAD DO BANCO COMPLETO ============
router.get('/backup', checkAdmin, (req, res) => {
    try {
        // Salvar estado atual antes de exportar
        saveDatabase();

        const DB_PATH = path.join(__dirname, '..', 'visionplus.db');

        if (!fs.existsSync(DB_PATH)) {
            return res.status(404).json({ success: false, message: 'Arquivo de banco de dados não encontrado.' });
        }

        // Gerar nome do arquivo com data/hora
        const now = new Date();
        const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `visionplus-backup-${dateStr}.db`;

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const fileBuffer = fs.readFileSync(DB_PATH);
        res.send(fileBuffer);

        console.log(`  📦 Backup gerado: ${filename} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
    } catch (err) {
        console.error('Erro ao gerar backup:', err);
        res.status(500).json({ success: false, message: 'Erro ao gerar backup.' });
    }
});

// ============ RESTORE - RESTAURAR BANCO A PARTIR DE UPLOAD ============
router.post('/restore', checkAdmin, express.raw({ type: 'application/octet-stream', limit: '50mb' }), async (req, res) => {
    try {
        if (!req.body || req.body.length === 0) {
            return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
        }

        const DB_PATH = path.join(__dirname, '..', 'visionplus.db');
        const BACKUP_DIR = path.join(__dirname, '..', 'backups');

        // Criar pasta de backups de segurança se não existir
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }

        // Salvar backup de segurança do banco atual antes de restaurar
        saveDatabase();
        const now = new Date();
        const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const safetyBackup = path.join(BACKUP_DIR, `pre-restore-${dateStr}.db`);
        fs.copyFileSync(DB_PATH, safetyBackup);
        console.log(`  🛡️ Backup de segurança salvo: ${safetyBackup}`);

        // Validar que o arquivo recebido é um SQLite válido
        const initSqlJs = require('sql.js');
        const SQL = await initSqlJs();
        let testDb;
        try {
            testDb = new SQL.Database(new Uint8Array(req.body));
            // Verificar se tem a tabela users (validação básica)
            const check = testDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
            if (check.length === 0 || check[0].values.length === 0) {
                testDb.close();
                return res.status(400).json({ success: false, message: 'Arquivo inválido: não contém a tabela de usuários.' });
            }
            // Contar registros para informar
            const countResult = testDb.exec("SELECT COUNT(*) as count FROM users");
            const userCount = countResult[0].values[0][0];
            testDb.close();

            // Salvar arquivo restaurado
            fs.writeFileSync(DB_PATH, Buffer.from(req.body));

            // Reinicializar o banco em memória
            await initDatabase();

            console.log(`  ✅ Banco restaurado com sucesso! ${userCount} usuários encontrados.`);
            res.json({ success: true, message: `Banco restaurado com sucesso! ${userCount} usuário(s) encontrados.`, userCount });

        } catch (validationErr) {
            if (testDb) testDb.close();
            console.error('Arquivo de backup inválido:', validationErr.message);
            return res.status(400).json({ success: false, message: 'Arquivo de backup inválido ou corrompido.' });
        }

    } catch (err) {
        console.error('Erro ao restaurar:', err);
        res.status(500).json({ success: false, message: 'Erro ao restaurar backup.' });
    }
});

// ============ GERENCIAMENTO DE USUÁRIOS (CRIAÇÃO E SENHA) ============
router.post('/users', checkAdmin, (req, res) => {
    try {
        const { name, email, instagram, password, plan, expiry, bonus, is_active } = req.body;
        if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Nome, email e senha são obrigatórios.' });

        const ig = (instagram || '').replace('@', '').toLowerCase().trim();
        const existingEmail = prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
        if (existingEmail) return res.status(400).json({ success: false, message: 'Email já cadastrado.' });

        if (ig) {
            const existingIg = prepare('SELECT id FROM users WHERE instagram = ?').get(ig);
            if (existingIg) return res.status(400).json({ success: false, message: 'Instagram já cadastrado.' });
        }

        const hashed = bcrypt.hashSync(password, 10);
        let finalExpiry = expiry ? new Date(expiry) : null;
        if (bonus && bonus > 0) {
             finalExpiry = finalExpiry ? new Date(finalExpiry.getTime() + bonus * 24 * 60 * 60 * 1000) : new Date(Date.now() + bonus * 24 * 60 * 60 * 1000);
        }
        
        const finalPlan = plan || 'trial';
        if (!finalExpiry && finalPlan === 'trial') finalExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        if (!finalExpiry && finalPlan === 'trimestral') finalExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        if (!finalExpiry && finalPlan === 'semestral') finalExpiry = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
        if (!finalExpiry && finalPlan === 'anual') finalExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        if (!finalExpiry && finalPlan === 'admin') finalExpiry = new Date(Date.now() + 99 * 365 * 24 * 60 * 60 * 1000);
        const finalExpiryStr = finalExpiry ? finalExpiry.toISOString() : null;

        const result = prepare('INSERT INTO users (name, email, instagram, password, plan, trial_start, trial_end, subscription_start, subscription_end, is_active) VALUES (?, ?, ?, ?, ?, datetime(\'now\'), ?, datetime(\'now\'), ?, ?)')
            .run(name, email.toLowerCase().trim(), ig, hashed, finalPlan, 
                 finalPlan === 'trial' ? finalExpiryStr : null, 
                 finalPlan !== 'trial' ? finalExpiryStr : null,
                 is_active !== undefined ? is_active : 1);

        if (ig) {
            prepare('INSERT INTO user_instagrams (user_id, instagram, plan, plan_start, plan_end) VALUES (?, ?, ?, datetime(\'now\'), ?)')
                .run(result.lastInsertRowid, ig, finalPlan, finalExpiryStr);
        }

        res.json({ success: true, message: 'Usuário criado com sucesso.' });
    } catch (err) {
        console.error('Erro ao criar usuário:', err);
        res.status(500).json({ success: false, message: 'Erro ao criar usuário.' });
    }
});

router.put('/users/:id/password', checkAdmin, (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 6) return res.status(400).json({ success: false, message: 'Senha inválida (mínimo 6 caracteres).' });
        
        const hashed = bcrypt.hashSync(password, 10);
        prepare('UPDATE users SET password = ?, updated_at = datetime(\'now\') WHERE id = ?').run(hashed, parseInt(req.params.id));
        res.json({ success: true, message: 'Senha do usuário redefinida com sucesso.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao redefinir senha do usuário.' });
    }
});

// ============ GERENCIAMENTO DE ADMINISTRADORES ============
router.get('/admins', checkAdmin, (req, res) => {
    try {
        const admins = prepare('SELECT id, name, email, created_at FROM admins ORDER BY created_at ASC').all();
        res.json({ success: true, admins });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao listar administradores.' });
    }
});

router.post('/admins', checkAdmin, (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Preencha todos os campos.' });

        const existing = prepare('SELECT id FROM admins WHERE email = ?').get(email.toLowerCase().trim());
        if (existing) return res.status(400).json({ success: false, message: 'Email já cadastrado para um administrador.' });

        const hashed = bcrypt.hashSync(password, 10);
        prepare('INSERT INTO admins (name, email, password) VALUES (?, ?, ?)').run(name, email.toLowerCase().trim(), hashed);

        res.json({ success: true, message: 'Administrador criado com sucesso.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao criar administrador.' });
    }
});

router.put('/admins/:id/password', checkAdmin, (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 6) return res.status(400).json({ success: false, message: 'Senha inválida (mínimo 6 caracteres).' });
        
        const hashed = bcrypt.hashSync(password, 10);
        prepare('UPDATE admins SET password = ? WHERE id = ?').run(hashed, parseInt(req.params.id));
        res.json({ success: true, message: 'Senha do administrador redefinida com sucesso.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao redefinir senha do admin.' });
    }
});

router.delete('/admins/:id', checkAdmin, (req, res) => {
    try {
        const adminId = parseInt(req.params.id);
        
        const total = prepare('SELECT COUNT(*) as count FROM admins').get().count;
        if (total <= 1) {
            return res.status(400).json({ success: false, message: 'Não é possível remover o único administrador do sistema.' });
        }

        prepare('DELETE FROM admins WHERE id = ?').run(adminId);
        res.json({ success: true, message: 'Administrador removido com sucesso.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao remover administrador.' });
    }
});

// ============ GERENCIAMENTO DE TUTORIAIS ============

// Rota pública para listar tutoriais no painel do usuário
router.get('/tutorials/public', (req, res) => {
    try {
        const tutorials = prepare('SELECT id, title, url FROM tutorials ORDER BY created_at ASC').all();
        res.json({ success: true, tutorials });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao carregar tutoriais.' });
    }
});

// Rotas protegidas (Admin)
router.get('/tutorials', checkAdmin, (req, res) => {
    try {
        const tutorials = prepare('SELECT id, title, url, created_at FROM tutorials ORDER BY created_at ASC').all();
        res.json({ success: true, tutorials });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao listar tutoriais.' });
    }
});

router.post('/tutorials', checkAdmin, (req, res) => {
    try {
        const { title, url } = req.body;
        if (!title || !url) return res.status(400).json({ success: false, message: 'Título e URL são obrigatórios.' });

        prepare('INSERT INTO tutorials (title, url) VALUES (?, ?)').run(title, url);
        saveDatabase();

        res.json({ success: true, message: 'Tutorial adicionado com sucesso.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao adicionar tutorial.' });
    }
});

router.delete('/tutorials/:id', checkAdmin, (req, res) => {
    try {
        prepare('DELETE FROM tutorials WHERE id = ?').run(parseInt(req.params.id));
        saveDatabase();
        res.json({ success: true, message: 'Tutorial removido com sucesso.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao remover tutorial.' });
    }
});

// ============ PRODUTOS / PREÇOS (valores das aplicações) ============
router.get('/products', checkAdmin, (req, res) => {
    try {
        const { getProducts, getPrices } = require('../pricing');
        res.json({ success: true, products: getProducts(), prices: getPrices() });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao listar produtos.' });
    }
});

// Salva preços do base + ratios + ativação (ex: { prices: {instabot:{trimestral:180,...}}, products: [{code, standalone_ratio, combo_ratio, is_active}] })
router.put('/products', checkAdmin, (req, res) => {
    try {
        const { prices, products } = req.body || {};
        if (prices) {
            Object.keys(prices).forEach(code => {
                Object.keys(prices[code] || {}).forEach(period => {
                    const v = Number(prices[code][period]);
                    if (!isFinite(v) || v < 0) return;
                    prepare(`INSERT INTO product_prices (product_code, period, price) VALUES (?, ?, ?)
                        ON CONFLICT(product_code, period) DO UPDATE SET price = excluded.price`)
                        .run(code, period, v);
                });
            });
        }
        if (Array.isArray(products)) {
            products.forEach(p => {
                if (!p || !p.code) return;
                prepare('UPDATE products SET standalone_ratio = ?, combo_ratio = ?, is_active = ? WHERE code = ?')
                    .run(Number(p.standalone_ratio) || 0, Number(p.combo_ratio) || 0,
                        p.is_active ? 1 : 0, String(p.code));
            });
        }
        res.json({ success: true, message: 'Valores atualizados com sucesso.' });
    } catch (err) {
        console.error('Erro ao salvar produtos:', err);
        res.status(500).json({ success: false, message: 'Erro ao salvar valores.' });
    }
});

// ============ DIREITOS DO CLIENTE POR EXTENSÃO ============
// Lista direitos: GET /api/admin/users/:id/products
router.get('/users/:id/products', checkAdmin, (req, res) => {
    try {
        const rows = prepare('SELECT product_code, is_active, plan, plan_start, plan_end FROM user_products WHERE user_id = ?').all(parseInt(req.params.id));
        const { getProducts } = require('../pricing');
        const catalog = getProducts();
        res.json({ success: true, catalog, entitlements: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao listar direitos.' });
    }
});

// Define direitos: { items: [{ product_code, is_active, months? }] }
// months>0 renova a partir do maior entre agora e o vencimento atual
router.put('/users/:id/products', checkAdmin, (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const items = (req.body && req.body.items) || [];
        const user = prepare('SELECT id FROM users WHERE id = ?').get(userId);
        if (!user) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        const now = new Date();
        items.forEach(it => {
            if (!it || !it.product_code) return;
            const code = String(it.product_code);
            const active = it.is_active ? 1 : 0;
            const existing = prepare('SELECT id, plan_end, plan FROM user_products WHERE user_id = ? AND product_code = ?').get(userId, code);
            let planEnd = existing ? existing.plan_end : null;
            let plan = existing ? existing.plan : 'trial';
            const months = parseInt(it.months) || 0;
            if (months > 0) {
                let base = now;
                if (planEnd && new Date(planEnd) > now) base = new Date(planEnd);
                planEnd = new Date(base.getTime() + months * 30 * 24 * 60 * 60 * 1000).toISOString();
                plan = it.plan || plan;
                if (plan === 'trial' && months > 0) plan = 'manual';
            }
            if (existing) {
                prepare('UPDATE user_products SET is_active = ?, plan = ?, plan_end = ? WHERE id = ?')
                    .run(active, it.plan || plan, planEnd, existing.id);
            } else {
                prepare('INSERT INTO user_products (user_id, product_code, is_active, plan, plan_start, plan_end) VALUES (?, ?, ?, ?, ?, ?)')
                    .run(userId, code, active, it.plan || 'trial', now.toISOString(), planEnd);
            }
        });
        res.json({ success: true, message: 'Extensões do cliente atualizadas.' });
    } catch (err) {
        console.error('Erro ao salvar direitos:', err);
        res.status(500).json({ success: false, message: 'Erro ao salvar direitos.' });
    }
});

module.exports = router;
