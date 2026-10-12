/* ============================================
   VISION PLUS - Backend Server
   Express + SQLite (sql.js) + JWT
   ============================================ */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Carregar variáveis do arquivo .env
const dotenvPath = path.join(__dirname, '.env');
if (fs.existsSync(dotenvPath)) {
    const dotenvContent = fs.readFileSync(dotenvPath, 'utf8');
    dotenvContent.split(/\r?\n/).forEach(line => {
        // Ignora comentários e linhas vazias
        if (!line.trim() || line.trim().startsWith('#')) return;
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            const key = match[1];
            let value = match[2] || '';
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.substring(1, value.length - 1);
            } else if (value.startsWith("'") && value.endsWith("'")) {
                value = value.substring(1, value.length - 1);
            }
            process.env[key] = value.trim();
        }
    });
}

const app = express();
const PORT = process.env.PORT || 3000;

// ============ MIDDLEWARE ============
// CORS restrito (antes: aberto p/ qualquer origem). Extensão (Instagram/Blogspot),
// localhost e o domínio precisam estar em ALLOWED_ORIGINS no .env
const { ALLOWED_ORIGINS } = require('./config');
app.use(cors({
    origin: function (origin, callback) {
        // Requisições sem origin (curl, app mobile, mesma origem, service workers) passam
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.indexOf(origin) !== -1) return callback(null, true);
        try {
            const u = new URL(origin);
            // Extensões do navegador (protocolo não falsificável por sites)
            if (u.protocol === 'chrome-extension:' || u.protocol === 'moz-extension:') return callback(null, true);
            const h = u.hostname;
            // Sites onde as extensões operam
            if (h.endsWith('.instagram.com') || h === 'instagram.com' ||
                h.endsWith('.blogspot.com') ||
                h.endsWith('.youtube.com') || h === 'youtube.com' || h === 'youtu.be' ||
                h === 'localhost') return callback(null, true);
        } catch (e) {}
        return callback(new Error('Origem não permitida pelo CORS'));
    }
}));
app.use(express.json({ limit: '100mb' })); // fotos/vídeos em base64 da fila de posts
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, '..')));

// ============ INICIALIZAÇÃO ASSÍNCRONA ============
async function startServer() {
    // Inicializar banco de dados
    const { initDatabase } = require('./database');
    await initDatabase();

    // Carregar rotas
    const publicRoutes = require('./routes/public');
    const authRoutes = require('./routes/auth');
    const licenseRoutes = require('./routes/license');
    const adminRoutes = require('./routes/admin');
    const supportRoutes = require('./routes/support');
    const paymentRoutes = require('./routes/payment');
    const aiSettingsRouter = require('./routes/ai-settings');
    const hostingRoutes = require('./routes/hosting');
    const autocutRoutes = require('./routes/autocut');
    const corteviralRoutes = require('./routes/corteviral');
    const postQueueRoutes = require('./routes/post-queue');
    const siteRoutes = require('./routes/site');

    app.use('/api', publicRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/license', licenseRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/support', supportRoutes);
    app.use('/api/payment', paymentRoutes);
    app.use('/api/hosting', hostingRoutes);
    app.use('/api/user/ai-settings', aiSettingsRouter);
    app.use('/api/ai', aiSettingsRouter); // O endpoint /generate também fica sob /api/ai/generate
    app.use('/api/autocut', autocutRoutes);
    app.use('/api/corteviral', corteviralRoutes);
    app.use('/api/post-queue', postQueueRoutes);
    app.use('/api/site', siteRoutes);

    // Rota de status da API
    app.get('/api/status', (req, res) => {
        res.json({
            status: 'online',
            version: '1.0.0',
            timestamp: new Date().toISOString()
        });
    });

    // Fallback - servir frontend
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'index.html'));
    });

    // Iniciar servidor
    app.listen(PORT, () => {
        console.log('');
        console.log('  ╔══════════════════════════════════════╗');
        console.log('  ║   Vision Plus API - Servidor Ativo   ║');
        console.log('  ╠══════════════════════════════════════╣');
        console.log(`  ║   URL: http://localhost:${PORT}          ║`);
        console.log('  ║   Status: ✅ Online                  ║');
        console.log('  ╚══════════════════════════════════════╝');
        console.log('');
    });
}

startServer().catch(err => {
    console.error('❌ Erro ao iniciar servidor:', err);
    process.exit(1);
});
