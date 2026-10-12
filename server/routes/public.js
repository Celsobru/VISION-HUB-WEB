/* ============================================
   PUBLIC ROUTES - Catálogo de preços (sem auth)
   Site e painel cliente buscam daqui: valores
   sempre iguais aos configurados no admin.
   ============================================ */
const express = require('express');
const router = express.Router();
const { getProducts, getPrices, quoteProducts, PERIOD_MONTHS, PERIOD_LABELS } = require('../pricing');

// GET /api/catalog -> produtos, preços e cotações por período
router.get('/catalog', (req, res) => {
    try {
        const products = getProducts().filter(p => p.is_active);
        const prices = getPrices();
        const periods = {};
        Object.keys(PERIOD_MONTHS).forEach(period => {
            try {
                const solo = quoteProducts(['instabot'], period);
                let autocutSolo = null;
                let combo = null;
                if (products.some(p => p.code === 'autocut')) {
                    autocutSolo = quoteProducts(['autocut'], period);
                    combo = quoteProducts(['instabot', 'autocut'], period);
                }
                periods[period] = {
                    months: PERIOD_MONTHS[period],
                    label: PERIOD_LABELS[period],
                    instabot: solo.subtotal,
                    autocutSolo: autocutSolo ? autocutSolo.subtotal : null,
                    combo: combo ? combo.subtotal : null
                };
            } catch (e) { /* período sem preço: omitido */ }
        });
        res.json({ success: true, products, prices, periods });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao carregar catálogo.' });
    }
});

module.exports = router;
