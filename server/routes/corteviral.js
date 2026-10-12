/* ============================================
   AUTO CUT ROUTES - Exportação real (ffmpeg)
   POST /api/corteviral/export → corta o vídeo no servidor
   GET  /api/corteviral/output/... → baixa os arquivos gerados
   ============================================ */

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { exportClips } = require('../services/corteviral-exporter');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const TEMP_DIR = path.join(__dirname, '..', 'temp');
[OUTPUT_DIR, TEMP_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ============ EXPORTAR CORTES ============
router.post('/export', async (req, res) => {
  try {
    const { videoId, videoUrl, clips, formats, subtitle, exportId, videoTitle, cropPos } = req.body;

    if (!videoId) return res.status(400).json({ error: 'videoId é obrigatório' });
    if (!clips || clips.length === 0) return res.status(400).json({ error: 'Nenhum corte selecionado' });

    console.log(`[EXPORT] Video: ${videoId}, Clips: ${clips.length}, Formatos: ${(formats || []).join(', ')}, Legenda: ${subtitle?.mode || 'none'}, Crop: ${cropPos || 'center'}`);

    const result = await exportClips({
      videoId,
      videoUrl,
      clips,
      formats: (formats && formats.length > 0 ? formats : ['tiktok']),
      subtitle,
      outputDir: OUTPUT_DIR,
      tempDir: TEMP_DIR,
      exportId: exportId || Date.now(),
      videoTitle: videoTitle || '',
      cropPos: ['top', 'center', 'bottom'].includes(cropPos) ? cropPos : 'center'
    });

    res.json(result);
  } catch (err) {
    console.error('[EXPORT ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============ LISTAR ARQUIVOS DE UM EXPORT ============
router.get('/exports/:name', (req, res) => {
  try {
    const name = path.basename(req.params.name);
    const dir = path.join(OUTPUT_DIR, name);
    if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Export não encontrado' });
    const files = fs.readdirSync(dir).filter(f => !f.startsWith('progress'));
    res.json({ success: true, name, files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ DOWNLOAD DE ARQUIVO GERADO ============
router.get('/output/:name/:file', (req, res) => {
  try {
    const name = path.basename(req.params.name);
    const file = path.basename(req.params.file);
    const filePath = path.join(OUTPUT_DIR, name, file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' });
    res.download(filePath, file);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;