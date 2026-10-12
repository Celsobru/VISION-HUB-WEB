/* ============================================
   HOSTING ROUTES - Gerenciamento de Hospedagem
   CRUD de clientes + controle real de processos
   ============================================ */

const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const { prepare } = require('../database');
const { checkAdmin } = require('../middleware');

// ============ HELPERS ============

function isPidAlive(pid) {
    if (!pid) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return e.code === 'EPERM';
    }
}

function killProcess(pid) {
    if (!pid) return;
    try {
        process.kill(pid);
    } catch (e) { /* já morto */ }

    // No Windows, derruba a árvore de processos (o spawn usa shell:true)
    if (process.platform === 'win32') {
        try {
            spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
        } catch (e) { /* ignorar */ }
    }
}

// ============ LISTAR CLIENTES ============
router.get('/clients', checkAdmin, (req, res) => {
    try {
        let clients = prepare('SELECT * FROM hosting_clients ORDER BY created_at DESC').all();

        // Ajusta status em tempo real: se o processo não está mais vivo, marca como parado
        clients.forEach(c => {
            if (c.status === 'running' && !isPidAlive(c.pid)) {
                c.status = 'stopped';
                c.pid = null;
                prepare('UPDATE hosting_clients SET status = ?, pid = ? WHERE id = ?').run('stopped', null, c.id);
            }
        });

        res.json({ success: true, clients });
    } catch (err) {
        console.error('Erro ao listar clientes de hospedagem:', err);
        res.status(500).json({ success: false, message: 'Erro ao listar clientes.' });
    }
});

// ============ CRIAR CLIENTE ============
router.post('/clients', checkAdmin, (req, res) => {
    try {
        const { client_name, email, domain, app_name, type, plan, directory, start_command, port, notes } = req.body;
        if (!client_name) return res.status(400).json({ success: false, message: 'Nome do cliente é obrigatório.' });

        prepare('INSERT INTO hosting_clients (client_name, email, domain, app_name, type, plan, directory, start_command, port, notes) VALUES (?,?,?,?,?,?,?,?,?,?)')
            .run(
                client_name.trim(),
                (email || '').trim(),
                (domain || '').trim(),
                (app_name || '').trim(),
                type || 'site',
                plan || 'basico',
                (directory || '').trim(),
                (start_command || '').trim(),
                port || null,
                (notes || '').trim()
            );

        res.json({ success: true, message: 'Cliente de hospedagem adicionado.' });
    } catch (err) {
        console.error('Erro ao adicionar cliente de hospedagem:', err);
        res.status(500).json({ success: false, message: 'Erro ao adicionar cliente.' });
    }
});

// ============ ATUALIZAR CLIENTE ============
router.put('/clients/:id', checkAdmin, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const existing = prepare('SELECT * FROM hosting_clients WHERE id = ?').get(id);
        if (!existing) return res.status(404).json({ success: false, message: 'Cliente não encontrado.' });

        const { client_name, email, domain, app_name, type, plan, directory, start_command, port, notes, is_active } = req.body;

        // Se mudou o comando/diretório, para o processo antigo para evitar conflito
        const commandChanged = (start_command || '').trim() !== (existing.start_command || '') || (directory || '').trim() !== (existing.directory || '');
        if (commandChanged && existing.status === 'running') {
            killProcess(existing.pid);
        }

        prepare(`UPDATE hosting_clients SET
            client_name = ?, email = ?, domain = ?, app_name = ?, type = ?, plan = ?, directory = ?, start_command = ?, port = ?, notes = ?, is_active = ?, updated_at = datetime('now')
            WHERE id = ?`).run(
            (client_name || existing.client_name).trim(),
            (email || existing.email || '').trim(),
            (domain || existing.domain || '').trim(),
            (app_name || existing.app_name || '').trim(),
            type || existing.type,
            plan || existing.plan,
            (directory !== undefined ? directory : existing.directory || '').trim(),
            (start_command !== undefined ? start_command : existing.start_command || '').trim(),
            port !== undefined ? port : existing.port,
            (notes !== undefined ? notes : existing.notes || '').trim(),
            is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
            id
        );

        // Se o comando mudou, o processo foi derrubado
        if (commandChanged && existing.status === 'running') {
            prepare('UPDATE hosting_clients SET status = ?, pid = ? WHERE id = ?').run('stopped', null, id);
        }

        res.json({ success: true, message: 'Cliente atualizado.' });
    } catch (err) {
        console.error('Erro ao atualizar cliente de hospedagem:', err);
        res.status(500).json({ success: false, message: 'Erro ao atualizar cliente.' });
    }
});

// ============ EXCLUIR CLIENTE ============
router.delete('/clients/:id', checkAdmin, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const existing = prepare('SELECT * FROM hosting_clients WHERE id = ?').get(id);
        if (!existing) return res.status(404).json({ success: false, message: 'Cliente não encontrado.' });

        // Para o processo antes de excluir
        killProcess(existing.pid);

        prepare('DELETE FROM hosting_clients WHERE id = ?').run(id);
        res.json({ success: true, message: 'Cliente removido.' });
    } catch (err) {
        console.error('Erro ao excluir cliente de hospedagem:', err);
        res.status(500).json({ success: false, message: 'Erro ao excluir cliente.' });
    }
});

// ============ INICIAR PROCESSO ============
router.post('/clients/:id/start', checkAdmin, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const c = prepare('SELECT * FROM hosting_clients WHERE id = ?').get(id);
        if (!c) return res.status(404).json({ success: false, message: 'Cliente não encontrado.' });

        if (c.status === 'running') {
            return res.json({ success: true, message: 'Serviço já está rodando.', status: 'running', pid: c.pid });
        }

        let pid = null;

        if (c.start_command) {
            const child = spawn(c.start_command, {
                cwd: c.directory || undefined,
                shell: true,
                detached: true,
                stdio: 'ignore'
            });

            child.on('error', (err) => {
                console.error('Erro ao iniciar processo:', err.message);
            });

            child.unref();
            pid = child.pid;
        }

        prepare('UPDATE hosting_clients SET status = ?, pid = ?, updated_at = datetime(\'now\') WHERE id = ?').run('running', pid, id);
        res.json({ success: true, message: pid ? 'Serviço iniciado.' : 'Serviço marcado como ativo.', status: 'running', pid });
    } catch (err) {
        console.error('Erro ao iniciar cliente de hospedagem:', err);
        res.status(500).json({ success: false, message: 'Erro ao iniciar serviço.' });
    }
});

// ============ PARAR PROCESSO ============
router.post('/clients/:id/stop', checkAdmin, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const c = prepare('SELECT * FROM hosting_clients WHERE id = ?').get(id);
        if (!c) return res.status(404).json({ success: false, message: 'Cliente não encontrado.' });

        killProcess(c.pid);

        prepare('UPDATE hosting_clients SET status = ?, pid = ?, updated_at = datetime(\'now\') WHERE id = ?').run('stopped', null, id);
        res.json({ success: true, message: 'Serviço parado.', status: 'stopped' });
    } catch (err) {
        console.error('Erro ao parar cliente de hospedagem:', err);
        res.status(500).json({ success: false, message: 'Erro ao parar serviço.' });
    }
});

// ============ LIGAR / DESLIGAR (toggle) ============
router.post('/clients/:id/toggle', checkAdmin, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const c = prepare('SELECT * FROM hosting_clients WHERE id = ?').get(id);
        if (!c) return res.status(404).json({ success: false, message: 'Cliente não encontrado.' });

        if (c.status === 'running' && isPidAlive(c.pid)) {
            killProcess(c.pid);
            prepare('UPDATE hosting_clients SET status = ?, pid = ?, updated_at = datetime(\'now\') WHERE id = ?').run('stopped', null, id);
            return res.json({ success: true, message: 'Serviço parado.', status: 'stopped' });
        }

        // Caso contrário inicia
        let pid = null;
        if (c.start_command) {
            const child = spawn(c.start_command, {
                cwd: c.directory || undefined,
                shell: true,
                detached: true,
                stdio: 'ignore'
            });
            child.on('error', (err) => console.error('Erro ao iniciar processo:', err.message));
            child.unref();
            pid = child.pid;
        }

        prepare('UPDATE hosting_clients SET status = ?, pid = ?, updated_at = datetime(\'now\') WHERE id = ?').run('running', pid, id);
        res.json({ success: true, message: pid ? 'Serviço iniciado.' : 'Serviço marcado como ativo.', status: 'running', pid });
    } catch (err) {
        console.error('Erro no toggle de hospedagem:', err);
        res.status(500).json({ success: false, message: 'Erro ao alternar serviço.' });
    }
});

module.exports = router;
