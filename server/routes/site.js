/* ============================================
   SITE ROUTES - Conteúdo editável do site + Clientes (vitrine)
   - Público:  GET  /api/site/content?page=...
               GET  /api/site/clients
               GET  /api/site/pages
   - Admin:    PUT  /api/site/content
               DELETE /api/site/content?page=...
               POST /api/site/upload
               GET/POST/PUT/DELETE /api/site/admin/clients[/:id]
   ============================================ */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { prepare } = require('../database');
const { checkAdmin } = require('../middleware');

// ============ PÁGINAS EDITÁVEIS ============
// Páginas públicas que podem ser editadas pelo painel (rótulo -> arquivo)
const EDITABLE_PAGES = [
    { file: 'index.html', label: 'Início' },
    { file: 'servicos.html', label: 'Serviços' },
    { file: 'sites.html', label: 'Sites e Sistemas' },
    { file: 'loja-virtual.html', label: 'Loja Virtual' },
    { file: 'sistemas-web.html', label: 'Sistemas Web' },
    { file: 'hospedagens.html', label: 'Hospedagens' },
    { file: 'hospedagem-de-sites.html', label: 'Hospedagem de Sites' },
    { file: 'vps.html', label: 'Hospedagem VPS' },
    { file: 'automatizadores.html', label: 'Automatizadores' },
    { file: 'aplicativos.html', label: 'Aplicativos' },
    { file: 'instabot.html', label: 'InstaBot' },
    { file: 'auto-cut.html', label: 'Auto Cut' },
    { file: 'clientes.html', label: 'Clientes' },
    { file: 'sobre.html', label: 'Sobre' },
    { file: 'contato.html', label: 'Contato' },
    { file: 'termos.html', label: 'Termos' },
    { file: 'suporte.html', label: 'Suporte' }
];

// Normaliza a lista (garante que cada item tenha file + label, sem repetir)
function pagesList() {
    const seen = new Set();
    const out = [];
    for (const raw of EDITABLE_PAGES) {
        const file = raw.file || raw.page;
        if (!file || seen.has(file)) continue;
        seen.add(file);
        out.push({ file, label: raw.label || file });
    }
    return out;
}

// ============ PÚBLICO ============

// GET /api/site/pages -> lista de páginas editáveis
router.get('/pages', (req, res) => {
    res.json({ success: true, pages: pagesList() });
});

// GET /api/site/content?page=index.html -> { key: value, ... }
router.get('/content', (req, res) => {
    try {
        const page = String(req.query.page || '').trim();
        if (!page) return res.json({ success: true, content: {} });
        const rows = prepare('SELECT key, value FROM site_content WHERE page = ?').all(page);
        const content = {};
        rows.forEach(r => { content[r.key] = r.value; });
        res.json({ success: true, page, content });
    } catch (err) {
        console.error('Erro ao carregar conteúdo do site:', err);
        res.status(500).json({ success: false, message: 'Erro ao carregar conteúdo.' });
    }
});

// GET /api/site/clients -> clientes ativos (vitrine pública)
router.get('/clients', (req, res) => {
    try {
        const clients = prepare('SELECT id, name, description, url, type, logo FROM site_clients WHERE is_active = 1 ORDER BY sort ASC, id ASC').all();
        res.json({ success: true, clients });
    } catch (err) {
        console.error('Erro ao listar clientes do site:', err);
        res.status(500).json({ success: false, message: 'Erro ao listar clientes.' });
    }
});

// ============ ADMIN: CONTEÚDO ============

// PUT /api/site/content  body: { page, items: [{ key, value }] }
router.put('/content', checkAdmin, (req, res) => {
    try {
        const page = String((req.body && req.body.page) || '').trim();
        const items = (req.body && req.body.items) || [];
        if (!page) return res.status(400).json({ success: false, message: 'Página não informada.' });
        if (!Array.isArray(items)) return res.status(400).json({ success: false, message: 'Itens inválidos.' });

        let saved = 0;
        items.forEach(it => {
            if (!it || typeof it.key !== 'string' || !it.key) return;
            const value = it.value == null ? '' : String(it.value);
            prepare(`INSERT INTO site_content (page, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
                ON CONFLICT(page, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`)
                .run(page, it.key, value);
            saved++;
        });
        res.json({ success: true, message: `${saved} campo(s) salvos.`, saved });
    } catch (err) {
        console.error('Erro ao salvar conteúdo:', err);
        res.status(500).json({ success: false, message: 'Erro ao salvar conteúdo.' });
    }
});

// DELETE /api/site/content?page=index.html -> limpa todas as edições da página
router.delete('/content', checkAdmin, (req, res) => {
    try {
        const page = String(req.query.page || '').trim();
        if (!page) return res.status(400).json({ success: false, message: 'Página não informada.' });
        prepare('DELETE FROM site_content WHERE page = ?').run(page);
        res.json({ success: true, message: 'Edições da página removidas.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao limpar página.' });
    }
});

// GET /api/site/editor?page= -> resumo (quantos campos editados) para o painel
router.get('/editor', checkAdmin, (req, res) => {
    try {
        const counts = {};
        const rows = prepare('SELECT page, COUNT(*) AS n FROM site_content GROUP BY page').all();
        rows.forEach(r => { counts[r.page] = r.n; });
        res.json({ success: true, counts });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao carregar resumo.' });
    }
});

// ============ ADMIN: UPLOAD DE IMAGEM ============
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'images', 'uploads');
const ALLOWED_MIME = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/x-icon': 'ico',
    'image/vnd.microsoft.icon': 'ico'
};

// POST /api/site/upload  body: { filename, dataUrl }
router.post('/upload', checkAdmin, (req, res) => {
    try {
        const dataUrl = (req.body && req.body.dataUrl) || '';
        const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
        if (!m) return res.status(400).json({ success: false, message: 'Imagem inválida.' });

        const mime = m[1].toLowerCase();
        const ext = ALLOWED_MIME[mime];
        if (!ext) return res.status(400).json({ success: false, message: 'Formato não permitido (use PNG, JPG, WEBP, GIF, SVG ou ICO).' });

        const buffer = Buffer.from(m[2], 'base64');
        const MAX = 8 * 1024 * 1024; // 8MB
        if (buffer.length > MAX) return res.status(400).json({ success: false, message: 'Imagem muito grande (máx. 8MB).' });

        // Nome base vindo do arquivo original (sanitizado)
        let base = String((req.body && req.body.filename) || 'imagem').replace(/\.[^.]+$/, '');
        base = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40);
        if (!base) base = 'imagem';

        const unique = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
        const fileName = `${base}-${unique}.${ext}`;

        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        fs.writeFileSync(path.join(UPLOAD_DIR, fileName), buffer);

        res.json({ success: true, url: 'images/uploads/' + fileName });
    } catch (err) {
        console.error('Erro no upload:', err);
        res.status(500).json({ success: false, message: 'Erro ao enviar imagem.' });
    }
});

// ============ ADMIN: CLIENTES (VITRINE) ============

// GET /api/site/admin/clients -> todos (inclusive inativos)
router.get('/admin/clients', checkAdmin, (req, res) => {
    try {
        const clients = prepare('SELECT * FROM site_clients ORDER BY sort ASC, id ASC').all();
        res.json({ success: true, clients });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao listar clientes.' });
    }
});

function cleanClient(body) {
    return {
        name: String((body && body.name) || '').trim(),
        description: (body && body.description != null) ? String(body.description) : '',
        url: (body && body.url != null) ? String(body.url).trim() : '',
        type: (body && body.type != null) ? String(body.type).trim() : '',
        logo: (body && body.logo != null) ? String(body.logo).trim() : ''
    };
}

// POST /api/site/admin/clients
router.post('/admin/clients', checkAdmin, (req, res) => {
    try {
        const c = cleanClient(req.body);
        if (!c.name) return res.status(400).json({ success: false, message: 'O nome do cliente é obrigatório.' });
        const maxRow = prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM site_clients').get();
        const sort = (maxRow && maxRow.m ? maxRow.m : 0) + 1;
        const active = (req.body && req.body.is_active !== undefined) ? (req.body.is_active ? 1 : 0) : 1;
        const result = prepare('INSERT INTO site_clients (name, description, url, type, logo, sort, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(c.name, c.description, c.url, c.type, c.logo, sort, active);
        res.json({ success: true, message: 'Cliente adicionado.', id: result.lastInsertRowid });
    } catch (err) {
        console.error('Erro ao adicionar cliente:', err);
        res.status(500).json({ success: false, message: 'Erro ao adicionar cliente.' });
    }
});

// PUT /api/site/admin/clients/:id
router.put('/admin/clients/:id', checkAdmin, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const existing = prepare('SELECT * FROM site_clients WHERE id = ?').get(id);
        if (!existing) return res.status(404).json({ success: false, message: 'Cliente não encontrado.' });
        const c = cleanClient(req.body);
        if (!c.name) return res.status(400).json({ success: false, message: 'O nome do cliente é obrigatório.' });
        const active = (req.body && req.body.is_active !== undefined) ? (req.body.is_active ? 1 : 0) : existing.is_active;
        prepare('UPDATE site_clients SET name = ?, description = ?, url = ?, type = ?, logo = ?, is_active = ?, updated_at = datetime(\'now\') WHERE id = ?')
            .run(c.name, c.description, c.url, c.type, c.logo, active, id);

        // Remove a logo antiga se mudou e era de upload
        if (existing.logo && existing.logo !== c.logo) removeUpload(existing.logo);
        res.json({ success: true, message: 'Cliente atualizado.' });
    } catch (err) {
        console.error('Erro ao editar cliente:', err);
        res.status(500).json({ success: false, message: 'Erro ao editar cliente.' });
    }
});

// DELETE /api/site/admin/clients/:id
router.delete('/admin/clients/:id', checkAdmin, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const existing = prepare('SELECT * FROM site_clients WHERE id = ?').get(id);
        if (!existing) return res.status(404).json({ success: false, message: 'Cliente não encontrado.' });
        prepare('DELETE FROM site_clients WHERE id = ?').run(id);
        removeUpload(existing.logo);
        res.json({ success: true, message: 'Cliente removido.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao remover cliente.' });
    }
});

// POST /api/site/admin/clients/reorder  body: { order: [id, id, ...] }
router.post('/admin/clients/reorder', checkAdmin, (req, res) => {
    try {
        const order = (req.body && req.body.order) || [];
        if (!Array.isArray(order)) return res.status(400).json({ success: false, message: 'Ordem inválida.' });
        order.forEach((id, idx) => {
            prepare('UPDATE site_clients SET sort = ? WHERE id = ?').run(idx + 1, parseInt(id));
        });
        res.json({ success: true, message: 'Ordem atualizada.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao reordenar.' });
    }
});

// Remove um arquivo de upload (apenas dentro de images/uploads)
function removeUpload(relPath) {
    try {
        if (!relPath || relPath.indexOf('images/uploads/') !== 0) return;
        const fileName = path.basename(relPath);
        const full = path.join(UPLOAD_DIR, fileName);
        if (fs.existsSync(full)) fs.unlinkSync(full);
    } catch (e) { /* ignore */ }
}

module.exports = router;
