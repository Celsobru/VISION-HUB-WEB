/* ============================================
   AUTH - Login & Register JavaScript
   Conectado à API real do backend
   ============================================ */

// URL base da API - mude para o domínio real em produção
const API_URL = window.location.origin + '/api';

document.addEventListener('DOMContentLoaded', () => {

    // ============ TOGGLE PASSWORD VISIBILITY ============
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const wrapper = btn.closest('.password-wrapper');
            const input = wrapper.querySelector('input');
            
            if (input.type === 'password') {
                input.type = 'text';
                btn.textContent = '🙈';
            } else {
                input.type = 'password';
                btn.textContent = '👁️';
            }
        });
    });

    // ============ LOGIN FORM ============
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('btn-submit');
            const msg = document.getElementById('auth-message');
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;

            btn.disabled = true;
            btn.textContent = 'Entrando...';
            msg.className = 'auth-message';
            msg.style.display = 'none';

            try {
                const response = await fetch(`${API_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();
                
                if (data.success) {
                    msg.className = 'auth-message success';
                    msg.textContent = '✅ Login realizado com sucesso! Redirecionando...';
                    msg.style.display = 'block';
                    
                    // Salvar token e dados do usuário
                    localStorage.setItem('vp_token', data.token);
                    localStorage.setItem('vp_user', JSON.stringify(data.user));
                    
                    setTimeout(() => {
                        window.location.href = 'painel.html';
                    }, 1000);
                } else {
                    msg.className = 'auth-message error';
                    msg.textContent = '❌ ' + data.message;
                    msg.style.display = 'block';
                }
            } catch (err) {
                msg.className = 'auth-message error';
                msg.textContent = '❌ Erro ao conectar ao servidor. Tente novamente.';
                msg.style.display = 'block';
            }

            btn.disabled = false;
            btn.textContent = 'Entrar';
        });
    }

    // ============ REGISTER FORM ============
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('btn-submit');
            const msg = document.getElementById('auth-message');
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const phone = document.getElementById('phone') ? document.getElementById('phone').value.trim() : '';
            const instagram = document.getElementById('instagram').value.trim().replace('@', '');
            const password = document.getElementById('password').value;
            const passwordConfirm = document.getElementById('password-confirm').value;

            msg.className = 'auth-message';
            msg.style.display = 'none';

            // Validações do frontend
            if (password !== passwordConfirm) {
                msg.className = 'auth-message error';
                msg.textContent = '❌ As senhas não coincidem.';
                msg.style.display = 'block';
                return;
            }

            if (password.length < 6) {
                msg.className = 'auth-message error';
                msg.textContent = '❌ A senha deve ter no mínimo 6 caracteres.';
                msg.style.display = 'block';
                return;
            }

            if (!instagram) {
                msg.className = 'auth-message error';
                msg.textContent = '❌ Informe o @ do Instagram.';
                msg.style.display = 'block';
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Criando conta...';

            try {
                const response = await fetch(`${API_URL}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, instagram, password, phone })
                });

                const data = await response.json();
                
                if (data.success) {
                    msg.className = 'auth-message success';
                    msg.textContent = '✅ Conta criada com sucesso! Redirecionando...';
                    msg.style.display = 'block';
                    
                    localStorage.setItem('vp_token', data.token);
                    localStorage.setItem('vp_user', JSON.stringify(data.user));
                    
                    setTimeout(() => {
                        window.location.href = 'painel.html';
                    }, 1000);
                } else {
                    msg.className = 'auth-message error';
                    msg.textContent = '❌ ' + data.message;
                    msg.style.display = 'block';
                }
            } catch (err) {
                msg.className = 'auth-message error';
                msg.textContent = '❌ Erro ao conectar ao servidor. Tente novamente.';
                msg.style.display = 'block';
            }

            btn.disabled = false;
            btn.textContent = 'Criar Conta Grátis';
        });
    }

    // ============ PASSWORD RESET LOGIC ============
    const btnForgot = document.getElementById('btn-forgot-password');
    const resetModal = document.getElementById('reset-modal');
    const resetClose = document.getElementById('reset-modal-close');

    if (btnForgot && resetModal) {
        btnForgot.addEventListener('click', (e) => {
            e.preventDefault();
            resetModal.style.display = 'flex';
            document.getElementById('reset-step-1').style.display = 'block';
            document.getElementById('reset-step-2').style.display = 'none';
            document.getElementById('reset-msg-1').style.display = 'none';
            document.getElementById('reset-msg-2').style.display = 'none';
        });

        resetClose.addEventListener('click', () => {
            resetModal.style.display = 'none';
        });

        // Step 1: Verify
        document.getElementById('reset-step-1').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('reset-email').value.trim();
            const phone = document.getElementById('reset-phone').value.trim();
            const btn = document.getElementById('btn-reset-verify');
            const msg = document.getElementById('reset-msg-1');

            btn.disabled = true;
            btn.textContent = 'Verificando...';
            msg.style.display = 'none';
            msg.className = 'auth-message';

            try {
                const response = await fetch(`${API_URL}/auth/request-reset`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, phone })
                });
                const data = await response.json();

                if (data.success) {
                    // Go to step 2 — o código chega pelo WhatsApp (nunca pela rede)
                    document.getElementById('reset-token').value = '';
                    document.getElementById('reset-step-1').style.display = 'none';
                    document.getElementById('reset-step-2').style.display = 'block';
                    msg.className = 'auth-message success';
                    msg.textContent = '✅ ' + (data.message || 'Código enviado pelo WhatsApp.');
                    msg.style.display = 'block';
                } else {
                    msg.className = 'auth-message error';
                    msg.textContent = '❌ ' + data.message;
                    msg.style.display = 'block';
                }
            } catch (err) {
                msg.className = 'auth-message error';
                msg.textContent = '❌ Erro de conexão.';
                msg.style.display = 'block';
            }
            btn.disabled = false;
            btn.textContent = 'Verificar Dados';
        });

        // Step 2: Confirm
        document.getElementById('reset-step-2').addEventListener('submit', async (e) => {
            e.preventDefault();
            const token = document.getElementById('reset-token').value;
            const new_password = document.getElementById('reset-new-password').value;
            const new_password_confirm = document.getElementById('reset-confirm-password').value;
            const btn = document.getElementById('btn-reset-confirm');
            const msg = document.getElementById('reset-msg-2');

            btn.disabled = true;
            btn.textContent = 'Salvando...';
            msg.style.display = 'none';
            msg.className = 'auth-message';

            try {
                const response = await fetch(`${API_URL}/auth/reset-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, new_password, new_password_confirm })
                });
                const data = await response.json();

                if (data.success) {
                    msg.className = 'auth-message success';
                    msg.textContent = '✅ ' + data.message;
                    msg.style.display = 'block';
                    setTimeout(() => {
                        resetModal.style.display = 'none';
                    }, 3000);
                } else {
                    msg.className = 'auth-message error';
                    msg.textContent = '❌ ' + data.message;
                    msg.style.display = 'block';
                }
            } catch (err) {
                msg.className = 'auth-message error';
                msg.textContent = '❌ Erro de conexão.';
                msg.style.display = 'block';
            }
            btn.disabled = false;
            btn.textContent = 'Salvar Nova Senha';
        });
    }
});
