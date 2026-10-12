/* ============================================
   AUTO CUT PAINEL - JavaScript
   Gerenciamento de projetos de corte
   ============================================ */

const API_URL = window.location.origin + '/api';

function getToken() {
    return localStorage.getItem('vp_token');
}

function getAuthHeaders(extras = {}) {
    return {
        'Authorization': 'Bearer ' + getToken(),
        ...extras
    };
}

document.addEventListener('DOMContentLoaded', () => {

    // Auth Check
    const token = getToken();
    const userData = localStorage.getItem('vp_user');
    if (!token || !userData) {
        window.location.href = 'login.html';
        return;
    }

    let user = null;
    try { user = JSON.parse(userData); } catch (e) { /* sem vp_user */ }

    // Saudação + botão admin
    const greeting = document.getElementById('user-greeting');
    if (user && greeting) greeting.textContent = `Olá, ${user.name}`;

    const btnAdmin = document.getElementById('btn-admin-header');
    if (btnAdmin && user && user.plan === 'admin') btnAdmin.style.display = 'inline-block';

    // Logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            localStorage.removeItem('vp_token');
            localStorage.removeItem('vp_user');
            window.location.href = 'login.html';
        });
    }

    // ============ MODAL NOVO / EDITAR ============
    const jobModal = document.getElementById('job-modal');
    const btnNewJob = document.getElementById('btn-new-job');
    const jobFormMsg = document.getElementById('job-form-msg');

    if (btnNewJob) btnNewJob.addEventListener('click', () => openJobModal());
    document.getElementById('job-modal-close').addEventListener('click', closeJobModal);
    jobModal.addEventListener('click', (e) => { if (e.target === jobModal) closeJobModal(); });

    // Mostrar/esconder campo de URL conforme o tipo de origem
    const sourceType = document.getElementById('job-source-type');
    const sourceUrlGroup = document.getElementById('source-url-group');
    if (sourceType) {
        sourceType.addEventListener('change', () => {
            sourceUrlGroup.style.display = sourceType.value === 'upload' ? 'none' : 'block';
        });
    }

    // Submit do formulário
    document.getElementById('job-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('job-id').value;
        const data = {
            title: document.getElementById('job-title').value.trim(),
            source_url: document.getElementById('job-source-url').value.trim(),
            source_type: sourceType.value,
            instagram: document.getElementById('job-instagram').value.trim(),
            clips_count: document.getElementById('job-clips-count').value || 5,
            clip_duration: document.getElementById('job-clip-duration').value || 30,
            captions: document.getElementById('job-captions').checked,
            notes: document.getElementById('job-notes').value.trim()
        };

        if (!data.title) return showJobFormMsg('Informe o título do projeto.', false);
        if (data.source_type !== 'upload' && data.source_url && !isAcceptedSource(data.source_url)) {
            return showJobFormMsg('Link inválido. Use YouTube, Instagram ou TikTok.', false);
        }

        const btn = document.getElementById('btn-save-job');
        btn.disabled = true;
        btn.textContent = 'Salvando...';
        jobFormMsg.style.display = 'none';

        try {
            const url = id ? `${API_URL}/autocut/jobs/${id}` : `${API_URL}/autocut/jobs`;
            const method = id ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(data)
            });
            const result = await res.json();

            if (res.status === 401 || res.status === 403) {
                window.location.href = 'login.html';
                return;
            }

            if (result.success) {
                closeJobModal();
                loadJobs();
            } else {
                showJobFormMsg(result.message || 'Erro ao salvar projeto.', false);
                btn.disabled = false;
                btn.textContent = id ? 'Salvar Alterações' : 'Salvar Projeto';
            }
        } catch (err) {
            showJobFormMsg('Erro de conexão com o servidor.', false);
            btn.disabled = false;
            btn.textContent = id ? 'Salvar Alterações' : 'Salvar Projeto';
        }
    });

    // ============ MODAL CONFIRMAR PROCESSAMENTO ============
    const processModal = document.getElementById('process-modal');
    let pendingProcessId = null;

    document.getElementById('process-modal-close').addEventListener('click', closeProcessModal);
    document.getElementById('btn-cancel-process').addEventListener('click', closeProcessModal);
    processModal.addEventListener('click', (e) => { if (e.target === processModal) closeProcessModal(); });

    document.getElementById('btn-confirm-process').addEventListener('click', async () => {
        if (!pendingProcessId) return;
        const btn = document.getElementById('btn-confirm-process');
        const msg = document.getElementById('process-modal-msg');
        btn.disabled = true;
        btn.textContent = 'Iniciando...';
        msg.style.display = 'none';

        try {
            const res = await fetch(`${API_URL}/autocut/jobs/${pendingProcessId}/process`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            const result = await res.json();

            if (res.status === 401 || res.status === 403) {
                window.location.href = 'login.html';
                return;
            }

            if (result.success) {
                closeProcessModal();
                startPolling();
                loadJobs();
            } else {
                msg.className = 'auth-message error';
                msg.textContent = '❌ ' + (result.message || 'Erro ao iniciar processamento.');
                msg.style.display = 'block';
            }
        } catch (err) {
            msg.className = 'auth-message error';
            msg.textContent = '❌ Erro de conexão com o servidor.';
            msg.style.display = 'block';
        }

        btn.disabled = false;
        btn.textContent = 'Sim, processar';
        pendingProcessId = null;
    });

    // ============ CARREGAR PROJETOS ============
    loadJobs();
});

function openJobModal(job) {
    const form = document.getElementById('job-form');
    if (form) form.reset();

    document.getElementById('job-id').value = job ? job.id : '';
    document.getElementById('job-modal-title').textContent = job ? 'Editar Projeto de Corte' : 'Novo Projeto de Corte';
    document.getElementById('job-title').value = job ? job.title : '';
    document.getElementById('job-source-type').value = (job && job.source_type) || 'youtube';
    document.getElementById('job-source-url').value = (job && job.source_url) || '';
    document.getElementById('job-instagram').value = (job && job.instagram) ? '@' + job.instagram.replace(/^@/, '') : '';
    document.getElementById('job-clips-count').value = (job && job.clips_count) || 5;
    document.getElementById('job-clip-duration').value = (job && job.clip_duration) || 30;
    document.getElementById('job-captions').checked = job ? job.captions === 1 : true;
    document.getElementById('job-notes').value = (job && job.notes) || '';

    document.getElementById('btn-save-job').textContent = job ? 'Salvar Alterações' : 'Salvar Projeto';
    document.getElementById('job-form-msg').style.display = 'none';

    const sourceType = document.getElementById('job-source-type');
    const sourceUrlGroup = document.getElementById('source-url-group');
    sourceUrlGroup.style.display = sourceType.value === 'upload' ? 'none' : 'block';

    document.getElementById('job-modal').style.display = 'flex';
    document.getElementById('job-title').focus();
}

function closeJobModal() {
    document.getElementById('job-modal').style.display = 'none';
}

function showJobFormMsg(text, isSuccess) {
    const msg = document.getElementById('job-form-msg');
    msg.textContent = text;
    msg.className = 'auth-message ' + (isSuccess ? 'success' : 'error');
    msg.style.display = 'block';
}

function openProcessModal(id) {
    pendingProcessId = id;
    const msg = document.getElementById('process-modal-msg');
    msg.className = 'auth-message';
    msg.style.display = 'none';
    document.getElementById('process-modal').style.display = 'flex';
}

function closeProcessModal() {
    document.getElementById('process-modal').style.display = 'none';
    pendingProcessId = null;
}

// ============ CARREGAR PROJETOS ============
async function loadJobs() {
    const container = document.getElementById('jobs-list');
    try {
        const res = await fetch(`${API_URL}/autocut/jobs`, { headers: getAuthHeaders() });
        if (res.status === 401 || res.status === 403) {
            window.location.href = 'login.html';
            return;
        }
        const data = await res.json();
        if (!data.success) {
            container.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:40px 0;">Erro ao carregar projetos.</p>';
            return;
        }
        renderJobs(container, data.jobs || []);

        // Se ainda houver algum processando, continua verificando
        const processing = (data.jobs || []).some(j => j.status === 'processing');
        if (processing) startPolling(); else stopPolling();
    } catch (err) {
        container.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:40px 0;">Erro de conexão com o servidor.</p>';
    }
}

function renderJobs(container, jobs) {
    if (!jobs.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">✂️</div>
                <p>Ainda não há projetos de corte. Clique em "+ Novo Corte" para criar o primeiro.</p>
            </div>`;
        return;
    }

    container.innerHTML = jobs.map(job => {
        const status = statusHTML(job);
        const meta = [
            labelSource(job.source_type),
            job.instagram ? '@' + job.instagram : 'Sem @ informado',
            job.clips_count + ' cortes',
            job.clip_duration + 's cada'
        ].join(' • ');

        const actions = actionButtons(job);
        const progress = job.status === 'processing'
            ? `<div style="margin-top:14px;">
                 <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted); margin-bottom:6px;">
                     <span>Processando cortes...</span><span>${job.progress || 0}%</span>
                 </div>
                 <div style="height:8px; background:rgba(255,255,255,0.08); border-radius:50px; overflow:hidden;">
                     <div style="width:${job.progress || 0}%; height:100%; background:linear-gradient(90deg, var(--accent-purple), var(--accent-blue)); transition:width .4s;"></div>
                 </div>
               </div>`
            : '';

        return `
        <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle); border-radius:12px; padding:20px; margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap;">
                <div style="min-width:0;">
                    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                        <h4 style="margin:0; font-size:16px; font-weight:700; color:var(--text-primary);">${escapeHtml(job.title)}</h4>
                        ${status}
                    </div>
                    <p style="margin:8px 0 0; font-size:13px; color:var(--text-muted);">${meta}</p>
                    ${job.notes ? `<p style="margin:6px 0 0; font-size:12px; color:var(--text-secondary); opacity:.8;">📝 ${escapeHtml(job.notes)}</p>` : ''}
                    <p style="margin:6px 0 0; font-size:11px; color:var(--text-muted); opacity:.7;">Criado em ${formatDate(job.created_at)}${job.source_url ? ' • <a href="' + escapeHtml(job.source_url) + '" target="_blank" style="color:var(--accent-purple-light);">Ver fonte</a>' : ''}</p>
                </div>
                ${actions}
            </div>
            ${progress}
        </div>`;
    }).join('');
}

function statusHTML(job) {
    const styles = {
        created: { bg: 'rgba(116,185,255,0.12)', color: '#74b9ff', label: 'Criado' },
        processing: { bg: 'rgba(0,212,255,0.12)', color: '#00d4ff', label: 'Processando' },
        completed: { bg: 'rgba(0,184,148,0.12)', color: '#00b894', label: 'Concluído' }
    };
    const s = styles[job.status] || { bg: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)', label: job.status };
    return `<span style="font-size:11px; font-weight:600; padding:4px 12px; border-radius:50px; background:${s.bg}; color:${s.color};">${s.label}</span>`;
}

function actionButtons(job) {
    let html = '';
    if (job.status === 'created') {
        html += `<button class="btn-primary" style="padding:10px 16px; border:none; cursor:pointer; font-family:inherit; font-weight:600; font-size:13px;" onclick="openProcessModal(${job.id})">🎬 Processar</button>`;
    }
    if (job.status === 'completed') {
        const url = job.output_url || '#';
        html += `<a href="${escapeHtml(url)}" target="_blank" class="btn-primary" style="padding:10px 16px; text-decoration:none; font-family:inherit; font-weight:600; font-size:13px;">⬇️ Baixar cortes</a>`;
    }
    if (job.status !== 'processing') {
        html += `<button class="btn-ghost" onclick='editJob(${JSON.stringify(job).replace(/'/g, "&#39;")})'>✏️ Editar</button>`;
    }
    html += `<button class="btn-danger-ghost" onclick="deleteJob(${job.id}, '${String(job.title).replace(/'/g, '').replace(/"/g, '')}')">🗑️</button>`;
    return `<div class="table-actions">${html}</div>`;
}

window.editJob = function(job) {
    openJobModal(job);
};

window.deleteJob = async function(id, title) {
    if (!confirm(`Excluir o projeto "${title}"? Os cortes gerados serão removidos.`)) return;
    try {
        const res = await fetch(`${API_URL}/autocut/jobs/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const result = await res.json();
        if (result.success) {
            loadJobs();
        } else {
            alert('❌ ' + (result.message || 'Erro ao excluir projeto.'));
        }
    } catch (err) {
        alert('❌ Erro de conexão com o servidor.');
    }
};

// ============ POLLING DE PROCESSAMENTO ============
let pollTimer = null;

function startPolling() {
    stopPolling();
    pollTimer = setInterval(loadJobs, 3500);
}

function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

// ============ HELPERS ============
function isAcceptedSource(url) {
    return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|instagram\.com|tiktok\.com)/i.test(url.trim());
}

function labelSource(type) {
    const labels = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', upload: 'Upload manual' };
    return labels[type] || type || 'YouTube';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr.replace(' ', 'T'));
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}