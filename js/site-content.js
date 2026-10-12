/* ============================================
   SITE CONTENT - Aplica o conteúdo editado no site público
   Lê /api/site/content?page=<página> e substitui os elementos
   correspondentes (textos, imagens e links).
   Chaves:
     <caminho>            -> conteúdo HTML do elemento
     <caminho>::src       -> atributo src (imagem)
     <caminho>::href      -> atributo href (link)
   ============================================ */
(function () {
    'use strict';

    function currentPage() {
        const last = window.location.pathname.split('/').pop();
        return last && last.length ? last : 'index.html';
    }

    function seg(node) {
        const tag = node.tagName.toLowerCase();
        let i = 1, sib = node;
        while ((sib = sib.previousElementSibling)) {
            if (sib.tagName === node.tagName) i++;
        }
        return tag + '[' + i + ']';
    }

    // Caminho do elemento: usa o ancestral mais próximo com id como raiz
    // (mais estável que o caminho completo a partir do body).
    function buildKey(el) {
        let anchor = null, p = el.parentElement;
        while (p && p !== document.body) {
            if (p.id) { anchor = p; break; }
            p = p.parentElement;
        }
        const parts = [];
        let node = el;
        const stop = anchor || document.body;
        while (node && node !== stop) {
            parts.unshift(seg(node));
            node = node.parentElement;
        }
        const rel = parts.join('>');
        return anchor ? ('#' + anchor.id + '>' + rel) : rel;
    }

    function findByKey(key) {
        let k = key;
        let root = document.body;
        if (k.charAt(0) === '#') {
            const idx = k.indexOf('>');
            const id = k.slice(1, idx === -1 ? undefined : idx);
            const found = document.getElementById(id);
            if (!found) return null;
            root = found;
            k = idx === -1 ? '' : k.slice(idx + 1);
            if (!k) return root;
        }
        const parts = k.split('>');
        let node = root;
        for (let i = 0; i < parts.length; i++) {
            const m = /^([a-z0-9]+)\[(\d+)\]$/i.exec(parts[i]);
            if (!m) return null;
            const tag = m[1].toUpperCase();
            const n = parseInt(m[2], 10);
            let count = 0, found = null;
            for (const child of node.children) {
                if (child.tagName === tag) {
                    count++;
                    if (count === n) { found = child; break; }
                }
            }
            if (!found) return null;
            node = found;
        }
        return node;
    }

    function applyContent(map) {
        if (!map) return;
        Object.keys(map).forEach(function (key) {
            const value = map[key];
            if (value == null) return;
            if (key.slice(-5) === '::src') {
                const el = findByKey(key.slice(0, -5));
                if (el && el.tagName === 'IMG') el.setAttribute('src', value);
            } else if (key.slice(-6) === '::href') {
                const el = findByKey(key.slice(0, -6));
                if (el && el.tagName === 'A') el.setAttribute('href', value);
            } else {
                const el = findByKey(key);
                if (el) el.innerHTML = value;
            }
        });
    }

    window.__siteContentReady = (function () {
        const page = currentPage();
        return fetch('/api/site/content?page=' + encodeURIComponent(page), { cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data && data.success) applyContent(data.content);
                document.dispatchEvent(new CustomEvent('site-content:applied'));
            })
            .catch(function (e) { /* sem conteúdo: mantém o original */ });
    })();

    // Expõe utilitários para o editor
    window.__siteContentUtils = { currentPage: currentPage, buildKey: buildKey, findByKey: findByKey };
})();
