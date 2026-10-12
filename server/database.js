/* ============================================
   DATABASE - SQLite Setup (sql.js - pure JS)
   ============================================ */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'visionplus.db');
const BACKUP_DIR = path.join(__dirname, 'backups');

let db = null;

function dbHasUsers(sqlDb) {
  try {
    const t = sqlDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
    if (!t.length || !t[0].values.length) return false;
    const rows = sqlDb.exec('SELECT COUNT(*) AS c FROM users');
    return rows.length > 0 && Number(rows[0].values[0][0]) > 0;
  } catch (e) { return false; }
}

function tryRestoreFromBackup(SQL) {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return null;
    const candidates = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.db') && !f.includes('VAZIO'))
      .map(f => ({ name: f, path: path.join(BACKUP_DIR, f), mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const c of candidates) {
      try {
        const test = new SQL.Database(fs.readFileSync(c.path));
        if (dbHasUsers(test)) return test;
      } catch (e) { /* tenta o próximo */ }
    }
  } catch (e) {}
  return null;
}

async function initDatabase() {
    const SQL = await initSqlJs();

    // Carregar banco existente ou criar novo
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        try {
            db = new SQL.Database(buffer);
        } catch (e) {
            console.log('  ⚠️ Banco corrompido (' + e.message + '). Tentando recuperar de backup...');
            db = tryRestoreFromBackup(SQL);
            if (!db) throw e;
        }
    } else {
        db = new SQL.Database();
    }

    // SEgurança: se o banco existir mas estiver vazio (usucruio de gravação interrompida),
    // restaura o backup mais recente que contenha usuários.
    if (!dbHasUsers(db)) {
        const restored = tryRestoreFromBackup(SQL);
        if (restored) {
            console.log('  🛡️ Banco estava vazio/sem usuários — restaurado backup mais recente automaticamente.');
            db = restored;
        }
    }

    // Criar tabelas
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            instagram TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            phone TEXT,
            plan TEXT DEFAULT 'trial',
            trial_start TEXT,
            trial_end TEXT,
            subscription_start TEXT,
            subscription_end TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Adicionar a coluna phone se não existir (para bancos legados)
    try {
        db.run("ALTER TABLE users ADD COLUMN phone TEXT;");
    } catch (e) { /* Coluna já existe */ }

    // Tabela de administradores
    db.run(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Verificar se existe um admin; se não, criar padrao
    const adminCheck = db.prepare('SELECT id FROM admins').step();
    if (!adminCheck) {
        // Senha padrão hasheada: Admin@2026
        // Gerada via bcrypt: $2a$10$Q.O/R... (Vou usar um hash gerado com o mesmo valor localmente)
        const bcrypt = require('bcryptjs');
        const defaultHash = bcrypt.hashSync('Admin@2026', 10);
        db.run('INSERT INTO admins (name, email, password) VALUES (?, ?, ?)', ['Administrador Geral', 'admin@visionplus.com', defaultHash]);
    }

    // Tabela de redefinição de senhas
    db.run(`
        CREATE TABLE IF NOT EXISTS password_resets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            plan TEXT NOT NULL,
            payment_method TEXT,
            payment_id TEXT,
            status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS license_checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            instagram TEXT NOT NULL,
            ip_address TEXT,
            result TEXT,
            checked_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS support_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            instagram TEXT,
            subject TEXT NOT NULL,
            message TEXT NOT NULL,
            status TEXT DEFAULT 'open',
            created_at TEXT DEFAULT (datetime('now')),
            resolved_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            email TEXT,
            ip_address TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS tutorials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS user_instagrams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            instagram TEXT NOT NULL UNIQUE,
            plan TEXT DEFAULT 'trial',
            plan_start TEXT,
            plan_end TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Migrar @ existentes da tabela users para user_instagrams (se ainda não migrados)
    try {
        const users = [];
        const stmt = db.prepare('SELECT id, instagram, plan, trial_start, trial_end, subscription_start, subscription_end FROM users WHERE instagram IS NOT NULL AND instagram != ""');
        while (stmt.step()) { users.push(stmt.getAsObject()); }
        stmt.free();

        users.forEach(u => {
            const existing = db.prepare("SELECT id FROM user_instagrams WHERE instagram = ?");
            existing.bind([u.instagram]);
            if (!existing.step()) {
                const planEnd = u.subscription_end || u.trial_end;
                const planStart = u.subscription_start || u.trial_start;
                db.run("INSERT INTO user_instagrams (user_id, instagram, plan, plan_start, plan_end) VALUES (?, ?, ?, ?, ?)",
                    [u.id, u.instagram, u.plan, planStart, planEnd]);
            }
            existing.free();
        });
    } catch (e) { /* migração já feita ou tabela vazia */ }

    // Tabela de clientes de hospedagem (sites, VPS e aplicativos)
    db.run(`
        CREATE TABLE IF NOT EXISTS hosting_clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_name TEXT NOT NULL,
            email TEXT,
            domain TEXT,
            app_name TEXT,
            type TEXT DEFAULT 'site',
            plan TEXT DEFAULT 'basico',
            directory TEXT,
            start_command TEXT,
            port INTEGER,
            status TEXT DEFAULT 'stopped',
            pid INTEGER,
            notes TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Tabela para configurações de postagem por IA
    db.run(`
        CREATE TABLE IF NOT EXISTS user_ai_posting_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            niche_mode TEXT DEFAULT 'manual',
            niche_product TEXT,
            instructions TEXT,
            post_time TEXT DEFAULT '09:00',
            post_days TEXT DEFAULT '1,2,3,4,5',
            is_enabled INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // ============ PRODUTOS / PREÇOS / DIREITOS POR EXTENSÃO ============
    // products: catálogo (instabot = preço cheio; demais via ratio do instabot)
    db.run(`
        CREATE TABLE IF NOT EXISTS products (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            standalone_ratio REAL DEFAULT 1.0,
            combo_ratio REAL DEFAULT 1.0,
            is_active INTEGER DEFAULT 1,
            sort INTEGER DEFAULT 0
        )
    `);
    // Preços do produto-base por período (trimestral/semestral/anual)
    db.run(`
        CREATE TABLE IF NOT EXISTS product_prices (
            product_code TEXT NOT NULL,
            period TEXT NOT NULL,
            price REAL NOT NULL,
            PRIMARY KEY (product_code, period)
        )
    `);
    // Direitos do cliente por produto (o admin liga/desliga cada extensão)
    db.run(`
        CREATE TABLE IF NOT EXISTS user_products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            product_code TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            plan TEXT DEFAULT 'trial',
            plan_start TEXT,
            plan_end TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, product_code),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Seed de produtos e preços (não sobrescreve edições do admin)
    try {
        const seedProducts = [
            ['instabot', 'InstaBot', 1.0, 1.0, 1, 1],
            ['autocut', 'Auto Cut', 0.6, 0.4, 1, 2]
        ];
        seedProducts.forEach(p => {
            db.run('INSERT OR IGNORE INTO products (code, name, standalone_ratio, combo_ratio, is_active, sort) VALUES (?, ?, ?, ?, ?, ?)', p);
        });
        const seedPrices = [
            ['instabot', 'mensal', 79],
            ['instabot', 'trimestral', 180],
            ['instabot', 'semestral', 299],
            ['instabot', 'anual', 499]
        ];
        seedPrices.forEach(p => {
            db.run('INSERT OR IGNORE INTO product_prices (product_code, period, price) VALUES (?, ?, ?)', p);
        });
    } catch (e) { console.log('  ⚠️ Seed de produtos:', e.message); }

    // Migração: clientes existentes ganham direitos conforme o plano atual (trial = combo)
    try {
        const users = [];
        const ustmt = db.prepare('SELECT id, plan, trial_start, trial_end, subscription_start, subscription_end FROM users');
        while (ustmt.step()) { users.push(ustmt.getAsObject()); }
        ustmt.free();
        const prods = [];
        const pstmt = db.prepare("SELECT code FROM products WHERE is_active = 1");
        while (pstmt.step()) { prods.push(pstmt.getAsObject().code); }
        pstmt.free();
        users.forEach(u => {
            const planEnd = u.subscription_end || u.trial_end;
            const planStart = u.subscription_start || u.trial_start;
            prods.forEach(code => {
                db.run('INSERT OR IGNORE INTO user_products (user_id, product_code, is_active, plan, plan_start, plan_end) VALUES (?, ?, 1, ?, ?, ?)',
                    [u.id, code, u.plan || 'trial', planStart, planEnd]);
            });
        });
    } catch (e) { console.log('  ⚠️ Migração user_products:', e.message); }

    // Tabela de projetos de corte (Auto Cut)
    db.run(`
        CREATE TABLE IF NOT EXISTS autocut_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            source_url TEXT,
            source_type TEXT DEFAULT 'youtube',
            instagram TEXT,
            clip_duration INTEGER DEFAULT 30,
            clips_count INTEGER DEFAULT 5,
            captions INTEGER DEFAULT 0,
            schedule_type TEXT DEFAULT 'immediate',
            scheduled_at TEXT,
            status TEXT DEFAULT 'created',
            progress INTEGER DEFAULT 0,
            output_url TEXT,
            notes TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // ============ CONTEÚDO EDITÁVEL DO SITE (editor no painel) ============
    // Guarda textos/imagens/editais por página. key = caminho do elemento no DOM.
    db.run(`
        CREATE TABLE IF NOT EXISTS site_content (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(page, key)
        )
    `);

    // Clientes exibidos na vitrine pública (página clientes.html)
    db.run(`
        CREATE TABLE IF NOT EXISTS site_clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            url TEXT,
            type TEXT,
            logo TEXT,
            sort INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Backup automático diário (um por dia) para garantir recuperação
    if (dbHasUsers(db)) {
        const today = new Date().toISOString().split('T')[0];
        const daily = path.join(BACKUP_DIR, `visionplus-auto-${today}.db`);
        try {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
            if (!fs.existsSync(daily)) {
                saveDatabase();
                fs.copyFileSync(DB_PATH, daily);
                console.log(`  🗄️ Backup diário criado: ${daily}`);
            }
        } catch (e) { console.log('  ⚠️ Não foi possível criar o backup diário:', e.message); }
    }

    saveDatabase();
    console.log('  ✅ Banco de dados inicializado');
    return db;
}

function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        // Gravação ATÔMICA: grava em .tmp e renomeia — interrupção nunca deixa o .db truncado
        const tmp = DB_PATH + '.tmp';
        fs.writeFileSync(tmp, buffer);
        fs.renameSync(tmp, DB_PATH);
    }
}

function getDb() {
    return db;
}

// Helpers para facilitar queries
function prepare(sql) {
    return {
        get(...params) {
            const stmt = db.prepare(sql);
            stmt.bind(params);
            if (stmt.step()) {
                const row = stmt.getAsObject();
                stmt.free();
                return row;
            }
            stmt.free();
            return null;
        },
        all(...params) {
            const results = [];
            const stmt = db.prepare(sql);
            stmt.bind(params);
            while (stmt.step()) {
                results.push(stmt.getAsObject());
            }
            stmt.free();
            return results;
        },
        run(...params) {
            db.run(sql, params);
            const lastInsertRowid = getLastInsertId();
            saveDatabase();
            return { lastInsertRowid };
        }
    };
}

function getLastInsertId() {
    const stmt = db.prepare('SELECT last_insert_rowid() as id');
    stmt.step();
    const result = stmt.getAsObject();
    stmt.free();
    return result.id;
}

module.exports = { initDatabase, getDb, prepare, saveDatabase };
