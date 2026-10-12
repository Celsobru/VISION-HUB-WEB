/* ============================================
   VISION PLUS - Config central (segredos via .env)
   NUNCA commite valores reais aqui: use o .env
   (que NÃO sobe para o servidor público / git).
   ============================================ */

function required(name, fallback) {
    if (process.env[name]) return process.env[name];
    if (fallback) return fallback;
    console.error('❌ Variável de ambiente obrigatória ausente: ' + name);
    process.exit(1);
}

// JWT: invalida TODOS os logins ao trocar (esperado ao subir p/ produção)
const JWT_SECRET = process.env.JWT_SECRET || null;
if (!JWT_SECRET) {
    console.error('❌ Defina JWT_SECRET no .env antes de subir para produção.');
    process.exit(1);
}

// Mercado Pago: em produção use token APP-... (nunca TEST-...); via .env
const MP_ACCESS_TOKEN = required('MP_ACCESS_TOKEN', null);

// CORS: origens permitidas (CSV no .env ou padrão seguro)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
    'http://localhost:3009,https://visionhubweb.com.br,https://www.visionhubweb.com.br,https://www.instagram.com,https://automatizadorvisionplus.blogspot.com'
).split(',').map(function (s) { return s.trim(); }).filter(Boolean);

module.exports = { JWT_SECRET, MP_ACCESS_TOKEN, ALLOWED_ORIGINS };
