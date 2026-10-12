/* ============================================
   PRICING - Regras de preço por produto/período
   - InstaBot: preço cheio editável (product_prices)
   - Demais: standalone_ratio sozinho / combo_ratio no combo
   - Multi-conta: 1ª cheia + 80% por extra (mantido)
   ============================================ */
const { prepare } = require('./database');

const PERIOD_MONTHS = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
const PERIOD_LABELS = { mensal: 'Mensal (30 dias)', trimestral: 'Trimestral (3 meses)', semestral: 'Semestral (6 meses)', anual: 'Anual (12 meses)' };

function getProducts() {
    return prepare('SELECT code, name, standalone_ratio, combo_ratio, is_active FROM products ORDER BY sort').all();
}

function getPrices() {
    const rows = prepare('SELECT product_code, period, price FROM product_prices').all();
    const out = {};
    rows.forEach(r => {
        if (!out[r.product_code]) out[r.product_code] = {};
        out[r.product_code][r.period] = Number(r.price);
    });
    return out;
}

function getBasePrice(period) {
    const row = prepare('SELECT price FROM product_prices WHERE product_code = ? AND period = ?').get('instabot', period);
    if (!row) throw new Error('Período inválido ou sem preço: ' + period);
    return Number(row.price);
}

// items: ['instabot','autocut'] — retorna { lines:[{product, price}], total }
function quoteProducts(items, period) {
    if (!PERIOD_MONTHS[period]) throw new Error('Período inválido: ' + period);
    const products = getProducts().filter(p => p.is_active);
    const byCode = {};
    products.forEach(p => { byCode[p.code] = p; });

    const wanted = (items && items.length ? items : ['instabot'])
        .map(String).filter((c, i, a) => a.indexOf(c) === i && byCode[c]);
    if (!wanted.length) throw new Error('Nenhum produto válido.');

    const base = getBasePrice(period);
    const combo = wanted.indexOf('instabot') > -1 && wanted.length > 1;
    const lines = wanted.map(code => {
        let price;
        if (code === 'instabot') {
            const own = (getPrices()[code] || {})[period];
            price = own != null ? Number(own) : base;
        } else {
            const ratio = combo ? Number(byCode[code].combo_ratio) : Number(byCode[code].standalone_ratio);
            price = Math.round(base * ratio);
        }
        return { product: code, name: byCode[code].name, price };
    });
    const subtotal = lines.reduce((s, l) => s + l.price, 0);
    return { lines, subtotal, months: PERIOD_MONTHS[period], combo };
}

function quoteTotal(items, period, qtdContas) {
    const q = quoteProducts(items, period);
    const n = Math.max(1, parseInt(qtdContas) || 1);
    const total = Math.round(q.subtotal * (1 + (n - 1) * 0.80));
    return { ...q, qtdContas: n, total };
}

module.exports = { getProducts, getPrices, getBasePrice, quoteProducts, quoteTotal, PERIOD_MONTHS, PERIOD_LABELS };
