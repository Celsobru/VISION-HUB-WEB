/* ============================================
   SITE EDIT - Edição direto na página
   Ativa somente quando a URL tem ?edit=1&key=<token-admin>.
   Permite clicar em textos, links e imagens, editar e salvar
   em /api/site/content.
   ============================================ */
(function () {
    'use strict';

    const params = new URLSearchParams(window.location.search);
    if (params.get('edit') !== '1') return;

    const TOKEN = params.get('key') || '';
    const utils = window.__siteContentUtils || null;
    const PAGE = (utils && utils.currentPage()) || (window.location.pathname.split('/').pop() || 'index.html');

    // ---------- CSS do modo edição ----------
    const styleTag = document.createElement('style');
    styleTag.textContent = `
.site-edit-on body { padding-bottom: 74px !important; }
.site-edit-on h1,.site-edit-on h2,.site-edit-on h3,.site-edit-on h4,.site-edit-on h5,.site-edit-on h6,
.site-edit-on p,.site-edit-on li,.site-edit-on blockquote,.site-edit-on figcaption,.site-edit-on td,.site-edit-on th,
.site-edit-on dd,.site-edit-on dt,.site-edit-on caption,.site-edit-on legend,.site-edit-on label,
.site-edit-on button,.site-edit-on a,.site-edit-on span,.site-edit-on strong,.site-edit-on em,.site-edit-on small,
.site-edit-on img { cursor: pointer !important; }
.site-edit-active { outline: 2px dashed #00d4ff !important; outline-offset: 3px !important; background: rgba(0,212,255,.08) !important; cursor: text !important; border-radius: 3px; }
.site-edit-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 10px 16px; background: #0e1728; color: #fff; font-family: Inter, system-ui, -apple-system, Segoe UI, sans-serif; font-size: 14px; box-shadow: 0 -8px 30px rgba(0,0,0,.5); border-top: 2px solid #00d4ff; }
.site-edit-title { display: flex; align-items: center; gap: 8px; }
.site-edit-dot { width: 10px; height: 10px; border-radius: 50%; background: #00d4ff; box-shadow: 0 0 8px #00d4ff; }
.site-edit-count { color: #ffd166; font-size: 12px; font-weight: 700; }
.site-edit-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.site-edit-tools input { padding: 7px 9px; border-radius: 6px; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.08); color: #fff; min-width: 240px; font-size: 13px; }
.site-edit-tools label { font-size: 12px; opacity: .85; }
.se-btn { padding: 9px 14px; border-radius: 8px; border: none; cursor: pointer; font-weight: 700; font-size: 13px; background: rgba(255,255,255,.14); color: #fff; font-family: inherit; }
.se-btn:hover { background: rgba(255,255,255,.26); }
.se-btn.site-edit-save { background: linear-gradient(135deg,#00d4ff,#7c3aed); }
.se-btn[disabled] { opacity: .6; cursor: default; }
.site-edit-toast { position: fixed; left: 50%; transform: translateX(-50%); bottom: 82px; background: #111a2e; color: #fff; padding: 10px 18px; border-radius: 10px; font-size: 14px; font-family: Inter, system-ui, sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,.45); display: none; z-index: 2147483646; }
`;
    document.head.appendChild(styleTag);

    // ---------- Elementos ----------
    const PHRASING = new Set(['A', 'SPAN', 'STRONG', 'EM', 'B', 'I', 'U', 'SMALL', 'BR', 'SUP', 'SUB', 'ABBR', 'CODE', 'MARK', 'TIME', 'S', 'Q', 'CITE', 'WBR', 'BDI', 'BDO', 'DFN', 'KBD', 'SAMP', 'VAR', 'IMG']);
    const TEXT_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'LI', 'BLOCKQUOTE', 'FIGCAPTION', 'TD', 'TH', 'DD', 'DT', 'CAPTION', 'LEGEND', 'LABEL', 'BUTTON', 'A', 'SPAN', 'STRONG', 'EM', 'B', 'I', 'U', 'SMALL']);

    const changes = new Map(); // key -> { key, value }
    let active = null;

    function inNoEdit(el) { return !!(el.closest && el.closest('[data-no-edit]')); }

    function isEditableText(el) {
        if (!el || el.nodeType !== 1) return false;
        if (!TEXT_TAGS.has(el.tagName)) return false;
        if (inNoEdit(el)) return false;
        for (const c of el.children) { if (!PHRASING.has(c.tagName)) return false; }
        if (!(el.textContent || '').trim()) return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        return true;
    }
    function isEditableImage(el) {
        return !!(el && el.tagName === 'IMG' && !inNoEdit(el));
    }

    function sanitize(html) {
        const d = document.createElement('div');
        d.innerHTML = html;
        d.querySelectorAll('script,style,iframe,object,embed,link,meta,noscript').forEach(n => n.remove());
        d.querySelectorAll('*').forEach(n => {
            Array.prototype.slice.call(n.attributes).forEach(a => {
                const name = a.name.toLowerCase();
                if (/^on/.test(name) || name === 'contenteditable' || name === 'spellcheck' || name === 'data-site-edit-ui') n.removeAttribute(a.name);
                else if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
            });
        });
        return d.innerHTML;
    }

    // ---------- Barra superior ----------
    const uiBar = document.createElement('div');
    uiBar.setAttribute('data-site-edit-ui', '');
    uiBar.className = 'site-edit-bar';
    uiBar.innerHTML = `
        <div class="site-edit-title">
            <span class="site-edit-dot"></span>
            Modo edição — <strong>${PAGE}</strong>
            <span class="site-edit-count" id="se-count"></span>
        </div>
        <div class="site-edit-tools">
            <span class="site-edit-linkwrap" style="display:none; align-items:center; gap:6px;">
                <label for="se-link">Link:</label>
                <input type="text" id="se-link" placeholder="https://...">
            </span>
            <button type="button" class="se-btn" id="se-discard">↺ Descartar</button>
            <button type="button" class="se-btn" id="se-exit">✖ Sair</button>
            <button type="button" class="se-btn site-edit-save" id="se-save">💾 Salvar</button>
        </div>
        <div class="site-edit-toast"></div>`;

    function updateCount() {
        const el = document.getElementById('se-count');
        if (el) el.textContent = changes.size ? '• ' + changes.size + ' alteração(ões)' : '';
    }
    function toast(msg, isError) {
        const t = uiBar.querySelector('.site-edit-toast');
        if (!t) return;
        t.textContent = msg;
        t.style.display = 'block';
        t.style.border = isError ? '1px solid #ff7675' : '1px solid #00d4ff';
        clearTimeout(t._timer);
        t._timer = setTimeout(function () { t.style.display = 'none'; }, 2800);
    }
    function hideLinkRow() {
        const row = uiBar.querySelector('.site-edit-linkwrap');
        if (row) row.style.display = 'none';
    }

    // ---------- Editar texto ----------
    function startEdit(el) {
        if (active === el) { el.focus(); return; }
        if (active) finalize(active);
        active = el;
        el.setAttribute('contenteditable', 'true');
        el.classList.add('site-edit-active');
        el.focus();
        const row = uiBar.querySelector('.site-edit-linkwrap');
        const linkInput = document.getElementById('se-link');
        if (el.tagName === 'A') {
            if (row) row.style.display = 'inline-flex';
            if (linkInput) linkInput.value = el.getAttribute('href') || '';
        } else {
            hideLinkRow();
        }
        try {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        } catch (e) { /* ignore */ }
    }

    function finalize(el) {
        if (!el) return;
        el.removeAttribute('contenteditable');
        el.classList.remove('site-edit-active');
        if (!utils) return;
        const key = utils.buildKey(el);
        const value = sanitize(el.innerHTML);
        changes.set(key, { key: key, value: value });
        updateCount();
    }

    // ---------- Editar link (href) ----------
    function onLinkInput() {
        const input = document.getElementById('se-link');
        if (!input || !active || active.tagName !== 'A' || !utils) return;
        const href = input.value.trim();
        active.setAttribute('href', href);
        const key = utils.buildKey(active) + '::href';
        changes.set(key, { key: key, value: href });
        updateCount();
    }

    // ---------- Editar imagem ----------
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    let pendingImg = null;
    fileInput.addEventListener('change', function () {
        const file = fileInput.files && fileInput.files[0];
        if (!file || !pendingImg) return;
        const img = pendingImg;
        pendingImg = null;
        const reader = new FileReader();
        reader.onload = function () {
            img.style.opacity = '0.4';
            toast('Enviando imagem...');
            fetch('/api/site/upload', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: file.name, dataUrl: reader.result })
            })
                .then(r => r.json())
                .then(data => {
                    img.style.opacity = '1';
                    if (!data || !data.success) { toast('Falha no envio: ' + ((data && data.message) || 'erro'), true); return; }
                    const key = utils.buildKey(img) + '::src';
                    img.setAttribute('src', data.url);
                    changes.set(key, { key: key, value: data.url });
                    updateCount();
                    toast('Imagem atualizada.');
                })
                .catch(function () { img.style.opacity = '1'; toast('Erro ao enviar imagem.', true); });
        };
        reader.readAsDataURL(file);
        fileInput.value = '';
    });

    // ---------- Salvar ----------
    function save() {
        if (active) { finalize(active); active = null; hideLinkRow(); }
        if (!TOKEN) { toast('Sem permissão (faça login no painel).', true); return; }
        if (!changes.size) { toast('Nada para salvar.'); return; }
        const items = Array.from(changes.values());
        const btn = document.getElementById('se-save');
        btn.disabled = true; btn.textContent = 'Salvando...';
        fetch('/api/site/content', {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: PAGE, items: items.map(i => ({ key: i.key, value: i.value })) })
        })
            .then(r => r.json())
            .then(function (data) {
                btn.disabled = false; btn.textContent = '💾 Salvar';
                if (data && data.success) {
                    changes.clear(); updateCount();
                    toast('✅ Salvo com sucesso!');
                } else {
                    toast('Erro: ' + ((data && data.message) || 'não foi possível salvar'), true);
                }
            })
            .catch(function () { btn.disabled = false; btn.textContent = '💾 Salvar'; toast('Erro de conexão ao salvar.', true); });
    }

    // ---------- Cliques ----------
    document.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('[data-site-edit-ui]')) return;

        if (e.target.tagName === 'IMG' && isEditableImage(e.target)) {
            e.preventDefault(); e.stopPropagation();
            pendingImg = e.target;
            fileInput.click();
            return;
        }

        let el = e.target, target = null;
        while (el && el !== document.body) {
            if (el.getAttribute && el.getAttribute('contenteditable') === 'true') { target = el; break; }
            if (isEditableText(el)) { target = el; break; }
            el = el.parentElement;
        }
        if (target) {
            e.preventDefault(); e.stopPropagation();
            startEdit(target);
        } else {
            const a = e.target.closest && e.target.closest('a');
            if (a) e.preventDefault();
        }
    }, true);

    document.addEventListener('focusout', function (e) {
        if (active && e.target === active) {
            setTimeout(function () {
                if (active && document.activeElement !== active && !uiBar.contains(document.activeElement)) {
                    finalize(active); active = null; hideLinkRow();
                }
            }, 0);
        }
    });

    // ---------- Montagem ----------
    function mount() {
        document.body.appendChild(uiBar);
        document.documentElement.classList.add('site-edit-on');
        document.getElementById('se-save').addEventListener('click', save);
        document.getElementById('se-discard').addEventListener('click', function () {
            if (!changes.size || confirm('Descartar as alterações não salvas?')) window.location.reload();
        });
        document.getElementById('se-exit').addEventListener('click', function () {
            if (!changes.size || confirm('Sair sem salvar as alterações?')) window.location.href = 'admin.html';
        });
        document.getElementById('se-link').addEventListener('input', onLinkInput);
        if (!TOKEN) toast('Abra esta página pelo painel (sem token de edição).', true);
    }

    (window.__siteContentReady || Promise.resolve()).then(mount);
})();
