/* ============================================
   HOSPEDAGEM PAINEL - JavaScript
   Gerenciamento de clientes, sites, VPS e apps
   ============================================ */

const API_URL = window.location.origin + '/api';

function getAdminToken() {
    return sessionStorage.getItem('admin_token');
}

function getAuthHeaders(extras = {}) {
    return {
        'Authorization': 'Bearer ' + getAdminToken(),
        ...extras
    };
}

document.addEventListener('DOMContentLoaded', () => {

    // Auth Check (mesmo token do painel admin)
    if (!getAdminToken()) {
        window.location.href = 'admin.html';
        return;
    }

    // Saudação do usuário logado (vindo do hub)
    try {
        const user = JSON.parse(localStorage.getItem('vp_user'));
        const greeting = document.getElementById('user-greeting');
        if (user && greeting) greeting.textContent = `Olá, ${user.name}`;
    } catch (e) { /* sem vp_user */ }

    // Logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            localStorage.removeItem('vp_token');
            localStorage.removeItem('vp_user');
            sessionStorage.removeItem('admin_token');
            window.location.href = 'login.html';
        });
    }

    // ============ NOVO CLIENTE / EDIÇÃO MODAL ============
    const clientModal = document.getElementById('client-modal');
    const btnNewClient = document.getElementById('btn-new-client');
    const btnModalClose = document.getElementById('btn-modal-close');
    const btnModalCancel = document.getElementById('btn-modal-cancel');

    if (btnNewClient) btnNewClient.addEventListener('click', () => openClientModal());
    if (btnModalClose) btnModalClose.addEventListener('click', () => closeClientModal());
    if (btnModalCancel) btnModalCancel.addEventListener('click', () => closeClientModal());

    document.getElementById('client-modal').addEventListener('click', (e) => {
        if (e.target === clientModal) closeClientModal();
    });

    // Submit do formulário (novo ou edição)
    document.getElementById('client-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('client-id').value;
        const data = {
            client_name: document.getElementById('client_name').value.trim(),
            email: document.getElementById('client_email').value.trim(),
            domain: document.getElementById('client_domain').value.trim(),
            app_name: document.getElementById('client_app_name').value.trim(),
            type: document.getElementById('client_type').value,
            plan: document.getElementById('client_plan').value,
            directory: document.getElementById('client_directory').value.trim(),
            start_command: document.getElementById('client_start_command').value.trim(),
            port: document.getElementById('client_port').value || null,
            notes: document.getElementById('client_notes').value.trim()
        };

        const msg = document.getElementById('client-form-msg');
        msg.style.display = 'none';

        try {
            const url = id ? `${API_URL}/hosting/clients/${id}` : `${API_URL}/hosting/clients`;
            const method = id ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(data)
            });
            const result = await res.json();

            if (result.success) {
                closeClientModal();
                loadClients();
                msg.style.display = 'none';
            } else {
                showFormMsg('❌ ' + result.message, false);
            }
        } catch (err) {
            showFormMsg('❌ Erro de conexão com o servidor.', false);
        }
    });

    // ============ BUSCA ============
    const searchInput = document.getElementById('search-clients');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            document.querySelectorAll('#hosting-tbody tr[data-search]').forEach(row => {
                row.style.display = row.getAttribute('data-search').includes(q) ? '' : 'none';
            });
        });
    }

    // ============ CARREGAR DADOS ============
    loadClients();
    setInterval(loadClients, 30000);
});

// ============ ABRIR/FECHAR MODAL ============
function openClientModal(client) {
    const title = document.getElementById('modal-title');
    title.textContent = client ? 'Editar Cliente' : 'Novo Cliente';

    document.getElementById('client-id').value = client ? client.id : '';
    document.getElementById('client_name').value = client ? client.client_name : '';
    document.getElementById('client_email').value = client ? (client.email || '') : '';
    document.getElementById('client_domain').value = client ? (client.domain || '') : '';
    document.getElementById('client_app_name').value = client ? (client.app_name || '') : '';
    document.getElementById('client_type').value = client ? (client.type || 'site') : 'site';
    document.getElementById('client_plan').value = client ? (client.plan || 'basico') : 'basico';
    document.getElementById('client_directory').value = client ? (client.directory || '') : '';
    document.getElementById('client_start_command').value = client ? (client.start_command || '') : '';
    document.getElementById('client_port').value = client ? (client.port || '') : '';
    document.getElementById('client_notes').value = client ? (client.notes || '') : '';

    const msg = document.getElementById('client-form-msg');
    msg.style.display = 'none';
    msg.textContent = '';
    msg.className = 'form-msg';

    document.getElementById('client-modal').style.display = 'flex';
}

function closeClientModal() {
    document.getElementById('client-modal').style.display = 'none';
}

function showFormMsg(text, isSuccess) {
    const msg = document.getElementById('client-form-msg');
    msg.textContent = text;
    msg.className = 'form-msg ' + (isSuccess ? 'success' : 'error');
    msg.style.display = 'block';
}

// ============ CARREGAR CLIENTES ============
async function loadClients() {
    try {
        const res = await fetch(`${API_URL}/hosting/clients`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (!data.success) {
            if (res.status === 401 || res.status === 403) {
                window.location.href = 'admin.html';
            }
            return;
        }

        window._hostingClients = data.clients;
        renderStats(data.clients);
        renderClients(data.clients);
    } catch (err) {
        console.error('Erro ao carregar clientes de hospedagem:', err);
    }
}

function renderStats(clients) {
    const running = clients.filter(c => c.status === 'running').length;
    const stopped = clients.filter(c => c.status === 'stopped').length;
    const sites = clients.filter(c => c.type === 'site').length;
    const vps = clients.filter(c => c.type === 'vps').length;
    const apps = clients.filter(c => c.type === 'app').length;

    document.getElementById('stat-total').textContent = clients.length;
    document.getElementById('stat-running').textContent = running;
    document.getElementById('stat-stopped').textContent = stopped;
    document.getElementById('stat-sites').textContent = sites;
    document.getElementById('stat-vps').textContent = vps;
    document.getElementById('stat-apps').textContent = apps;
}

function renderClients(clients) {
    const tbody = document.getElementById('hosting-tbody');
    if (!clients.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <div class="empty-icon">🗂️</div>
                        <p>Nenhum cliente cadastrado ainda. Clique em "+ Novo Cliente" para começar.</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = clients.map(c => {
        const typeBadge = `<span class="type-badge ${c.type}">${labelType(c.type)}</span>`;
        const planLabel = labelPlan(c.plan);
        const target = c.domain || c.app_name || '-';
        const details = c.email ? c.email : (c.app_name ? 'App: ' + c.app_name : '');

        const statusHTML = `
            <div style="display:flex; align-items:center;">
                <label class="toggle-switch">
                    <input type="checkbox" ${c.status === 'running' ? 'checked' : ''} onchange="toggleService(${c.id})">
                    <span class="toggle-slider"></span>
                </label>
                <span class="status-text ${c.status}">${c.status === 'running' ? 'Rodando' : 'Parado'}</span>
            </div>`;

        const actionsHTML = `
            <div class="table-actions">
                <button class="btn-ghost" onclick='openClientModal(${JSON.stringify(c).replace(/'/g, "&#39;")})'>✏️ Editar</button>
                <button class="btn-danger-ghost" onclick="deleteClient(${c.id}, '${String(c.client_name).replace(/'/g, '').replace(/"/g, '')}')">🗑️</button>
            </div>`;

        return `<tr data-search="${(c.client_name + ' ' + (c.domain || '') + ' ' + (c.app_name || '')).toLowerCase()}">
            <td>
                <div class="client-name">${c.client_name}</div>
                <div class="client-sub">${details}</div>
            </td>
            <td>${target}</td>
            <td>${typeBadge}</td>
            <td>${planLabel}</td>
            <td>${statusHTML}</td>
            <td>${actionsHTML}</td>
        </tr>`;
    }).join('');
}

// ============ TOGGLE LIGA/DESLIGA ============
async function toggleService(id) {
    try {
        const res = await fetch(`${API_URL}/hosting/clients/${id}/toggle`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const result = await res.json();
        if (!result.success) alert('❌ ' + result.message);
        loadClients();
    } catch (err) {
        alert('❌ Erro de conexão com o servidor.');
        loadClients();
    }
}

// ============ EXCLUIR CLIENTE ============
async function deleteClient(id, name) {
    if (!confirm(`Tem certeza que deseja excluir o cliente "${name}"? O serviço será parado.`)) return;
    try {
        const res = await fetch(`${API_URL}/hosting/clients/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const result = await res.json();
        if (result.success) {
            loadClients();
        } else {
            alert('❌ ' + result.message);
        }
    } catch (err) {
        alert('❌ Erro de conexão com o servidor.');
    }
}

// ============ LABELS ============
function labelType(t) {
    const labels = { site: 'Site', vps: 'VPS', app: 'App' };
    return labels[t] || t;
}

function labelPlan(p) {
    const labels = { basico: 'Básico', pro: 'Pro', premium: 'Premium', custom: 'Customizado' };
    return labels[p] || p;
}