/* ============================================
   AUTO CUT - Serviço de Exportação (ffmpeg + yt-dlp)
   Baixa o vídeo, corta os trechos, grava legenda.txt e metadata.json
   Portado do projeto cortes-poder-digital (mesmo comportamento)
   ============================================ */

const { join } = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

const DEFAULT_FFMPEG = 'C:\\Users\\Celso Ribeiro\\AppData\\Local\\Microsoft\\WinGet\\Packages\\yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-N-125365-g9a01c1cb6a-win64-gpl\\bin\\ffmpeg.exe';
const DEFAULT_YTDLP = 'C:\\Users\\Celso Ribeiro\\AppData\\Local\\Microsoft\\WinGet\\Packages\\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe\\yt-dlp.exe';

const FFMPEG_PATH = process.env.FFMPEG_PATH || DEFAULT_FFMPEG;
const YTDLP_PATH = process.env.YTDLP_PATH || DEFAULT_YTDLP;

const FORMAT_CONFIGS = {
  tiktok: { width: 1080, height: 1920, label: 'TikTok', suffix: 'tiktok' },
  reels: { width: 1080, height: 1920, label: 'Instagram Reels', suffix: 'reels' },
  shorts: { width: 1080, height: 1920, label: 'YouTube Shorts', suffix: 'shorts' }
};

function exists(p) { try { return fs.existsSync(p) && fs.statSync(p).size > 0; } catch (e) { return false; } }

function runCommand(cmd, timeout) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: timeout || 600000, windowsHide: true, maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout);
    });
  });
}

function parseTimeToSeconds(timeStr) {
  if (typeof timeStr === 'number') return timeStr;
  const parts = String(timeStr).split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function formatSrtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

async function downloadWithFFmpeg(url, outputPath) {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const cmd = `"${FFMPEG_PATH}" -y -user_agent "${ua}" -headers "Referer: https://www.youtube.com/" -i "${url}" -c copy "${outputPath}"`;
  return runCommand(cmd, 600000);
}

async function downloadVideo({ videoId, directVideoUrl, tempVideo, progress }) {
  const step = (msg) => { if (progress) progress(msg); console.log(`[EXPORT] ${msg}`); };
  let lastError = '';

  // ESTRATÉGIA 1: URL direta SOMENTE em HD (itag=22, 720p). 360p (itag=18) dá
  // upscale horrível em 1080x1920 — nesse caso vai direto ao yt-dlp (até 1440p).
  if (directVideoUrl && directVideoUrl.includes('googlevideo.com') && directVideoUrl.includes('itag=22')) {
    step('Baixando vídeo via URL direta...');
    try {
      await downloadWithFFmpeg(directVideoUrl, tempVideo);
      if (exists(tempVideo) && fs.statSync(tempVideo).size > 10000) {
        step(`Download OK (${(fs.statSync(tempVideo).size / 1024 / 1024).toFixed(1)} MB)`);
        return true;
      }
    } catch (err) {
      lastError = err.message;
      console.log(`[EXPORT] URL direta falhou: ${lastError.split('\n')[0]}`);
      try { fs.unlinkSync(tempVideo); } catch (e) {}
    }
  }

  // ESTRATÉGIA 2: yt-dlp com múltiplos clients (iOS, Android, mweb, web_creator) para evitar 403
  // Usa cookies.txt (exportado do Chrome) se existir — resolve vídeos com "bot-check" mesmo com Chrome aberto.
  const ffmpegArg = fs.existsSync(FFMPEG_PATH) ? `--ffmpeg-location "${FFMPEG_PATH}"` : '';
  const cookiesFile = join(__dirname, '..', 'cookies.txt');
  const hasCookiesFile = fs.existsSync(cookiesFile);
  const cookiesArg = hasCookiesFile ? `--cookies "${cookiesFile}"` : '';

  const clientStrategies = [
    { name: 'iOS + cookies', args: '--extractor-args "youtube:player_client=ios,web"', cookies: true },
    { name: 'Android + cookies', args: '--extractor-args "youtube:player_client=android,web"', cookies: true },
    { name: 'Edge cookies', args: '--extractor-args "youtube:player_client=ios,web"', edge: true },
    { name: 'iOS Client', args: '--extractor-args "youtube:player_client=ios,web"' },
    { name: 'Android Client', args: '--extractor-args "youtube:player_client=android,web"' },
    { name: 'MWeb Client', args: '--extractor-args "youtube:player_client=mweb,web"' },
    { name: 'Web Creator Client', args: '--extractor-args "youtube:player_client=web_creator,web"' },
    { name: 'Padrão yt-dlp', args: '' }
  ];

  for (const strategy of clientStrategies) {
    if (strategy.cookies && !hasCookiesFile) continue;
    let extraCookies = '';
    if (strategy.cookies) extraCookies = cookiesArg;
    else if (strategy.edge) extraCookies = '--cookies-from-browser edge';
    step(`Tentando yt-dlp (${strategy.name})...`);
    try {
      await runCommand(`"${YTDLP_PATH}" ${ffmpegArg} ${strategy.args} ${extraCookies} -f "bestvideo[height<=2160]+bestaudio/best[height<=2160]/best" --no-check-certificates -o "${tempVideo}" "https://www.youtube.com/watch?v=${videoId}"`, 600000);
      if (exists(tempVideo) && fs.statSync(tempVideo).size > 10000) {
        step(`Download OK via ${strategy.name} (${(fs.statSync(tempVideo).size / 1024 / 1024).toFixed(1)} MB)`);
        return true;
      }
    } catch (err) {
      lastError = err.message;
      console.log(`[EXPORT] ${strategy.name} falhou: ${lastError.split('\n')[0]}`);
      try { fs.unlinkSync(tempVideo); } catch (e) {}
    }
  }

  return false;
}

async function fetchSubtitlesWithYtdlp(videoId, tempDir) {
  try {
    await runCommand(`"${YTDLP_PATH}" --write-auto-sub --sub-lang pt,en --skip-download --sub-format json3 -o "${join(tempDir, videoId + '_subs')}" "https://www.youtube.com/watch?v=${videoId}"`, 30000);
  } catch (e) {
    console.log(`[EXPORT] yt-dlp subs falhou: ${e.message}`);
  }
  const possibleFiles = [
    join(tempDir, `${videoId}_subs.pt.json3`),
    join(tempDir, `${videoId}_subs.en.json3`),
    join(tempDir, `${videoId}_subs.pt.srv3`),
    join(tempDir, `${videoId}_subs.en.srv3`)
  ];
  const foundFile = possibleFiles.find(f => exists(f));
  if (!foundFile) return [];
  try {
    const data = JSON.parse(fs.readFileSync(foundFile, 'utf-8'));
    try { fs.unlinkSync(foundFile); } catch (e) {}
    if (data.events) {
      return data.events
        .filter(e => e.segs && e.segs.length > 0)
        .map(e => ({ start: e.tStartMs / 1000, duration: e.dDurationMs / 1000, text: e.segs.map(s => s.utf8).join('').trim() }))
        .filter(s => s.text.length > 0 && s.text !== '\n');
    }
  } catch (e) {}
  return [];
}

function createClipSRT(segments, clipStart, clipDuration, tempDir, clipId, timestamp) {
  // SRT no temp do SO (caminho ASCII curto): a pasta do projeto tem acentos/espacos
  // que quebram o filtro subtitles do ffmpeg no Windows
  const srtPath = join(os.tmpdir(), `vp_subs_${clipId}_${timestamp}.srt`);
  const clipEnd = clipStart + clipDuration;
  const clipSegments = segments.filter(seg => {
    const segEnd = seg.start + seg.duration;
    return segEnd > clipStart && seg.start < clipEnd;
  });

  // Quebra falas longas em cues curtos (máx ~10 palavras = ~2 linhas na tela),
  // distribuindo o tempo proporcionalmente -> legenda "tempo real", estilo karaokê
  const MAX_WORDS = 10;
  const cues = [];
  clipSegments.forEach(seg => {
    const relStart = Math.max(0, seg.start - clipStart);
    const relEnd = Math.min(clipDuration, seg.start + seg.duration - clipStart);
    if (relEnd <= relStart) return;
    const words = String(seg.text || '').split(/\s+/).filter(Boolean);
    if (words.length <= MAX_WORDS) {
      cues.push({ start: relStart, end: relEnd, text: words.join(' ') });
      return;
    }
    const totalChars = words.reduce((a, w) => a + w.length, 0) || 1;
    let t = relStart;
    for (let i = 0; i < words.length; i += MAX_WORDS) {
      const chunk = words.slice(i, i + MAX_WORDS);
      const chunkChars = chunk.reduce((a, w) => a + w.length, 0);
      const chunkDur = Math.max(0.6, (relEnd - relStart) * (chunkChars / totalChars));
      const chunkEnd = (i + MAX_WORDS >= words.length) ? relEnd : Math.min(relEnd, t + chunkDur);
      if (chunkEnd > t) cues.push({ start: t, end: chunkEnd, text: chunk.join(' ') });
      t = chunkEnd;
    }
  });

  let srtContent = '';
  cues.forEach((cue, i) => {
    srtContent += `${i + 1}\n`;
    srtContent += `${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n`;
    srtContent += `${cue.text}\n\n`;
  });

  if (srtContent) {
    fs.writeFileSync(srtPath, srtContent, 'utf-8');
    return srtPath;
  }
  return null;
}

function getASSColor(colorName) {
  const colors = { white: 'FFFFFF', yellow: '00FFFF', red: '0000FF', cyan: 'FFFF00' };
  return colors[colorName] || colors['yellow'];
}

// Fallback 3: transcreve o áudio com faster-whisper local (grátis, offline).
// Usado quando não há legenda do YouTube (modo auto sem segments).
// Retorna [{ start, duration, text }] ou [].
async function transcribeWithWhisper(mediaPath, tempDir, step) {
  const script = join(__dirname, 'whisper-transcribe.py');
  if (!fs.existsSync(script)) {
    console.log('[WHISPER] script nao encontrado, pulando transcricao local.');
    return [];
  }
  const model = process.env.WHISPER_MODEL || 'small';
  const lang = process.env.WHISPER_LANG || 'pt';
  const pyBin = process.env.PYTHON_BIN || 'python';
  // Windows sem modo desenvolvedor nao permite symlinks do cache HF -> desativa
  const noSymlink = process.platform === 'win32' ? 'set HF_HUB_DISABLE_SYMLINKS=1 && ' : 'HF_HUB_DISABLE_SYMLINKS=1 ';
  const outJson = join(os.tmpdir(), `vp_whisper_${Date.now()}.json`);
  const log = (m) => { if (step) step(m); console.log(`[WHISPER] ${m}`); };
  log(`Transcrevendo audio com Whisper (modelo ${model}, pode levar alguns minutos)...`);
  try {
    const stdout = await runCommand(`${noSymlink}${pyBin} "${script}" "${mediaPath}" --model ${model} --lang ${lang} > "${outJson}"`, 1800000);
    void stdout;
    if (!exists(outJson)) {
      console.log('[WHISPER] sem saida JSON.');
      return [];
    }
    const raw = fs.readFileSync(outJson, 'utf-8');
    try { fs.unlinkSync(outJson); } catch (e) {}
    const segs = JSON.parse(raw);
    if (!Array.isArray(segs)) return [];
    const clean = segs
      .filter(s => s && typeof s.start === 'number' && typeof s.duration === 'number' && String(s.text || '').trim().length > 0)
      .map(s => ({ start: s.start, duration: s.duration, text: String(s.text).trim() }));
    log(`${clean.length} trechos transcritos do audio.`);
    return clean;
  } catch (err) {
    console.log(`[WHISPER] falhou: ${String((err && err.message) || err).split('\n')[0]}`);
    return [];
  }
}

function processClip(inputPath, outputPath, startSeconds, duration, formatConfig, subtitle, srtPath, cropPos) {
  return new Promise((resolve, reject) => {
    const { width, height } = formatConfig;
    // Enquadramento: center (padrão) | top (cabeças/legendas em cima) | bottom
    let cropExpr = `${width}:${height}`;
    if (cropPos === 'top') cropExpr = `${width}:${height}:(in_w-${width})/2:0`;
    else if (cropPos === 'bottom') cropExpr = `${width}:${height}:(in_w-${width})/2:(in_h-${height})`;
    let vf = `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${cropExpr},setsar=1,unsharp=5:5:0.5:5:5:0.0`;

    if (srtPath && fs.existsSync(srtPath)) {
      const safeSrtPath = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      const fontSize = subtitle?.size || 32;
      const color = subtitle?.color || 'yellow';
      // PlayRes = resolução real: FontSize vira pixels de verdade.
      // Posição via Alignment 8 (topo) / 2 (base) + MarginV, pois o Alignment 5
      // (centro) do libass não centraliza direito em vídeo vertical. Centro = base + margem alta.
      const pos = (subtitle && subtitle.pos) || 'bottom';
      const align = pos === 'top' ? 8 : 2;
      const marginV = pos === 'center' ? 920 : 350;
      vf += `,subtitles='${safeSrtPath}':force_style='PlayResX=1080,PlayResY=1920,FontSize=${fontSize},PrimaryColour=&H00${getASSColor(color)},OutlineColour=&H00000000,Outline=2,Shadow=1,Alignment=${align},MarginV=${marginV}'`;
      console.log(`[FFMPEG] Legendas SRT aplicadas (size=${fontSize}, pos=${pos})`);
    } else if (subtitle && subtitle.mode === 'custom' && subtitle.text) {
      const fontSize = subtitle.size || 36;
      const color = subtitle.color || 'yellow';
      const safeText = subtitle.text.replace(/'/g, "\\'").replace(/:/g, "\\:");
      vf += `,drawtext=text='${safeText}':fontsize=${fontSize}:fontcolor=${color}:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.72`;
      console.log(`[FFMPEG] Texto fixo aplicado`);
    }

    const cmd = `"${FFMPEG_PATH}" -y -ss ${startSeconds} -i "${inputPath}" -t ${duration} -avoid_negative_ts make_zero -vf "${vf}" -c:v libx264 -preset medium -crf 20 -maxrate 8M -bufsize 16M -c:a aac -b:a 128k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
    exec(cmd, { timeout: 300000, windowsHide: true, maxBuffer: 1024 * 1024 * 50 }, (error) => {
      if (error) reject(error);
      else if (exists(outputPath)) {
        console.log(`[FFMPEG] OK: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)} MB`);
        resolve(outputPath);
      } else {
        reject(new Error('Arquivo não criado'));
      }
    });
  });
}

const FALLBACK_HASHTAGS = '#cortes #viral #reels #shorts #fyp #cortevrial';

function enrichClipMeta(clip, index, videoTitle) {
  const isManual = !clip.description || /^corte manual/i.test(clip.description || '');
  if (isManual && videoTitle) {
    const clean = String(videoTitle).replace(/\s+/g, ' ').trim().slice(0, 90);
    return {
      description: clean ? `🎬 ${clean}` : `Corte ${index + 1}`,
      hashtags: clip.hashtags || FALLBACK_HASHTAGS,
      hook: clip.hook || (clean ? clean.split(/[.?!]/)[0].trim().slice(0, 100) : '')
    };
  }
  return {
    description: clip.description || 'Sem descrição',
    hashtags: clip.hashtags || (isManual ? FALLBACK_HASHTAGS : ''),
    hook: clip.hook || ''
  };
}

function buildLegendaTxt(videoId, metadata, exportedFiles) {
  let content = `LEGENDAS - ${videoId}\n`;
  content += `Data: ${new Date().toLocaleString('pt-BR')}\n`;
  content += `${'='.repeat(40)}\n\n`;
  metadata.forEach((clip, index) => {
    content += `VIDEO ${index + 1}\n`;
    content += `Legenda: ${clip.description || 'Sem descrição'}\n`;
    if (clip.hashtags) content += `Hashtags: ${clip.hashtags}\n`;
    if (clip.hook) content += `Gancho: ${clip.hook}\n`;
    content += `Tempo: ${clip.start} - ${clip.end}\n`;
    content += `Arquivo: ${exportedFiles.filter(f => f.clipId === clip.id).map(f => f.filename).join(', ')}\n`;
    content += `\n`;
  });
  return content;
}

async function exportClips(data) {
  const { videoId, videoUrl: directVideoUrl, clips, formats, subtitle, outputDir, tempDir, exportId, videoTitle, cropPos } = data;
  const timestamp = exportId || Date.now();
  const exportDir = join(outputDir, `export_${videoId}_${timestamp}`);
  fs.mkdirSync(exportDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const progressFile = join(exportDir, 'progress.json');
  const setProgress = (pct, msg) => {
    try { fs.writeFileSync(progressFile, JSON.stringify({ pct, msg, done: pct >= 100 })); } catch (e) {}
  };
  const step = (pct, msg) => { setProgress(pct, msg); console.log(`[EXPORT ${pct}%] ${msg}`); };

  const tempVideo = join(tempDir, `${videoId}_${timestamp}.mp4`);

  try {
    step(15, 'Baixando vídeo...');
    const downloadOk = await downloadVideo({ videoId, directVideoUrl, tempVideo, progress: (m) => console.log(`[DOWNLOAD] ${m}`) });
    if (!downloadOk) {
      throw new Error('Não foi possível baixar o vídeo. O YouTube está bloqueando o acesso sem login. Tente novamente daqui a alguns minutos.');
    }
    // Diagnóstico: resolução real da fonte (explica teto de qualidade)
    try {
      const ffprobe = FFMPEG_PATH.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
      if (fs.existsSync(ffprobe)) {
        const info = await runCommand(`"${ffprobe}" -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${tempVideo}"`, 30000);
        step(16, 'Fonte: ' + String(info).trim().replace('\n', 'x') + 'px');
      }
    } catch (e) {}

    // Legendas
    let subtitleSegments = [];
    let subtitleSource = 'none';
    if (subtitle && subtitle.mode === 'auto' && subtitle.segments && subtitle.segments.length > 0) {
      subtitleSegments = subtitle.segments;
      subtitleSource = 'youtube-front';
      step(30, `${subtitleSegments.length} legendas carregadas (${subtitle.lang || 'auto'})`);
    } else if (subtitle && subtitle.mode === 'auto') {
      step(30, 'Buscando legendas no YouTube...');
      subtitleSegments = await fetchSubtitlesWithYtdlp(videoId, tempDir);
      if (subtitleSegments.length > 0) { subtitleSource = 'youtube-ytdlp'; step(35, `${subtitleSegments.length} legendas encontradas`); }
    }
    // Fallback 3: sem legenda do YouTube -> transcreve o audio com Whisper local
    if (subtitle && subtitle.mode === 'auto' && subtitleSegments.length === 0 && exists(tempVideo)) {
      step(36, 'Sem legenda no YouTube — transcrevendo o áudio (Whisper)...');
      subtitleSegments = await transcribeWithWhisper(tempVideo, tempDir, (m) => step(36, m));
      if (subtitleSegments.length > 0) subtitleSource = 'whisper';
      else step(36, 'Whisper não gerou transcrição — exportando sem legenda.');
    }

    const exportedFiles = [];
    const metadata = [];
    const total = clips.length * formats.length;
    let done = 0;

    const seenIds = new Set();
    for (const [clipIndex, clip] of clips.entries()) {
      const startSeconds = clip.startTime || parseTimeToSeconds(clip.start);
      const endSeconds = clip.endTime || parseTimeToSeconds(clip.end);
      const duration = endSeconds - startSeconds;

      // Trava contra cortes inválidos (ex: tudo 0:00 por duração zerada)
      if (!(startSeconds >= 0) || !(duration > 1)) {
        console.log(`[EXPORT] Corte ignorado (tempo inválido): start=${clip.start} end=${clip.end}`);
        continue;
      }
      if (clip.id == null) clip.id = clipIndex + 1;
      if (seenIds.has(clip.id)) clip.id = clipIndex + 1 + '_' + Math.floor(startSeconds);
      seenIds.add(clip.id);

      let srtPath = null;
      if (subtitle && subtitle.mode === 'auto' && subtitleSegments.length > 0) {
        srtPath = createClipSRT(subtitleSegments, startSeconds, duration, tempDir, clip.id, timestamp);
      }

      const clipFiles = [];
      const multiFormat = formats.filter(f => FORMAT_CONFIGS[f]).length > 1;
      for (const format of formats) {
        const config = FORMAT_CONFIGS[format];
        if (!config) continue;
        // Nome compatível com a fila do InstaBot: mesma base p/ mídia+txt (ex: VIDEO1.mp4 + VIDEO1.txt)
        const filename = multiFormat ? `VIDEO${clip.id}_${config.suffix}.mp4` : `VIDEO${clip.id}.mp4`;
        const outputPath = join(exportDir, filename);
        try {
          await processClip(tempVideo, outputPath, startSeconds, duration, config, subtitle, srtPath, cropPos);
          if (fs.existsSync(outputPath)) {
            clipFiles.push(filename);
            exportedFiles.push({ filename, path: outputPath, format: config.label, clipId: clip.id });
          }
        } catch (err) {
          console.error(`[EXPORT] Erro: ${filename}: ${err.message}`);
        }
        done++;
        step(40 + Math.round((done / total) * 50), `Cortando vídeo ${Math.min(done, total)}/${total}...`);
      }

      if (srtPath && fs.existsSync(srtPath)) { try { fs.unlinkSync(srtPath); } catch (e) {} }

      const enriched = enrichClipMeta(clip, metadata.length, videoTitle);
      metadata.push({
        clipId: clip.id,
        start: clip.start,
        end: clip.end,
        description: enriched.description,
        hashtags: enriched.hashtags,
        score: clip.score,
        hook: enriched.hook,
        files: clipFiles
      });
    }

    const metadataPath = join(exportDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify({ videoId, exportDate: new Date().toISOString(), subtitleMode: (subtitle && subtitle.mode) || 'none', subtitleSource, subtitleCount: subtitleSegments.length, clips: metadata }, null, 2));

    const legendaPath = join(exportDir, 'legenda.txt');
    fs.writeFileSync(legendaPath, buildLegendaTxt(videoId, metadata, exportedFiles), 'utf-8');

    // TXT por corte no padrão da fila do InstaBot (VIDEO1.mp4 + VIDEO1.txt).
    // Entram na lista de download para chegarem à pasta Downloads junto com os MP4.
    try {
      const seenTxt = new Set();
      exportedFiles.slice().forEach(f => {
        const base = f.filename.replace(/\.[^.]+$/, '');
        if (seenTxt.has(base)) return;
        seenTxt.add(base);
        const meta = metadata.find(m => m.files && m.files.includes(f.filename)) || metadata[0] || {};
        const lines = [
          meta.description || '',
          '',
          meta.hashtags || '',
          meta.hook ? `\n${meta.hook}` : ''
        ].join('\n').trim() + '\n';
        const txtName = base + '.txt';
        fs.writeFileSync(join(exportDir, txtName), lines, 'utf-8');
        exportedFiles.push({ filename: txtName, path: join(exportDir, txtName), format: 'txt', clipId: f.clipId });
      });
    } catch (e) { console.log('[EXPORT] aviso txt por corte:', e.message); }

    try { fs.unlinkSync(tempVideo); } catch (e) {}

    step(100, subtitleSource === 'none' ? 'Concluído (sem legendas no vídeo)!' : `Concluído (legenda ${subtitleSource}, ${subtitleSegments.length} trechos)!`);
    return {
      success: true,
      exportDir,
      exportName: `export_${videoId}_${timestamp}`,
      totalFiles: exportedFiles.length,
      files: exportedFiles,
      metadataFile: 'metadata.json',
      legendaFile: 'legenda.txt',
      subtitleMode: (subtitle && subtitle.mode) || 'none',
      subtitleSource,
      subtitleCount: subtitleSegments.length
    };
  } catch (err) {
    try { fs.unlinkSync(tempVideo); } catch (e) {}
    setProgress(100, 'Erro: ' + err.message);
    throw err;
  }
}

module.exports = { exportClips, FFMPEG_PATH, YTDLP_PATH, FORMAT_CONFIGS };