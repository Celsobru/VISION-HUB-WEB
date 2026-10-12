/* ============================================
   ADMIN DASHBOARD - JavaScript
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
    
    // Auth Check
    if (!getAdminToken()) {
        document.getElementById('login-view').style.display = 'block';
    } else {
        document.getElementById('dashboard-view').style.display = 'block';
        document.getElementById('header-actions').style.display = 'flex';
        loadStats();
        loadClients();
        loadAdmins();
        loadTickets();
        loadTutorials();
        loadProducts();
        initProductsForm();
        initBackup();
        initTutorials();
        initSite();
    }

    // ============ LOGIN LOGIC ============
    document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('admin-email').value.trim();
        const password = document.getElementById('admin-password').value;
        const btn = document.getElementById('btn-admin-login');
        const msg = document.getElementById('admin-login-msg');

        btn.disabled = true;
        btn.textContent = 'Autenticando...';
        msg.style.display = 'none';

        try {
            const res = await fetch(`${API_URL}/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();

            if (data.success) {
                sessionStorage.setItem('admin_token', data.token);
                window.location.reload();
            } else {
                msg.style.display = 'block';
                msg.style.color = '#ff7675';
                msg.textContent = '❌ ' + data.message;
            }
        } catch(err) {
            msg.style.display = 'block';
            msg.style.color = '#ff7675';
            msg.textContent = '❌ Erro de conexão com o servidor.';
        }
        btn.disabled = false;
        btn.textContent = 'Entrar no Painel';
    });

    // ============ SETTINGS MODAL ============
    const settingsModal = document.getElementById('settings-modal');
    document.getElementById('btn-settings').addEventListener('click', () => {
        settingsModal.style.display = 'flex';
        document.getElementById('settings-msg').style.display = 'none';
        document.getElementById('settings-email').value = '';
        document.getElementById('settings-new-password').value = '';
        document.getElementById('settings-current-password').value = '';
    });

    document.getElementById('settings-modal-close').addEventListener('click', () => settingsModal.style.display = 'none');
    document.getElementById('settings-modal-cancel').addEventListener('click', () => settingsModal.style.display = 'none');

    document.getElementById('settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('settings-email').value.trim();
        const new_password = document.getElementById('settings-new-password').value;
        const current_password = document.getElementById('settings-current-password').value;
        const msg = document.getElementById('settings-msg');

        try {
            const res = await fetch(`${API_URL}/admin/settings`, {
                method: 'PUT',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ email, new_password, current_password })
            });
            const data = await res.json();

            if (data.success) {
                msg.style.display = 'block';
                msg.style.color = '#55efc4';
                msg.textContent = '✅ ' + data.message;
                setTimeout(() => settingsModal.style.display = 'none', 2000);
            } else {
                msg.style.display = 'block';
                msg.style.color = '#ff7675';
                msg.textContent = '❌ ' + data.message;
            }
        } catch(err) {
            msg.style.display = 'block';
            msg.style.color = '#ff7675';
            msg.textContent = '❌ Erro de conexão.';
        }
    });

    // Tabs
    const sectionTitles = {
        clients: 'Clientes',
        products: 'Produtos/Valores',
        admins: 'Administradores',
        tutorials: 'Tutoriais',
        tickets: 'Suporte',
        backup: 'Backup',
        site: 'Site'
    };
    document.querySelectorAll('.sidebar-link[data-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            document.querySelectorAll('.sidebar-link[data-tab]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
            document.getElementById('tab-' + tabName).style.display = 'block';
            const title = document.getElementById('admin-section-title');
            if (title) title.textContent = sectionTitles[tabName] || tabName;
            const sidebar = document.getElementById('admin-sidebar');
            if (sidebar && window.innerWidth <= 900) sidebar.classList.remove('open');
        });
    });

    // Toggle sidebar mobile
    document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
        document.getElementById('admin-sidebar').classList.toggle('open');
    });

    // Search
    document.getElementById('search-clients').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('#clients-tbody tr').forEach(row => {
            row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });

    // Modal close
    document.getElementById('modal-close').addEventListener('click', closeEditModal);
    document.getElementById('modal-cancel').addEventListener('click', closeEditModal);
    document.getElementById('ticket-modal-close').addEventListener('click', () => document.getElementById('ticket-modal').style.display = 'none');
    document.getElementById('ticket-modal-cancel').addEventListener('click', () => document.getElementById('ticket-modal').style.display = 'none');

    // Add Instagram button
    document.getElementById('btn-add-ig').addEventListener('click', () => {
        const userId = parseInt(document.getElementById('edit-id').value);
        if (userId) addInstagram(userId);
    });

    // Salvar direitos (extensões) do cliente em edição
    const btnSaveRights = document.getElementById('btn-save-rights');
    if (btnSaveRights) btnSaveRights.addEventListener('click', saveClientEntitlements);

    // Edit form submit
    document.getElementById('edit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-id').value;
        const data = {
            name: document.getElementById('edit-name').value,
            email: document.getElementById('edit-email').value,
            instagram: document.getElementById('edit-instagram').value,
            plan: document.getElementById('edit-plan').value,
            expiry: document.getElementById('edit-expiry').value,
            bonus: parseInt(document.getElementById('edit-bonus').value) || 0,
            is_active: parseInt(document.getElementById('edit-status').value)
        };

        try {
            const res = await fetch(`${API_URL}/admin/users/${id}?key=${getAdminToken()}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.success) {
                closeEditModal();
                loadClients();
                loadStats();
            } else {
                alert('Erro: ' + result.message);
            }
        } catch (err) {
            alert('Erro ao salvar.');
        }
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', () => {
        sessionStorage.removeItem('admin_token');
        window.location.reload();
    });

    // ============ ADD USER ============
    document.getElementById('btn-show-add-user').addEventListener('click', () => {
        document.getElementById('add-user-form').reset();
        document.getElementById('add-user-modal').style.display = 'flex';
    });
    document.getElementById('add-user-modal-close').addEventListener('click', () => document.getElementById('add-user-modal').style.display = 'none');
    document.getElementById('add-user-modal-cancel').addEventListener('click', () => document.getElementById('add-user-modal').style.display = 'none');

    document.getElementById('add-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            name: document.getElementById('add-user-name').value,
            email: document.getElementById('add-user-email').value,
            password: document.getElementById('add-user-password').value,
            instagram: document.getElementById('add-user-instagram').value,
            plan: document.getElementById('add-user-plan').value,
            bonus: parseInt(document.getElementById('add-user-bonus').value) || 0
        };

        try {
            const res = await fetch(`${API_URL}/admin/users?key=${getAdminToken()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.success) {
                document.getElementById('add-user-modal').style.display = 'none';
                loadClients();
                loadStats();
                alert('Cliente adicionado com sucesso!');
            } else {
                alert('Erro: ' + result.message);
            }
        } catch (err) { alert('Erro ao criar cliente.'); }
    });

    // ============ ADD ADMIN ============
    document.getElementById('btn-show-add-admin').addEventListener('click', () => {
        document.getElementById('add-admin-form').reset();
        document.getElementById('add-admin-modal').style.display = 'flex';
    });
    document.getElementById('add-admin-modal-close').addEventListener('click', () => document.getElementById('add-admin-modal').style.display = 'none');
    document.getElementById('add-admin-modal-cancel').addEventListener('click', () => document.getElementById('add-admin-modal').style.display = 'none');

    document.getElementById('add-admin-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            name: document.getElementById('add-admin-name').value,
            email: document.getElementById('add-admin-email').value,
            password: document.getElementById('add-admin-password').value
        };

        try {
            const res = await fetch(`${API_URL}/admin/admins?key=${getAdminToken()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.success) {
                document.getElementById('add-admin-modal').style.display = 'none';
                loadAdmins();
                alert('Admin adicionado com sucesso!');
            } else {
                alert('Erro: ' + result.message);
            }
        } catch (err) { alert('Erro ao criar admin.'); }
    });

    // ============ RESET PASSWORD MODAL ============
    document.getElementById('reset-password-modal-close').addEventListener('click', () => document.getElementById('reset-password-modal').style.display = 'none');
    document.getElementById('reset-password-modal-cancel').addEventListener('click', () => document.getElementById('reset-password-modal').style.display = 'none');

    document.getElementById('btn-reset-user-password').addEventListener('click', () => {
        const userId = document.getElementById('edit-id').value;
        openResetPasswordModal(userId, 'user');
    });

    document.getElementById('reset-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('reset-target-id').value;
        const type = document.getElementById('reset-target-type').value;
        const password = document.getElementById('reset-new-password').value;

        try {
            const endpoint = type === 'admin' ? `/admin/admins/${id}/password` : `/admin/users/${id}/password`;
            const res = await fetch(`${API_URL}${endpoint}?key=${getAdminToken()}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const result = await res.json();
            if (result.success) {
                document.getElementById('reset-password-modal').style.display = 'none';
                alert('Senha redefinida com sucesso!');
            } else {
                alert('Erro: ' + result.message);
            }
        } catch (err) { alert('Erro ao redefinir senha.'); }
    });
});

async function loadStats() {
    try {
        const res = await fetch(`${API_URL}/admin/stats?key=${getAdminToken()}`);
        const data = await res.json();
        if (data.success) {
            document.getElementById('stat-total').textContent = data.stats.totalUsers;
            document.getElementById('stat-trials').textContent = data.stats.activeTrials;
            document.getElementById('stat-active').textContent = data.stats.activeSubscriptions;
            document.getElementById('stat-revenue').textContent = data.stats.totalPayments;
            document.getElementById('stat-downloads').textContent = data.stats.totalDownloads || 0;
        }
    } catch (err) { console.error('Stats error:', err); }
}

function extProductIcon(code) {
    const c = String(code || '').toLowerCase();
    if (c === 'instabot') return '🤖';
    if (c === 'autocut') return '✂️';
    return '📦';
}

function extProductActive(p) {
    if (!p) return false;
    if (!p.is_active && p.is_active !== 1 && p.is_active !== '1') {
        // is_active pode vir como 0/1 ou boolean
        if (p.is_active !== true) return false;
    }
    if (!p.plan_end) return !!p.is_active;
    return new Date(p.plan_end) > new Date();
}

function renderExtBadges(u) {
    try {
        const list = u && Array.isArray(u.products) ? u.products : [];
        if (!list.length) return '<span style="opacity:0.4; font-size:12px;">-</span>';
        return list.map(p => {
            const code = p.product_code || p.code || '';
            const ok = extProductActive(p);
            const cls = ok ? 'badge badge-active' : 'badge';
            const end = p.plan_end ? new Date(p.plan_end).toLocaleDateString('pt-BR') : 'sem vencimento';
            const title = code + ' — ' + (ok ? 'ativa até ' + end : 'inativa (' + end + ')');
            return `<span class="${cls}" title="${title}" style="margin-right:4px;">${extProductIcon(code)}</span>`;
        }).join('');
    } catch (e) {
        return '<span style="opacity:0.4; font-size:12px;">-</span>';
    }
}

async function loadClients() {
    try {
        const res = await fetch(`${API_URL}/admin/users?key=${getAdminToken()}`);
        const data = await res.json();
        if (!data.success) return;

        const tbody = document.getElementById('clients-tbody');
        tbody.innerHTML = '';
        const now = new Date();

        data.users.forEach(u => {
            let statusBadge, planBadge;
            const expiry = u.subscription_end || u.trial_end;
            const isExpired = expiry ? new Date(expiry) < now : true;

            if (u.plan === 'admin') {
                planBadge = '<span class="badge badge-admin">Admin</span>';
                statusBadge = '<span class="badge badge-active">Ativo</span>';
            } else if (!u.is_active) {
                planBadge = `<span class="badge">${u.plan}</span>`;
                statusBadge = '<span class="badge badge-expired">Desativado</span>';
            } else if (isExpired) {
                planBadge = `<span class="badge badge-expired">${u.plan}</span>`;
                statusBadge = '<span class="badge badge-expired">Expirado</span>';
            } else if (u.plan === 'trial') {
                planBadge = '<span class="badge badge-trial">Trial</span>';
                statusBadge = '<span class="badge badge-trial">Em teste</span>';
            } else {
                planBadge = `<span class="badge badge-active">${u.plan}</span>`;
                statusBadge = '<span class="badge badge-active">Ativo</span>';
            }

            const expiryStr = expiry ? new Date(expiry).toLocaleDateString('pt-BR') : '-';
            const extBadges = renderExtBadges(u);

            tbody.innerHTML += `<tr>
                <td>${u.id}</td>
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td>@${u.instagram}</td>
                <td>${planBadge}</td>
                <td>${extBadges}</td>
                <td>${expiryStr}</td>
                <td>${statusBadge}</td>
                <td><button class="btn-edit" onclick="openEditModal(${u.id})">✏️ Editar</button></td>
            </tr>`;
        });

        // Cache clients for edit
        window._adminClients = data.users;

    } catch (err) { console.error('Clients error:', err); }
}

async function loadTickets() {
    try {
        const res = await fetch(`${API_URL}/admin/tickets?key=${getAdminToken()}`);
        const data = await res.json();
        if (!data.success) return;

        const tbody = document.getElementById('tickets-tbody');
        tbody.innerHTML = '';

        data.tickets.forEach(t => {
            const statusBadge = t.status === 'open'
                ? '<span class="badge badge-open">Aberto</span>'
                : '<span class="badge badge-resolved">Resolvido</span>';
            const date = new Date(t.created_at).toLocaleDateString('pt-BR');

            tbody.innerHTML += `<tr>
                <td>#${t.id}</td>
                <td>${t.user_name || t.name}</td>
                <td>${t.email}</td>
                <td>${t.subject}</td>
                <td>${date}</td>
                <td>${statusBadge}</td>
                <td><button class="btn-view" onclick='viewTicket(${JSON.stringify(t).replace(/'/g, "&#39;")})'>👁️ Ver</button></td>
            </tr>`;
        });

    } catch (err) { console.error('Tickets error:', err); }
}

async function loadAdmins() {
    try {
        const res = await fetch(`${API_URL}/admin/admins?key=${getAdminToken()}`);
        const data = await res.json();
        if (!data.success) return;

        const tbody = document.getElementById('admins-tbody');
        tbody.innerHTML = '';

        data.admins.forEach(a => {
            const dateStr = new Date(a.created_at).toLocaleDateString('pt-BR');
            tbody.innerHTML += `<tr>
                <td>${a.id}</td>
                <td>${a.name}</td>
                <td>${a.email}</td>
                <td>${dateStr}</td>
                <td>
                    <button class="btn-edit" onclick="openResetPasswordModal(${a.id}, 'admin')" style="background:#e17055; margin-right:5px; border:none; padding:5px 10px; border-radius:4px; color:#fff; cursor:pointer;">🔑 Senha</button>
                    <button class="btn-edit" onclick="deleteAdmin(${a.id})" style="background:#d63031; border:none; padding:5px 10px; border-radius:4px; color:#fff; cursor:pointer;">🗑️ Excluir</button>
                </td>
            </tr>`;
        });
    } catch (err) { console.error('Admins error:', err); }
}

async function deleteAdmin(id) {
    if (!confirm('Tem certeza que deseja excluir este administrador?')) return;
    try {
        const res = await fetch(`${API_URL}/admin/admins/${id}?key=${getAdminToken()}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
            loadAdmins();
        } else {
            alert('Erro: ' + result.message);
        }
    } catch (err) { alert('Erro ao excluir administrador.'); }
}

function openResetPasswordModal(id, type) {
    document.getElementById('reset-target-id').value = id;
    document.getElementById('reset-target-type').value = type;
    document.getElementById('reset-new-password').value = '';
    document.getElementById('reset-password-modal').style.display = 'flex';
}

function openEditModal(userId) {
    const user = window._adminClients.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('edit-id').value = user.id;
    document.getElementById('edit-name').value = user.name;
    document.getElementById('edit-email').value = user.email;
    document.getElementById('edit-instagram').value = user.instagram;
    document.getElementById('edit-plan').value = user.plan || 'trial';
    document.getElementById('edit-status').value = user.is_active ? '1' : '0';
    document.getElementById('edit-bonus').value = '';

    const expiry = user.subscription_end || user.trial_end;
    if (expiry) {
        document.getElementById('edit-expiry').value = expiry.split('T')[0];
    }

    // Renderizar lista de @ do cliente
    renderInstagramsList(user);

    // Carregar extensões/direitos do cliente (catálogo + vencimentos)
    loadEditEntitlements(user.id);

    document.getElementById('edit-modal').style.display = 'flex';
}

function renderInstagramsList(user) {
    const container = document.getElementById('edit-instagrams-list');
    const igs = user.instagrams || [];
    
    if (igs.length === 0) {
        container.innerHTML = '<p style="opacity:0.5; font-size:13px;">Nenhum @ cadastrado</p>';
        return;
    }

    container.innerHTML = igs.map(ig => {
        const endDate = ig.plan_end ? new Date(ig.plan_end).toLocaleDateString('pt-BR') : '-';
        const isPrimary = ig.instagram === user.instagram;
        const badge = isPrimary ? ' <span style="font-size:10px; background:#00d4ff; padding:2px 6px; border-radius:4px;">PRINCIPAL</span>' : '';
        const removeBtn = isPrimary ? '' : ` <button onclick="removeInstagram(${user.id}, ${ig.id})" style="background:#e74c3c; border:none; color:#fff; padding:3px 8px; border-radius:4px; cursor:pointer; font-size:11px;">✕</button>`;
        
        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:rgba(255,255,255,0.05); border-radius:8px; margin-bottom:4px; font-size:13px;">
            <span>@${ig.instagram}${badge}</span>
            <span style="opacity:0.6;">${ig.plan} | até ${endDate}</span>
            ${removeBtn}
        </div>`;
    }).join('');
}

async function addInstagram(userId) {
    const input = document.getElementById('edit-new-ig');
    const ig = input.value.trim();
    if (!ig) return alert('Digite um @ de Instagram.');

    try {
        const res = await fetch(`${API_URL}/admin/users/${userId}/add-instagram?key=${getAdminToken()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instagram: ig })
        });
        const result = await res.json();
        if (result.success) {
            input.value = '';
            loadClients();
            // Atualizar modal após reload
            setTimeout(() => openEditModal(userId), 500);
        } else {
            alert(result.message);
        }
    } catch (err) { alert('Erro ao adicionar @.'); }
}

async function removeInstagram(userId, igId) {
    if (!confirm('Remover este @ do cliente?')) return;
    try {
        const res = await fetch(`${API_URL}/admin/users/${userId}/instagram/${igId}?key=${getAdminToken()}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
            loadClients();
            setTimeout(() => openEditModal(userId), 500);
        } else {
            alert(result.message);
        }
    } catch (err) { alert('Erro ao remover @.'); }
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

function viewTicket(ticket) {
    const detail = document.getElementById('ticket-detail');
    detail.innerHTML = `
        <div class="td-row"><div class="td-label">Cliente</div><div class="td-value">${ticket.user_name || ticket.name}</div></div>
        <div class="td-row"><div class="td-label">Email</div><div class="td-value">${ticket.email}</div></div>
        <div class="td-row"><div class="td-label">Instagram</div><div class="td-value">@${ticket.instagram || '-'}</div></div>
        <div class="td-row"><div class="td-label">Assunto</div><div class="td-value">${ticket.subject}</div></div>
        <div class="td-row"><div class="td-label">Data</div><div class="td-value">${new Date(ticket.created_at).toLocaleString('pt-BR')}</div></div>
        <div class="td-label" style="margin-top:12px;">Mensagem</div>
        <div class="td-message">${ticket.message}</div>
    `;

    document.getElementById('ticket-resolve').onclick = async () => {
        try {
            await fetch(`${API_URL}/admin/tickets/${ticket.id}/resolve?key=${getAdminToken()}`, { method: 'PUT' });
            document.getElementById('ticket-modal').style.display = 'none';
            loadTickets();
        } catch (err) { alert('Erro ao resolver ticket.'); }
    };

    document.getElementById('ticket-modal').style.display = 'flex';
}


/* ============================================
   BACKUP & RESTORE
   ============================================ */

// Variável para guardar o arquivo selecionado para restore
let pendingRestoreFile = null;

function initBackup() {
    // ====== DOWNLOAD BACKUP ======
    document.getElementById('btn-download-backup').addEventListener('click', async () => {
        const btn = document.getElementById('btn-download-backup');
        const statusEl = document.getElementById('backup-download-status');
        
        btn.disabled = true;
        btn.textContent = '⏳ Gerando backup...';
        statusEl.className = 'backup-status loading';
        statusEl.textContent = '⏳ Gerando backup, aguarde...';

        try {
            const res = await fetch(`${API_URL}/admin/backup?key=${getAdminToken()}`);
            
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.message || 'Erro ao gerar backup.');
            }

            const blob = await res.blob();
            const contentDisposition = res.headers.get('Content-Disposition') || '';
            let filename = 'visionplus-backup.db';
            const match = contentDisposition.match(/filename="(.+)"/);
            if (match) filename = match[1];

            // Criar link de download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            const sizeKB = (blob.size / 1024).toFixed(1);
            statusEl.className = 'backup-status success';
            statusEl.textContent = `✅ Backup baixado com sucesso! (${filename} - ${sizeKB} KB)`;

        } catch (err) {
            statusEl.className = 'backup-status error';
            statusEl.textContent = '❌ ' + err.message;
        } finally {
            btn.disabled = false;
            btn.textContent = '⬇️ Download Backup';
        }
    });

    // ====== RESTORE BACKUP ======
    const fileInput = document.getElementById('restore-file-input');
    
    document.getElementById('btn-restore-backup').addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validar extensão
        if (!file.name.endsWith('.db')) {
            const statusEl = document.getElementById('backup-restore-status');
            statusEl.className = 'backup-status error';
            statusEl.textContent = '❌ Arquivo inválido. Selecione um arquivo .db';
            fileInput.value = '';
            return;
        }

        // Guardar arquivo e abrir modal de confirmação
        pendingRestoreFile = file;
        const sizeKB = (file.size / 1024).toFixed(1);
        document.getElementById('restore-file-info').innerHTML = `
            <strong>📄 Arquivo selecionado:</strong> ${file.name}<br>
            <strong>📏 Tamanho:</strong> ${sizeKB} KB<br>
            <strong>📅 Modificado:</strong> ${new Date(file.lastModified).toLocaleString('pt-BR')}
        `;
        document.getElementById('restore-modal').style.display = 'flex';
        fileInput.value = ''; // Resetar input
    });

    // Modal de confirmação
    document.getElementById('restore-modal-close').addEventListener('click', closeRestoreModal);
    document.getElementById('btn-cancel-restore').addEventListener('click', closeRestoreModal);
    document.getElementById('btn-confirm-restore').addEventListener('click', executeRestore);
}

function closeRestoreModal() {
    document.getElementById('restore-modal').style.display = 'none';
    pendingRestoreFile = null;
}

async function executeRestore() {
    if (!pendingRestoreFile) return;

    const modal = document.getElementById('restore-modal');
    const statusEl = document.getElementById('backup-restore-status');
    const confirmBtn = document.getElementById('btn-confirm-restore');

    confirmBtn.disabled = true;
    confirmBtn.textContent = '⏳ Restaurando...';

    try {
        const arrayBuffer = await pendingRestoreFile.arrayBuffer();

        const res = await fetch(`${API_URL}/admin/restore?key=${getAdminToken()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: arrayBuffer
        });

        const result = await res.json();
        modal.style.display = 'none';

        if (result.success) {
            statusEl.className = 'backup-status success';
            statusEl.textContent = `✅ ${result.message}`;
            // Recarregar dados do painel
            loadStats();
            loadClients();
            loadTickets();
        } else {
            statusEl.className = 'backup-status error';
            statusEl.textContent = '❌ ' + result.message;
        }

    } catch (err) {
        modal.style.display = 'none';
        statusEl.className = 'backup-status error';
        statusEl.textContent = '❌ Erro ao restaurar. Verifique se o servidor está online.';
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Sim, Restaurar';
        pendingRestoreFile = null;
    }
}

// ============ TUTORIAIS ============

function initTutorials() {
    const modal = document.getElementById('add-tutorial-modal');
    const btnOpen = document.getElementById('btn-show-add-tutorial');
    const btnClose = document.getElementById('add-tutorial-modal-close');
    const btnCancel = document.getElementById('add-tutorial-modal-cancel');

    if (btnOpen) btnOpen.addEventListener('click', () => { modal.style.display = 'flex'; });
    if (btnClose) btnClose.addEventListener('click', () => { modal.style.display = 'none'; });
    if (btnCancel) btnCancel.addEventListener('click', () => { modal.style.display = 'none'; });

    document.getElementById('add-tutorial-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('add-tutorial-title').value.trim();
        let url = document.getElementById('add-tutorial-url').value.trim();

        // Converter link normal do YouTube para embed automaticamente
        if (url.includes('youtube.com/watch?v=')) {
            const videoId = url.split('v=')[1].split('&')[0];
            url = 'https://www.youtube.com/embed/' + videoId;
        } else if (url.includes('youtu.be/')) {
            const videoId = url.split('youtu.be/')[1].split('?')[0];
            url = 'https://www.youtube.com/embed/' + videoId;
        }

        try {
            const res = await fetch(`${API_URL}/admin/tutorials`, {
                method: 'POST',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ title, url })
            });
            const data = await res.json();
            if (data.success) {
                modal.style.display = 'none';
                document.getElementById('add-tutorial-title').value = '';
                document.getElementById('add-tutorial-url').value = '';
                loadTutorials();
                alert('\u2705 ' + data.message);
            } else {
                alert('\u274c ' + data.message);
            }
        } catch (err) {
            alert('\u274c Erro de conex\u00e3o com o servidor.');
        }
    });
}

async function loadTutorials() {
    try {
        const res = await fetch(`${API_URL}/admin/tutorials`, {
            headers: getAuthHeaders()
        });
        const data = await res.json();
        const tbody = document.getElementById('tutorials-tbody');
        if (!tbody) return;

        if (!data.success || !data.tutorials.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">Nenhum tutorial cadastrado ainda. Clique em "+ Adicionar Tutorial" para come\u00e7ar.</td></tr>';
            return;
        }

        tbody.innerHTML = data.tutorials.map(t => `
            <tr>
                <td>${t.id}</td>
                <td>${t.title}</td>
                <td style="max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><a href="${t.url}" target="_blank" style="color:var(--accent-purple);">${t.url}</a></td>
                <td>${formatDate(t.created_at)}</td>
                <td>
                    <button onclick="deleteTutorial(${t.id})" class="btn-action delete" title="Excluir">\ud83d\uddd1\ufe0f</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Erro ao carregar tutoriais:', err);
    }
}

async function deleteTutorial(id) {
    if (!confirm('Tem certeza que deseja excluir este tutorial?')) return;
    try {
        const res = await fetch(`${API_URL}/admin/tutorials/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (data.success) {
            loadTutorials();
        } else {
            alert('\u274c ' + data.message);
        }
    } catch (err) {
        alert('\u274c Erro de conex\u00e3o.');
    }
}

/* ============================================
   PRODUTOS / VALORES
   ============================================ */

function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtBRL(v) {
    const n = Number(v);
    if (!isFinite(n)) return 'R$ -';
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function initProductsForm() {
    const btn = document.getElementById('btn-save-products');
    if (btn) btn.addEventListener('click', saveProducts);
    ['price-instabot-mensal', 'price-instabot-trimestral', 'price-instabot-semestral', 'price-instabot-anual'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateProductsPreview);
    });
}

async function loadProducts() {
    const tbody = document.getElementById('products-tbody');
    const msg = document.getElementById('products-msg');
    try {
        const res = await fetch(`${API_URL}/admin/products`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (!data.success) {
            if (msg) { msg.style.color = '#ff7675'; msg.textContent = '❌ ' + (data.message || 'Erro ao carregar.'); }
            return;
        }
        const prices = (data.prices && data.prices.instabot) || {};
        document.getElementById('price-instabot-mensal').value = prices.mensal != null ? prices.mensal : '';
        document.getElementById('price-instabot-trimestral').value = prices.trimestral != null ? prices.trimestral : '';
        document.getElementById('price-instabot-semestral').value = prices.semestral != null ? prices.semestral : '';
        document.getElementById('price-instabot-anual').value = prices.anual != null ? prices.anual : '';

        const products = Array.isArray(data.products) ? data.products : [];
        if (!tbody) return;
        if (!products.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; opacity:0.6;">Nenhum produto cadastrado.</td></tr>';
        } else {
            tbody.innerHTML = products.map(p => {
                const code = escHtml(p.code);
                const pct = r => Math.round(Number(r) * 100);
                const checked = p.is_active ? 'checked' : '';
                return `<tr data-code="${code}">
                    <td>${escHtml(p.name || p.code)} <small style="opacity:0.5;">(${code})</small></td>
                    <td style="text-align:center;"><input type="checkbox" data-f="is_active" ${checked} title="Produto ativo no catálogo"></td>
                    <td><input type="number" class="admin-input" data-f="standalone_ratio" value="${pct(p.standalone_ratio)}" min="0" max="500" step="1" style="max-width:110px;"> <small style="opacity:0.6;">%</small></td>
                    <td><input type="number" class="admin-input" data-f="combo_ratio" value="${pct(p.combo_ratio)}" min="0" max="500" step="1" style="max-width:110px;"> <small style="opacity:0.6;">%</small></td>
                </tr>`;
            }).join('');
            tbody.querySelectorAll('input').forEach(el => el.addEventListener('input', updateProductsPreview));
            tbody.querySelectorAll('input[type="checkbox"]').forEach(el => el.addEventListener('change', updateProductsPreview));
        }
        updateProductsPreview();
    } catch (err) {
        console.error('Products error:', err);
        if (msg) { msg.style.color = '#ff7675'; msg.textContent = '❌ Erro de conexão.'; }
    }
}

function updateProductsPreview() {
    const box = document.getElementById('products-preview');
    if (!box) return;
    const base = {
        mensal: Number(document.getElementById('price-instabot-mensal').value) || 0,
        trimestral: Number(document.getElementById('price-instabot-trimestral').value) || 0,
        semestral: Number(document.getElementById('price-instabot-semestral').value) || 0,
        anual: Number(document.getElementById('price-instabot-anual').value) || 0
    };
    // Ratios atuais da linha autocut (padrão 60% sozinho / 40% combo)
    let st = 0.6, cb = 0.4;
    const row = document.querySelector('#products-tbody tr[data-code="autocut"]');
    if (row) {
        const stEl = row.querySelector('[data-f="standalone_ratio"]');
        const cbEl = row.querySelector('[data-f="combo_ratio"]');
        if (stEl && isFinite(Number(stEl.value))) st = Number(stEl.value) / 100;
        if (cbEl && isFinite(Number(cbEl.value))) cb = Number(cbEl.value) / 100;
    }
    const pctFmt = r => Math.round(r * 100) + '%';
    const line = (label, v) => `${label}: sozinho <strong>${fmtBRL(v * st)}</strong> (${pctFmt(st)}) · no combo <strong>${fmtBRL(v * cb)}</strong> (${pctFmt(cb)})`;
    box.innerHTML = '👁️ Prévia AutoCut (somente leitura) — ' +
        ['mensal', 'trimestral', 'semestral', 'anual'].map(p => line('Base ' + p + ' ' + fmtBRL(base[p]), base[p])).join('<br>');
}

async function saveProducts() {
    const msg = document.getElementById('products-msg');
    const btn = document.getElementById('btn-save-products');
    const prices = {
        instabot: {
            mensal: Number(document.getElementById('price-instabot-mensal').value) || 0,
            trimestral: Number(document.getElementById('price-instabot-trimestral').value) || 0,
            semestral: Number(document.getElementById('price-instabot-semestral').value) || 0,
            anual: Number(document.getElementById('price-instabot-anual').value) || 0
        }
    };
    const products = Array.from(document.querySelectorAll('#products-tbody tr[data-code]')).map(tr => {
        const code = tr.getAttribute('data-code');
        const get = f => tr.querySelector(`[data-f="${f}"]`);
        const pctToFrac = el => el ? (Number(el.value) / 100) : 0;
        return {
            code,
            standalone_ratio: pctToFrac(get('standalone_ratio')),
            combo_ratio: pctToFrac(get('combo_ratio')),
            is_active: get('is_active') ? !!get('is_active').checked : true
        };
    });
    if (msg) { msg.style.color = '#a0aec0'; msg.textContent = '⏳ Salvando...'; }
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(`${API_URL}/admin/products`, {
            method: 'PUT',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ prices, products })
        });
        const data = await res.json();
        if (data.success) {
            if (msg) { msg.style.color = '#55efc4'; msg.textContent = '✅ ' + (data.message || 'Salvo com sucesso.'); }
        } else {
            if (msg) { msg.style.color = '#ff7675'; msg.textContent = '❌ ' + (data.message || 'Erro ao salvar.'); }
        }
    } catch (err) {
        if (msg) { msg.style.color = '#ff7675'; msg.textContent = '❌ Erro de conexão.'; }
    } finally {
        if (btn) btn.disabled = false;
    }
}

/* ============================================
   EXTENSÕES DO CLIENTE (modal editar)
   ============================================ */

async function loadEditEntitlements(userId) {
    const box = document.getElementById('edit-products-list');
    const msg = document.getElementById('edit-rights-msg');
    if (msg) msg.textContent = '';
    if (!box) return;
    box.innerHTML = '<p style="opacity:0.5; font-size:13px;">Carregando extensões...</p>';
    try {
        const res = await fetch(`${API_URL}/admin/users/${userId}/products`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (!data.success) {
            box.innerHTML = '<p style="color:#ff7675; font-size:13px;">❌ ' + escHtml(data.message || 'Erro ao carregar.') + '</p>';
            return;
        }
        const catalog = Array.isArray(data.catalog) ? data.catalog : [];
        const ents = {};
        (Array.isArray(data.entitlements) ? data.entitlements : []).forEach(e => { ents[e.product_code] = e; });
        if (!catalog.length) {
            box.innerHTML = '<p style="opacity:0.5; font-size:13px;">Nenhum produto no catálogo.</p>';
            return;
        }
        box.innerHTML = catalog.map(p => {
            const code = escHtml(p.code);
            const e = ents[p.code] || {};
            const active = e.is_active ? 'checked' : '';
            const end = e.plan_end ? new Date(e.plan_end).toLocaleDateString('pt-BR') : 'sem vencimento';
            const valid = e.plan_end && new Date(e.plan_end) > new Date();
            const endColor = valid ? '#55efc4' : '#a0aec0';
            return `<div data-code="${code}" style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; padding:8px 10px; background:rgba(255,255,255,0.05); border-radius:8px; font-size:13px;">
                <span style="min-width:140px;">${extProductIcon(p.code)} <strong>${escHtml(p.name || p.code)}</strong></span>
                <label style="display:flex; gap:5px; align-items:center; cursor:pointer;"><input type="checkbox" data-f="is_active" ${active}> Ativa</label>
                <span style="color:${endColor};">Vence: ${escHtml(end)}</span>
                <label style="display:flex; gap:5px; align-items:center;">Renovar +<input type="number" class="admin-input" data-f="months" min="0" value="" placeholder="N" style="width:70px; padding:6px 8px;"> meses</label>
            </div>`;
        }).join('');
    } catch (err) {
        box.innerHTML = '<p style="color:#ff7675; font-size:13px;">❌ Erro de conexão.</p>';
    }
}

async function saveClientEntitlements() {
    const id = document.getElementById('edit-id').value;
    const msg = document.getElementById('edit-rights-msg');
    if (!id) return;
    const items = Array.from(document.querySelectorAll('#edit-products-list [data-code]')).map(row => ({
        product_code: row.getAttribute('data-code'),
        is_active: row.querySelector('[data-f="is_active"]') ? !!row.querySelector('[data-f="is_active"]').checked : false,
        months: parseInt(row.querySelector('[data-f="months"]') ? row.querySelector('[data-f="months"]').value : '0') || 0
    }));
    if (msg) { msg.style.color = '#a0aec0'; msg.textContent = '⏳ Salvando...'; }
    try {
        const res = await fetch(`${API_URL}/admin/users/${id}/products`, {
            method: 'PUT',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ items })
        });
        const data = await res.json();
        if (data.success) {
            if (msg) { msg.style.color = '#55efc4'; msg.textContent = '✅ Direitos salvos.'; }
            loadClients();
            loadEditEntitlements(id);
        } else {
            if (msg) { msg.style.color = '#ff7675'; msg.textContent = '❌ ' + (data.message || 'Erro.'); }
        }
    } catch (err) {
        if (msg) { msg.style.color = '#ff7675'; msg.textContent = '❌ Erro de conexão.'; }
    }
}



/* ============================================
   SITE (editor do site) - Clientes da vitrine + páginas
   ============================================ */

function initSite() {
    const addBtn = document.getElementById('btn-add-site-client');
    if (addBtn) addBtn.addEventListener('click', function () { openSiteClientModal(null); });

    const form = document.getElementById('site-client-form');
    if (form) form.addEventListener('submit', saveSiteClient);

    ['site-client-modal-close', 'site-client-modal-cancel'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', closeSiteClientModal);
    });

    const logoBtn = document.getElementById('btn-site-client-logo');
    const logoFile = document.getElementById('site-client-logo-file');
    if (logoBtn && logoFile) {
        logoBtn.addEventListener('click', function () { logoFile.click(); });
        logoFile.addEventListener('change', onSiteClientLogoChange);
    }
    const logoClear = document.getElementById('btn-site-client-logo-clear');
    if (logoClear) logoClear.addEventListener('click', function () {
        const hidden = document.getElementById('site-client-logo');
        if (hidden) hidden.value = '';
        renderSiteLogoPreview('');
    });

    loadSiteClients();
    loadSitePages();
}

let SITE_CLIENTS_CACHE = [];

async function loadSiteClients() {
    const tbody = document.getElementById('site-clients-tbody');
    if (!tbody) return;
    try {
        const res = await fetch(API_URL + '/site/admin/clients', { headers: getAuthHeaders() });
        const data = await res.json();
        if (!data.success) { tbody.innerHTML = '<tr><td colspan="7" style="opacity:.7;">Erro ao carregar clientes.</td></tr>'; return; }
        SITE_CLIENTS_CACHE = data.clients || [];
        renderSiteClients();
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" style="opacity:.7;">Erro de conexão.</td></tr>';
    }
}

function renderSiteClients() {
    const tbody = document.getElementById('site-clients-tbody');
    if (!tbody) return;
    if (!SITE_CLIENTS_CACHE.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="opacity:.7; text-align:center; padding:24px;">Nenhum cliente na vitrine ainda. Clique em "+ Adicionar cliente".</td></tr>';
        return;
    }
    tbody.innerHTML = SITE_CLIENTS_CACHE.map(function (c) {
        const logo = c.logo
            ? '<img class="site-logo-thumb" src="' + escHtml(c.logo) + '" alt="logo">'
            : '<span class="site-logo-thumb site-logo-initials">' + escHtml(iniciaisCliente(c.name)) + '</span>';
        const link = c.url ? '<a href="' + escHtml(c.url) + '" target="_blank" rel="noopener">abrir</a>' : '—';
        const active = c.is_active ? '<span style="color:#55efc4;">Sim</span>' : '<span style="color:#ff7675;">Não</span>';
        return '<tr>' +
            '<td>' + logo + '</td>' +
            '<td>' + escHtml(c.name) + '</td>' +
            '<td>' + escHtml(c.type || '—') + '</td>' +
            '<td>' + link + '</td>' +
            '<td>' + active + '</td>' +
            '<td style="white-space:nowrap;">' +
                '<button class="btn-icon" onclick="moveSiteClient(' + c.id + ',-1)" title="Subir">▲</button>' +
                '<button class="btn-icon" onclick="moveSiteClient(' + c.id + ',1)" title="Descer">▼</button>' +
            '</td>' +
            '<td style="white-space:nowrap;">' +
                '<button class="btn-site-edit" onclick="openSiteClientModal(' + c.id + ')">Editar</button>' +
                '<button class="btn-site-del" onclick="deleteSiteClient(' + c.id + ')">Remover</button>' +
            '</td>' +
        '</tr>';
    }).join('');
}

function iniciaisCliente(nome) {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[1][0]).toUpperCase();
}

function renderSiteLogoPreview(url) {
    const box = document.getElementById('site-client-logo-preview');
    if (!box) return;
    if (url) box.innerHTML = '<img src="' + escHtml(url) + '" alt="logo">';
    else box.textContent = 'sem logo';
}

function openSiteClientModal(id) {
    const title = document.getElementById('site-client-modal-title');
    document.getElementById('site-client-form').reset();
    if (id) {
        const c = SITE_CLIENTS_CACHE.find(function (x) { return String(x.id) === String(id); });
        if (!c) return;
        if (title) title.textContent = '✏️ Editar cliente';
        document.getElementById('site-client-id').value = c.id;
        document.getElementById('site-client-name').value = c.name || '';
        document.getElementById('site-client-type').value = c.type || '';
        document.getElementById('site-client-description').value = c.description || '';
        document.getElementById('site-client-url').value = c.url || '';
        document.getElementById('site-client-active').checked = !!c.is_active;
        document.getElementById('site-client-logo').value = c.logo || '';
        renderSiteLogoPreview(c.logo || '');
    } else {
        if (title) title.textContent = '✏️ Novo cliente';
        document.getElementById('site-client-id').value = '';
        document.getElementById('site-client-logo').value = '';
        document.getElementById('site-client-active').checked = true;
        renderSiteLogoPreview('');
    }
    document.getElementById('site-client-modal').style.display = 'flex';
}

function closeSiteClientModal() {
    const m = document.getElementById('site-client-modal');
    if (m) m.style.display = 'none';
}

function onSiteClientLogoChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function () {
        const box = document.getElementById('site-client-logo-preview');
        if (box) box.textContent = 'enviando...';
        try {
            const res = await fetch(API_URL + '/site/upload', {
                method: 'POST',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ filename: file.name, dataUrl: reader.result })
            });
            const data = await res.json();
            const hidden = document.getElementById('site-client-logo');
            if (data.success) {
                if (hidden) hidden.value = data.url;
                renderSiteLogoPreview(data.url);
            } else {
                alert('Erro ao enviar imagem: ' + (data.message || ''));
                renderSiteLogoPreview(hidden ? hidden.value : '');
            }
        } catch (err) {
            alert('Erro de conexão ao enviar imagem.');
            const hidden = document.getElementById('site-client-logo');
            renderSiteLogoPreview(hidden ? hidden.value : '');
        }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

async function saveSiteClient(e) {
    e.preventDefault();
    const id = document.getElementById('site-client-id').value;
    const payload = {
        name: document.getElementById('site-client-name').value.trim(),
        type: document.getElementById('site-client-type').value.trim(),
        description: document.getElementById('site-client-description').value.trim(),
        url: document.getElementById('site-client-url').value.trim(),
        logo: document.getElementById('site-client-logo').value,
        is_active: document.getElementById('site-client-active').checked ? 1 : 0
    };
    if (!payload.name) { alert('Informe o nome do cliente.'); return; }
    try {
        const res = await fetch(API_URL + '/site/admin/clients' + (id ? '/' + id : ''), {
            method: id ? 'PUT' : 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) { closeSiteClientModal(); loadSiteClients(); }
        else alert('Erro: ' + (data.message || ''));
    } catch (err) {
        alert('Erro de conexão ao salvar.');
    }
}

async function deleteSiteClient(id) {
    if (!confirm('Remover este cliente da vitrine?')) return;
    try {
        const res = await fetch(API_URL + '/site/admin/clients/' + id, { method: 'DELETE', headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) loadSiteClients();
        else alert('Erro: ' + (data.message || ''));
    } catch (err) { alert('Erro de conexão.'); }
}

async function moveSiteClient(id, dir) {
    const idx = SITE_CLIENTS_CACHE.findIndex(function (c) { return c.id === id; });
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= SITE_CLIENTS_CACHE.length) return;
    const arr = SITE_CLIENTS_CACHE.slice();
    const tmp = arr[idx]; arr[idx] = arr[newIdx]; arr[newIdx] = tmp;
    SITE_CLIENTS_CACHE = arr;
    renderSiteClients();
    try {
        await fetch(API_URL + '/site/admin/clients/reorder', {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ order: arr.map(function (c) { return c.id; }) })
        });
        loadSiteClients();
    } catch (err) { /* ignore */ }
}

async function loadSitePages() {
    const box = document.getElementById('site-pages-list');
    if (!box) return;
    try {
        const pagesRes = await fetch(API_URL + '/site/pages');
        const pagesData = await pagesRes.json();
        let counts = {};
        try {
            const countsRes = await fetch(API_URL + '/site/editor', { headers: getAuthHeaders() });
            const countsData = await countsRes.json();
            counts = (countsData && countsData.counts) || {};
        } catch (e) { /* sem contagens */ }
        const pages = (pagesData && pagesData.pages) || [];
        if (!pages.length) { box.innerHTML = '<p class="site-hint">Nenhuma página disponível.</p>'; return; }
        box.innerHTML = pages.map(function (p) {
            const edited = counts[p.file] ? '<span class="site-badge">' + counts[p.file] + ' edição(ões)</span>' : '';
            return '<div class="site-page-row">' +
                '<div class="site-page-info">' +
                    '<span class="site-page-name">' + escHtml(p.label) + '</span>' +
                    '<span class="site-page-file">' + escHtml(p.file) + '</span>' +
                    edited +
                '</div>' +
                '<div class="site-page-actions">' +
                    '<button class="btn-site-edit" onclick="openSiteEditor(\'' + p.file + '\')">✏️ Editar</button>' +
                    '<button class="btn-site-del" onclick="resetSitePage(\'' + p.file + '\')">↺ Resetar</button>' +
                '</div>' +
            '</div>';
        }).join('');
    } catch (err) {
        box.innerHTML = '<p class="site-hint">Erro ao carregar páginas.</p>';
    }
}

function openSiteEditor(file) {
    const token = getAdminToken();
    if (!token) { alert('Faça login novamente.'); return; }
    window.open(file + '?edit=1&key=' + encodeURIComponent(token), '_blank');
}

async function resetSitePage(file) {
    if (!confirm('Apagar as edições desta página e voltar ao original?')) return;
    try {
        const res = await fetch(API_URL + '/site/content?page=' + encodeURIComponent(file), { method: 'DELETE', headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) loadSitePages();
        else alert('Erro: ' + (data.message || ''));
    } catch (err) { alert('Erro de conexão.'); }
}
