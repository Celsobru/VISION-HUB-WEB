/* ============================================
   Build: gera downloads/corte-viral-extension.zip
   a partir da pasta dev 4.0.0_autocut (raiz do projeto).
   O ZIP sai sempre com raiz `corte-viral/` (padrão do painel).
   Uso: npm run build:ext  (dentro de server/)
   ============================================ */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SITE_ROOT = path.join(__dirname, '..', '..');
// ATENÇÃO: caminho contém acentos (APLICAÇÕES) — usar shell p/ cópia (fs.cpSync quebra no Windows)
const SRC = path.join(SITE_ROOT, '..', '4.0.0_autocut');
const DEST = path.join(SITE_ROOT, 'downloads', 'corte-viral-extension.zip');

if (!fs.existsSync(SRC)) {
    console.error('FAIL: Pasta dev nao encontrada: ' + SRC);
    process.exit(1);
}

const STAGE = fs.mkdtempSync(path.join(os.tmpdir(), 'autocut-zip-'));

try {
    if (process.platform === 'win32') {
        execFileSync('powershell', ['-NoProfile', '-Command',
            `Copy-Item -LiteralPath '${SRC}' -Destination '${path.join(STAGE, 'corte-viral')}' -Recurse -Force; ` +
            `Compress-Archive -LiteralPath '${path.join(STAGE, 'corte-viral')}' -DestinationPath '${DEST}' -Force`
        ], { stdio: 'inherit' });
    } else {
        execFileSync('sh', ['-c', `cp -r "${SRC}" "${path.join(STAGE, 'corte-viral')}" && cd "${STAGE}" && zip -r -q "${DEST}" corte-viral`], { stdio: 'inherit' });
    }
    console.log('OK ZIP: ' + DEST + ' (' + fs.statSync(DEST).size + ' bytes)');
} catch (err) {
    console.error('FAIL ao gerar ZIP:', err.message);
    process.exit(1);
} finally {
    try { fs.rmSync(STAGE, { recursive: true, force: true }); } catch (e) {}
}
