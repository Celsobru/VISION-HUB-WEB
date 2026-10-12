/* ============================================
   VISION PLUS - Fila de Posts (pasta local)
   Foto + vídeo + legenda agrupados pelo número final:
     imagem1.jpg + video1.mp4 + txt1.txt  ->  posta foto, depois reels, mesma legenda
     foto1.jpg + foto1.txt                ->  só foto (legado)
   Entrega 1 mídia por vez e apaga após confirmação.
   O .txt só é apagado quando não resta mídia do grupo.
   Pasta: server/post-queue/ (ou por cliente: post-queue/<instagram>/)
   No VPS: apontar POST_QUEUE_DIR para o volume.
   ============================================ */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const router = express.Router();

const QUEUE_BASE = process.env.POST_QUEUE_DIR || path.join(__dirname, '..', 'post-queue');
const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';

// Move o átomo moov para o início do MP4 (faststart) sem re-encodar.
// Sem isso o Instagram web rejeita o vídeo em silêncio.
function faststartVideo(filePath) {
    return new Promise(function (resolve) {
        var tmp = filePath + '.fast.mp4';
        execFile(FFMPEG_BIN, ['-y', '-v', 'error', '-i', filePath, '-c', 'copy', '-movflags', '+faststart', tmp], { timeout: 180000 }, function (err) {
            if (err) {
                try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (e) {}
                resolve(false);
                return;
            }
            try {
                fs.renameSync(tmp, filePath);
                resolve(true);
            } catch (e) {
                try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (e2) {}
                resolve(false);
            }
        });
    });
}

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const VIDEO_EXTS = ['.mp4', '.mov', '.webm'];
const NAME_RE = /^[A-Za-z0-9_-]+$/;
const IG_RE = /^[A-Za-z0-9._-]+$/;

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// Fila por cliente (instagram). Sem instagram = pasta base (localhost, 1 usuário).
function queueDirFor(instagram) {
    var ig = String(instagram || '').replace('@', '').trim().toLowerCase();
    if (ig && IG_RE.test(ig) && ig !== '.' && ig !== '..') {
        var dir = path.join(QUEUE_BASE, ig);
        ensureDir(dir);
        return dir;
    }
    ensureDir(QUEUE_BASE);
    return QUEUE_BASE;
}

// Chave de agrupamento: número final do nome (imagem1/video1/txt1 -> "1").
// Sem número: agrupa pelo próprio nome (legado foto+txt de mesmo nome).
function groupKeyFor(base) {
    var m = String(base).match(/^(.*?)(\d+)$/);
    if (m) return { key: '#' + parseInt(m[2], 10), num: parseInt(m[2], 10) };
    return { key: 'n:' + String(base).toLowerCase(), num: -1 };
}

function sortGroupKeys(a, b) {
    if (a.num !== b.num) return a.num - b.num;
    return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0);
}

// Retorna entradas ordenadas: [{ key, kind: 'photo'|'reel', name, mediaFile, mediaMime, txtFile }]
// Foto antes do reels dentro do grupo.
function listQueue(dir) {
    ensureDir(dir);
    var files = fs.readdirSync(dir);
    var groups = {};

    files.forEach(function (f) {
        var ext = path.extname(f).toLowerCase();
        var base = path.basename(f, path.extname(f));
        if (!NAME_RE.test(base)) return;
        var gk = groupKeyFor(base).key;
        if (!groups[gk]) groups[gk] = { num: groupKeyFor(base).num, photos: [], videos: [], txt: null };
        if (IMAGE_EXTS.indexOf(ext) > -1) {
            groups[gk].photos.push(f);
        } else if (VIDEO_EXTS.indexOf(ext) > -1) {
            groups[gk].videos.push(f);
        } else if (ext === '.txt' && !groups[gk].txt) {
            groups[gk].txt = f;
        }
    });

    var keys = Object.keys(groups).sort(function (a, b) {
        var ga = groups[a], gb = groups[b];
        if (ga.num !== gb.num) return ga.num - gb.num;
        return a < b ? -1 : (a > b ? 1 : 0);
    });

    var entries = [];
    keys.forEach(function (k) {
        var g = groups[k];
        if (!g.txt) return;
        g.photos.sort().forEach(function (pf) {
            entries.push({ key: 'p:' + pf, kind: 'photo', name: path.basename(pf, path.extname(pf)), mediaFile: pf, txtFile: g.txt, group: k });
        });
        g.videos.sort().forEach(function (vf) {
            entries.push({ key: 'v:' + vf, kind: 'reel', name: path.basename(vf, path.extname(vf)), mediaFile: vf, txtFile: g.txt, group: k });
        });
    });
    return entries;
}

function mimeFor(ext) {
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.mp4') return 'video/mp4';
    if (ext === '.mov') return 'video/quicktime';
    if (ext === '.webm') return 'video/webm';
    return 'image/jpeg';
}

function groupHasOtherMedia(dir, group, exceptFile) {
    var files = fs.readdirSync(dir);
    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (f === exceptFile) continue;
        var ext = path.extname(f).toLowerCase();
        var base = path.basename(f, path.extname(f));
        if (!NAME_RE.test(base)) continue;
        if (groupKeyFor(base).key !== group) continue;
        if (IMAGE_EXTS.indexOf(ext) > -1 || VIDEO_EXTS.indexOf(ext) > -1) return true;
    }
    return false;
}

// GET /api/post-queue/status?instagram= -> { success, pending, items: [{name, kind}] }
router.get('/status', function (req, res) {
    try {
        var dir = queueDirFor(req.query.instagram);
        var items = listQueue(dir);
        res.json({ success: true, pending: items.length, items: items.map(function (i) { return { name: i.name, kind: i.kind }; }) });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao ler fila: ' + err.message });
    }
});

// GET /api/post-queue/next?instagram=&kind= -> próxima mídia + legenda ou { empty: true }
router.get('/next', function (req, res) {
    try {
        var dir = queueDirFor(req.query.instagram);
        var items = listQueue(dir);
        var kind = String(req.query.kind || '');
        if (kind === 'photo' || kind === 'reel') {
            items = items.filter(function (i) { return i.kind === kind; });
        }
        if (items.length === 0) {
            return res.json({ success: true, empty: true, pending: 0 });
        }
        var item = items[0];
        var mediaPath = path.join(dir, item.mediaFile);
        var txtPath = path.join(dir, item.txtFile);
        var buf = fs.readFileSync(mediaPath);
        var legenda = fs.readFileSync(txtPath, 'utf8').replace(/^\uFEFF/, '');
        res.json({
            success: true,
            empty: false,
            pending: items.length,
            item: {
                key: item.key,
                kind: item.kind,
                name: item.name,
                mediaBase64: buf.toString('base64'),
                mediaMimeType: mimeFor(path.extname(item.mediaFile).toLowerCase()),
                legenda: legenda
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao ler próximo post: ' + err.message });
    }
});

// POST /api/post-queue/done { key, instagram } -> apaga a mídia; apaga o txt se não restar mídia do grupo
router.post('/done', express.json(), function (req, res) {
    try {
        var dir = queueDirFor(req.body && req.body.instagram);
        var key = String((req.body && req.body.key) || (req.body && req.body.name) || '');
        var items = listQueue(dir);
        var found = null;
        for (var i = 0; i < items.length; i++) {
            if (items[i].key === key || items[i].name === key) { found = items[i]; break; }
        }
        if (!found) {
            return res.status(404).json({ success: false, message: 'Item não encontrado na fila.' });
        }
        fs.unlinkSync(path.join(dir, found.mediaFile));
        var txtGone = false;
        if (!groupHasOtherMedia(dir, found.group, found.mediaFile)) {
            try { fs.unlinkSync(path.join(dir, found.txtFile)); txtGone = true; } catch (e) {}
        }
        var rest = listQueue(dir);
        res.json({ success: true, removed: found.name, kind: found.kind, txtRemoved: txtGone, pending: rest.length });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao remover post: ' + err.message });
    }
});

// POST /api/post-queue/upload { instagram, files: [{ name, kind: 'media'|'text', mime, data(base64) }] }
// Aceita também o formato legado { name, imageBase64, imageMimeType, legenda }.
router.post('/upload', express.json({ limit: '100mb' }), function (req, res) {
    (async function () {
    try {
        var dir = queueDirFor(req.body && req.body.instagram);
        var files = (req.body && req.body.files) || [];
        if (!Array.isArray(files) || files.length === 0) {
            return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
        }
        var saved = [];
        var skipped = [];
        var fixedVideos = [];
        for (var i = 0; i < files.length; i++) {
            var fr = files[i];
            var isVideoSaved = false;
            var videoPath = null;
            (function (f) {
                try {
                    // Formato novo: arquivo com nome real
                    if (f.kind === 'media' || f.kind === 'text' || f.data) {
                        var fname = String(f.name || '');
                        var ext = path.extname(fname).toLowerCase();
                        var base = path.basename(fname, path.extname(fname));
                        var okExt = (f.kind === 'text') ? (ext === '.txt') : (IMAGE_EXTS.indexOf(ext) > -1 || VIDEO_EXTS.indexOf(ext) > -1);
                        if (!NAME_RE.test(base) || !okExt || !f.data) { skipped.push(fname || '?'); return; }
                        if (f.kind === 'text') {
                            fs.writeFileSync(path.join(dir, base + '.txt'), Buffer.from(f.data, 'base64').toString('utf8'), 'utf8');
                        } else {
                            fs.writeFileSync(path.join(dir, base + ext), Buffer.from(f.data, 'base64'));
                            if (VIDEO_EXTS.indexOf(ext) > -1) { isVideoSaved = true; videoPath = path.join(dir, base + ext); }
                        }
                        saved.push(fname);
                        return;
                    }
                    // Formato legado: { name, imageBase64, imageMimeType, legenda }
                    var name = String(f.name || '').replace(/\.[^.]+$/, '');
                    if (!NAME_RE.test(name) || !f.imageBase64) { skipped.push(String(f.name || '?')); return; }
                    var mime = String(f.imageMimeType || 'image/jpeg');
                    var ext2 = '.jpg';
                    if (mime.indexOf('png') > -1) ext2 = '.png';
                    else if (mime.indexOf('webp') > -1) ext2 = '.webp';
                    else if (mime.indexOf('mp4') > -1) ext2 = '.mp4';
                    fs.writeFileSync(path.join(dir, name + ext2), Buffer.from(f.imageBase64, 'base64'));
                    fs.writeFileSync(path.join(dir, name + '.txt'), String(f.legenda || ''), 'utf8');
                    saved.push(name);
                } catch (e) { skipped.push(String((f && f.name) || '?')); }
            })(fr);
            if (isVideoSaved && videoPath) {
                try {
                    if (await faststartVideo(videoPath)) fixedVideos.push(path.basename(videoPath));
                } catch (e) {}
            }
            if (saved.length + skipped.length >= 200) break;
        }
        var rest = listQueue(dir);
        res.json({ success: true, saved: saved, skipped: skipped, fixedVideos: fixedVideos, pending: rest.length });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro no upload: ' + err.message });
    }
    })();
});

module.exports = router;
