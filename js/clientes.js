/* ============================================
   SITE CLIENTS - Vitrine de clientes (clientes.html)
   Agora os clientes são gerenciados pelo PAINEL ADMIN
   (aba "Site" > Clientes): você sobe a logo, edita o texto,
   o link e a ordem — sem mexer em código.

   Este script busca os clientes em /api/site/clients.
   Se a API não responder, usa a lista local de reserva abaixo.
   ============================================ */

// Reserva (usada apenas se a API falhar). Pode deixar vazio.
const VISION_CLIENTES = [];

document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('clients-grid');
    if (!grid) return;

    const iniciais = (nome) => {
        const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
        if (partes.length === 0) return '?';
        if (partes.length === 1) return partes[0].slice(0, 2);
        return (partes[0][0] + partes[1][0]);
    };

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    function render(lista) {
        if (!Array.isArray(lista) || lista.length === 0) {
            grid.innerHTML = '<p class="clients-empty">Em breve, os clientes que confiam na Vísion Hub Web.</p>';
            return;
        }

        grid.innerHTML = lista.map((c) => {
            const nome = String(c.name != null ? c.name : (c.nome || '')).trim();
            const tipo = (c.type || c.tipo) ? `<span class="client-type">${esc(c.type || c.tipo)}</span>` : '';
            const desc = (c.description || '').trim() ? `<span class="client-desc">${esc(c.description)}</span>` : '';
            const logo = c.logo
                ? `<img class="client-logo" src="${esc(c.logo)}" alt="Logo de ${esc(nome)}" loading="lazy">`
                : `<span class="client-avatar">${esc(iniciais(nome))}</span>`;
            const interno = `${logo}<span class="client-name">${esc(nome)}</span>${tipo}${desc}`;
            if (c.url) {
                return `<a class="client-card" href="${esc(c.url)}" target="_blank" rel="noopener">${interno}</a>`;
            }
            return `<div class="client-card">${interno}</div>`;
        }).join('');
    }

    // Mostra a lista de reserva enquanto carrega (evita "piscar" vazio)
    render(VISION_CLIENTES);

    fetch('/api/site/clients', { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
            if (data && data.success) render(data.clients || []);
        })
        .catch(() => { /* mantém a lista de reserva */ });
});
