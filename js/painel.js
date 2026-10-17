/* ============================================
   PAINEL - Dashboard JavaScript
   ============================================ */

const API_URL = window.location.origin + '/api';

document.addEventListener('DOMContentLoaded', () => {

    // Verificar se está logado
    const token = localStorage.getItem('vp_token');
    const userData = localStorage.getItem('vp_user');

    if (!token || !userData) {
        window.location.href = 'login.html';
        return;
    }

    const user = JSON.parse(userData);

    // Preencher dados do usuário
    document.getElementById('user-greeting').textContent = `Olá, ${user.name}`;
    document.getElementById('data-name').textContent = user.name;
    document.getElementById('data-email').textContent = user.email;
    document.getElementById('data-instagram').textContent = '@' + user.instagram;
    document.getElementById('data-since').textContent = formatDate(user.createdAt || user.trialStart);

    // Mostrar botão de Admin se o plano for administrador
    if (user.plan === 'admin') {
        const btnAdmin = document.getElementById('btn-admin-header');
        if (btnAdmin) {
            btnAdmin.style.display = 'inline-block';
        }
    }

    // Carregar status da licença do servidor
    loadLicenseStatus(user.instagram);

    // Carregar tutoriais dinâmicos
    loadPainelTutorials();

    // Configurar automação de IA
    setupAiPostingForm();

    // ============ LOGOUT ============
    document.getElementById('btn-logout').addEventListener('click', () => {
        localStorage.removeItem('vp_token');
        localStorage.removeItem('vp_user');
        window.location.href = 'login.html';
    });
});

async function loadLicenseStatus(instagram) {
    const card = document.getElementById('license-card');
    const icon = document.getElementById('license-icon');
    const title = document.getElementById('license-title');
    const subtitle = document.getElementById('license-subtitle');
    const planEl = document.getElementById('detail-plan');
    const expiryEl = document.getElementById('detail-expiry');
    const daysEl = document.getElementById('detail-days');
    const actionEl = document.getElementById('license-action');

    try {
        const response = await fetch(`${API_URL}/license/check?instagram=${instagram}`);
        const data = await response.json();

        if (data.licensed) {
            if (data.status === 'trial') {
                card.className = 'painel-card license-card trial';
                icon.textContent = '⏳';
                title.textContent = 'Período de Teste';
                subtitle.textContent = data.message;
                planEl.textContent = 'Trial (7 dias)';
            } else {
                card.className = 'painel-card license-card';
                icon.textContent = '✅';
                title.textContent = 'Licença Ativa';
                subtitle.textContent = data.message;
                const planLabels = { mensal: 'Mensal (30d)', trimestral: 'Trimestral (3m)', semestral: 'Semestral (6m)', anual: 'Anual (12m)', admin: 'Admin ∞' };
                planEl.textContent = planLabels[data.status] || data.status;
            }
            expiryEl.textContent = formatDate(data.expiresAt);
            daysEl.textContent = data.daysLeft + ' dia(s)';
        } else {
            card.className = 'painel-card license-card expired';
            icon.textContent = '🔒';
            title.textContent = 'Licença Expirada';
            subtitle.textContent = data.message || 'Renove para continuar usando a extensão';
            planEl.textContent = 'Expirado';
            expiryEl.textContent = '-';
            daysEl.textContent = '0';
            actionEl.style.display = 'block';
        }

    } catch (err) {
        // Usar dados locais como fallback
        const user = JSON.parse(localStorage.getItem('vp_user') || '{}');
        title.textContent = 'Erro ao verificar';
        subtitle.textContent = 'Não foi possível conectar ao servidor. Usando dados locais.';
        planEl.textContent = user.plan || '-';
        expiryEl.textContent = formatDate(user.trialEnd || user.subscriptionEnd);
        daysEl.textContent = '-';
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// ============ MULTI-CONTA: Seletor de quantidade ============
let BASE_PRICES = { mensal: 79, trimestral: 180, semestral: 299, anual: 499 };
let COMBO_PRICES = { mensal: 111, trimestral: 252, semestral: 419, anual: 699 };
let qtdContas = 1;

// ============ BUNDLE: Só InstaBot x Combo ============
let bundle = 'instabot';
let bundleProducts = ['instabot'];

function setBundle(mode) {
    bundle = (mode === 'combo') ? 'combo' : 'instabot';
    bundleProducts = (bundle === 'combo') ? ['instabot', 'autocut'] : ['instabot'];
    const btnIb = document.getElementById('bundle-ib');
    const btnCombo = document.getElementById('bundle-combo');
    if (btnIb) { btnIb.classList.toggle('featured', bundle === 'instabot'); btnIb.style.opacity = bundle === 'instabot' ? '1' : '0.7'; }
    if (btnCombo) { btnCombo.classList.toggle('featured', bundle === 'combo'); btnCombo.style.opacity = bundle === 'combo' ? '1' : '0.7'; }
    updatePrices();
}
window.setBundle = setBundle;

async function loadCatalogPrices() {
    try {
        const res = await fetch(`${API_URL}/catalog`);
        const data = await res.json();
        const periods = (data && data.periods) || {};
        let changed = false;
        ['mensal', 'trimestral', 'semestral', 'anual'].forEach(function (plan) {
            if (periods[plan] && periods[plan].instabot != null && isFinite(Number(periods[plan].instabot))) {
                BASE_PRICES[plan] = Number(periods[plan].instabot);
                changed = true;
            }
            if (periods[plan] && periods[plan].combo != null && isFinite(Number(periods[plan].combo))) {
                COMBO_PRICES[plan] = Number(periods[plan].combo);
                changed = true;
            }
        });
        if (changed) updatePrices();
    } catch (err) { /* fallback: mantém preços estáticos */ }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadCatalogPrices);
} else {
    loadCatalogPrices();
}

function changeQtd(delta) {
    qtdContas = Math.max(1, Math.min(10, qtdContas + delta));
    document.getElementById('qtd-contas').textContent = qtdContas;
    updatePrices();
    updateExtraInputs();
}

function updatePrices() {
    const multiplier = 1 + (qtdContas - 1) * 0.80;
    const monthsMap = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
    const table = (bundle === 'combo') ? COMBO_PRICES : BASE_PRICES;
    for (const [plan, base] of Object.entries(table)) {
        const priceEl = document.getElementById('price-' + plan);
        const periodEl = document.getElementById('period-' + plan);
        if (!priceEl || !periodEl) continue;
        const total = Math.round(base * multiplier);
        priceEl.textContent = total;
        const months = monthsMap[plan] || 1;
        periodEl.textContent = `${months} ${months === 1 ? 'mês' : 'meses'} • R$ ${(total / months).toFixed(2).replace('.', ',')}/mês${qtdContas > 1 ? ' • ' + qtdContas + ' contas' : ''}`;
    }
}

function updateExtraInputs() {
    const container = document.getElementById('extra-ig-inputs');
    if (qtdContas <= 1) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    container.style.display = 'block';
    let html = '<label style="font-size:12px; opacity:0.7; margin-bottom:4px; display:block;">Informe os @ adicionais:</label>';
    for (let i = 2; i <= qtdContas; i++) {
        html += `<input type="text" id="extra-ig-${i}" placeholder="@ da conta ${i}" style="width:100%; padding:8px 12px; margin-bottom:6px; border-radius:8px; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.05); color:#fff; font-size:13px;">`;
    }
    container.innerHTML = html;
}

// ============ COMPRAR PLANO VIA MERCADO PAGO ============
async function buyPlan(plan) {
    const statusDiv = document.getElementById('payment-status');
    const user = JSON.parse(localStorage.getItem('vp_user') || '{}');

    if (!user.email) {
        alert('Você precisa estar logado para comprar.');
        return;
    }

    // Coletar @ adicionais
    const extraInstagrams = [];
    for (let i = 2; i <= qtdContas; i++) {
        const input = document.getElementById('extra-ig-' + i);
        if (input) {
            const val = input.value.replace('@', '').trim().toLowerCase();
            if (val) extraInstagrams.push(val);
        }
    }

    if (qtdContas > 1 && extraInstagrams.length < qtdContas - 1) {
        alert('Preencha todos os @ adicionais antes de comprar.');
        return;
    }

    // Desabilitar botões de compra (só os da grade de planos; preserva o toggle de bundle)
    document.querySelectorAll('.plans-grid .btn-buy').forEach(b => { b.disabled = true; b.textContent = 'Processando...'; });
    
    statusDiv.style.display = 'block';
    statusDiv.style.background = 'rgba(108, 92, 231, 0.15)';
    statusDiv.style.color = '#a29bfe';
    statusDiv.textContent = '⏳ Criando checkout no Mercado Pago...';

    try {
        const response = await fetch(`${API_URL}/payment/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan, email: user.email, qtdContas, extraInstagrams, products: bundleProducts })
        });

        const data = await response.json();

        if (data.success) {
            statusDiv.style.background = 'rgba(0, 184, 148, 0.15)';
            statusDiv.style.color = '#00b894';
            statusDiv.textContent = '✅ Redirecionando para o pagamento...';
            
            // Usar sandbox para teste, init_point para produção
            const checkoutUrl = data.sandboxInitPoint || data.initPoint;
            setTimeout(() => { window.location.href = checkoutUrl; }, 1000);
        } else {
            statusDiv.style.background = 'rgba(231, 76, 60, 0.15)';
            statusDiv.style.color = '#e74c3c';
            statusDiv.textContent = '❌ ' + data.message;
            document.querySelectorAll('.plans-grid .btn-buy').forEach(b => { b.disabled = false; });
            document.querySelector('.plans-grid .btn-buy.featured').textContent = 'Comprar';
            document.querySelectorAll('.plans-grid .btn-buy:not(.featured)').forEach(b => { b.textContent = 'Comprar'; });
        }
    } catch (err) {
        statusDiv.style.background = 'rgba(231, 76, 60, 0.15)';
        statusDiv.style.color = '#e74c3c';
        statusDiv.textContent = '❌ Erro ao conectar com o servidor.';
        document.querySelectorAll('.plans-grid .btn-buy').forEach(b => { b.disabled = false; });
        document.querySelector('.plans-grid .btn-buy.featured').textContent = 'Comprar';
        document.querySelectorAll('.plans-grid .btn-buy:not(.featured)').forEach(b => { b.textContent = 'Comprar'; });
    }
}

// ============ REGISTRAR DOWNLOAD ============
async function trackDownload(e) {
    e.preventDefault();
    const user = JSON.parse(localStorage.getItem('vp_user') || '{}');
    
    // Registrar download no servidor
    try {
        await fetch(`${API_URL}/admin/download-track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email || '' })
        });
    } catch (err) { /* silencioso */ }

    // Redirecionar para o download (build corrigida, hospedada no próprio servidor)
    window.open('/downloads/instabot-extension.zip', '_blank');
}

// ============ VIDEO MODAL ============
window.openVideoModal = function(videoUrl) {
    const modal = document.getElementById('video-modal');
    const iframe = document.getElementById('video-iframe');
    if (modal && iframe) {
        iframe.src = videoUrl;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Evita scroll na página principal
    }
};

window.closeVideoModal = function() {
    const modal = document.getElementById('video-modal');
    const iframe = document.getElementById('video-iframe');
    if (modal && iframe) {
        iframe.src = ''; // Para o vídeo
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
};

// Fechar modal ao clicar fora
document.addEventListener('click', (e) => {
    const modal = document.getElementById('video-modal');
    if (e.target === modal) {
        window.closeVideoModal();
    }
});

// ============ CARREGAR TUTORIAIS DINÂMICOS ============
async function loadPainelTutorials() {
    const container = document.getElementById('tutorials-buttons');
    const section = document.getElementById('tutorials-section');
    if (!container) return;

    try {
        const res = await fetch(`${API_URL}/admin/tutorials/public`);
        const data = await res.json();

        if (!data.success || !data.tutorials || data.tutorials.length === 0) {
            container.innerHTML = '<span style="color: var(--text-muted); font-size: 14px;">Nenhum tutorial disponível no momento.</span>';
            return;
        }

        container.innerHTML = data.tutorials.map(t => `
            <button class="btn-video" onclick="openVideoModal('${t.url}')">
                <span class="play-icon">▶</span> ${t.title}
            </button>
        `).join('');

    } catch (err) {
        container.innerHTML = '<span style="color: var(--text-muted); font-size: 14px;">Não foi possível carregar os tutoriais.</span>';
    }
}

// ============ AUTOMAÇÃO DE IA ============
function setupAiPostingForm() {
    const form = document.getElementById('formAiSettings');
    if (!form) return;

    const token = localStorage.getItem('vp_token');
    const nicheProductInput = document.getElementById('nicheProduct');
    const nicheProductWrapper = document.getElementById('nicheProductWrapper');
    const saveMsg = document.getElementById('ai-save-msg');

    // Controlar visibilidade do nicho com base no modo selecionado
    const toggleNicheInput = (mode) => {
        if (mode === 'auto') {
            nicheProductWrapper.style.display = 'none';
        } else {
            nicheProductWrapper.style.display = 'flex';
        }
    };

    // Escutar mudança nos botões de rádio do modo de nicho
    document.querySelectorAll('input[name="nicheMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            toggleNicheInput(e.target.value);
        });
    });

    // 1. Carregar Configurações de IA
    fetch(`${API_URL}/user/ai-settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
        const mode = data.niche_mode || 'manual';
        const radio = document.querySelector(`input[name="nicheMode"][value="${mode}"]`);
        if (radio) radio.checked = true;
        toggleNicheInput(mode);

        document.getElementById('nicheProduct').value = data.niche_product || '';
        document.getElementById('instructions').value = data.instructions || '';
        document.getElementById('postTime').value = data.post_time || '09:00';
        document.getElementById('isEnabled').checked = data.is_enabled === 1;

        // Marcar dias ativos
        const activeDays = (data.post_days || '').split(',');
        document.querySelectorAll('.ai-day').forEach(cb => {
            cb.checked = activeDays.includes(cb.value);
        });
    })
    .catch(err => {
        console.error('Erro ao carregar configurações de IA:', err);
    });

    // 2. Salvar Configurações de IA
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Mostrar salvando
        saveMsg.style.color = 'var(--text-secondary)';
        saveMsg.textContent = 'Salvando...';
        saveMsg.style.display = 'inline';

        const nicheMode = document.querySelector('input[name="nicheMode"]:checked').value;
        const postDays = Array.from(document.querySelectorAll('.ai-day:checked')).map(cb => cb.value).join(',');
        
        const payload = {
            niche_mode: nicheMode,
            niche_product: nicheProductInput.value,
            instructions: document.getElementById('instructions').value,
            post_time: document.getElementById('postTime').value,
            post_days: postDays,
            is_enabled: document.getElementById('isEnabled').checked
        };

        try {
            const res = await fetch(`${API_URL}/user/ai-settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                saveMsg.style.color = '#2ed573';
                saveMsg.textContent = '✅ Salvo com sucesso!';
            } else {
                saveMsg.style.color = '#ff4757';
                saveMsg.textContent = '❌ ' + (data.message || 'Erro ao salvar.');
            }
        } catch (err) {
            saveMsg.style.color = '#ff4757';
            saveMsg.textContent = '❌ Erro de conexão.';
        }

        // Esconder após 3s
        setTimeout(() => {
            saveMsg.style.display = 'none';
        }, 3000);
    });
}
