/* ============================================
   HUB - Painel Geral Vísion Hub Web
   Dashboard de acesso aos sub-paineis
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    // Verificar se está logado
    const token = localStorage.getItem('vp_token');
    const userData = localStorage.getItem('vp_user');

    if (!token || !userData) {
        window.location.href = 'login.html';
        return;
    }

    const user = JSON.parse(userData);

    // Saudação
    document.getElementById('hub-greeting').textContent = `Olá, ${user.name}!`;
    document.getElementById('user-greeting').textContent = `Olá, ${user.name}`;

    // Botão Admin se o plano for administrador
    if (user.plan === 'admin') {
        const btnAdmin = document.getElementById('btn-admin-header');
        if (btnAdmin) btnAdmin.style.display = 'inline-block';

        // Card de hospedagem só para admins
        const hostingCard = document.getElementById('hub-card-hosting');
        if (hostingCard) hostingCard.style.display = 'flex';
    }

    // Logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            localStorage.removeItem('vp_token');
            localStorage.removeItem('vp_user');
            window.location.href = 'login.html';
        });
    }
});
