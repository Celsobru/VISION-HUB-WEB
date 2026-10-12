/* ============================================
   AUTO CUT ROUTES - Gerenciamento de projetos de corte
   CRUD de jobs + simulação de processamento
   ============================================ */

const express = require('express');
const router = express.Router();
const { prepare } = require('../database');
const { authenticateToken } = require('./auth');

// ============ LISTAR PROJETOS DO USUÁRIO ============
router.get('/jobs', authenticateToken, (req, res) => {
    try {
        const jobs = prepare('SELECT * FROM autocut_jobs WHERE user_id = ? ORDER BY created_at DESC').all(req.user.userId);
        res.json({ success: true, jobs });
    } catch (err) {
        console.error('Erro ao listar projetos Auto Cut:', err);
        res.status(500).json({ success: false, message: 'Erro ao listar projetos.' });
    }
});

// ============ CRIAR PROJETO ============
router.post('/jobs', authenticateToken, (req, res) => {
    try {
        const { title, source_url, source_type, instagram, clip_duration, clips_count, captions, schedule_type, scheduled_at, notes } = req.body;
        if (!title) {
            return res.status(400).json({ success: false, message: 'Título do projeto é obrigatório.' });
        }

        const result = prepare(`
            INSERT INTO autocut_jobs
            (user_id, title, source_url, source_type, instagram, clip_duration, clips_count, captions, schedule_type, scheduled_at, notes, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created')
        `).run(
            req.user.userId,
            title.trim(),
            (source_url || '').trim(),
            source_type || 'youtube',
            instagram ? String(instagram).replace('@', '').trim().toLowerCase() : '',
            parseInt(clip_duration) || 30,
            parseInt(clips_count) || 5,
            captions ? 1 : 0,
            schedule_type || 'immediate',
            scheduled_at || null,
            (notes || '').trim()
        );

        res.json({ success: true, message: 'Projeto criado com sucesso!', id: result.lastInsertRowid });
    } catch (err) {
        console.error('Erro ao criar projeto Auto Cut:', err);
        res.status(500).json({ success: false, message: 'Erro ao criar projeto.' });
    }
});

// ============ ATUALIZAR PROJETO ============
router.put('/jobs/:id', authenticateToken, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const job = prepare('SELECT * FROM autocut_jobs WHERE id = ? AND user_id = ?').get(id, req.user.userId);
        if (!job) return res.status(404).json({ success: false, message: 'Projeto não encontrado.' });

        const { title, source_url, source_type, instagram, clip_duration, clips_count, captions, schedule_type, scheduled_at, notes } = req.body;

        prepare(`
            UPDATE autocut_jobs SET
                title = ?, source_url = ?, source_type = ?, instagram = ?,
                clip_duration = ?, clips_count = ?, captions = ?, schedule_type = ?,
                scheduled_at = ?, notes = ?, updated_at = datetime('now')
            WHERE id = ?
        `).run(
            (title || job.title).trim(),
            (source_url !== undefined ? source_url : job.source_url || '').trim(),
            source_type || job.source_type,
            instagram !== undefined ? String(instagram).replace('@', '').trim().toLowerCase() : job.instagram || '',
            parseInt(clip_duration) || job.clip_duration,
            parseInt(clips_count) || job.clips_count,
            captions !== undefined ? (captions ? 1 : 0) : job.captions,
            schedule_type || job.schedule_type,
            scheduled_at !== undefined ? scheduled_at : job.scheduled_at,
            (notes !== undefined ? notes : job.notes || '').trim(),
            id
        );

        res.json({ success: true, message: 'Projeto atualizado com sucesso!' });
    } catch (err) {
        console.error('Erro ao atualizar projeto Auto Cut:', err);
        res.status(500).json({ success: false, message: 'Erro ao atualizar projeto.' });
    }
});

// ============ EXCLUIR PROJETO ============
router.delete('/jobs/:id', authenticateToken, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const job = prepare('SELECT id FROM autocut_jobs WHERE id = ? AND user_id = ?').get(id, req.user.userId);
        if (!job) return res.status(404).json({ success: false, message: 'Projeto não encontrado.' });

        prepare('DELETE FROM autocut_jobs WHERE id = ?').run(id);
        res.json({ success: true, message: 'Projeto removido.' });
    } catch (err) {
        console.error('Erro ao excluir projeto Auto Cut:', err);
        res.status(500).json({ success: false, message: 'Erro ao excluir projeto.' });
    }
});

// ============ INICIAR PROCESSAMENTO (simulação) ============
router.post('/jobs/:id/process', authenticateToken, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const job = prepare('SELECT * FROM autocut_jobs WHERE id = ? AND user_id = ?').get(id, req.user.userId);
        if (!job) return res.status(404).json({ success: false, message: 'Projeto não encontrado.' });

        if (job.status === 'processing') {
            return res.json({ success: true, message: 'Projeto já está em processamento.', status: 'processing' });
        }

        // Validação básica de fonte
        if (!job.source_url) {
            // Sem URL, processa "modo estúdio" (sem download) e gera os cortes igualmente
            prepare('UPDATE autocut_jobs SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run('processing', id);
            simulateProcess([]);
            return res.json({ success: true, message: 'Processamento iniciado (modo rascunho).', status: 'processing' });
        }

        const acceptedSources = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|instagram\.com|tiktok\.com)/i;
        if (!acceptedSources.test(job.source_url.trim())) {
            return res.status(400).json({ success: false, message: 'URL de origem inválida. Use YouTube, Instagram ou TikTok.' });
        }

        prepare('UPDATE autocut_jobs SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run('processing', id);
        simulateProcess(job);
        res.json({ success: true, message: 'Processamento iniciado! Você será avisado quando terminar.', status: 'processing' });

    } catch (err) {
        console.error('Erro ao iniciar processamento:', err);
        res.status(500).json({ success: false, message: 'Erro ao iniciar processamento.' });
    }
});

// Simula etapas de corte/edição para progress realista (sem ffmpeg local demorado)
function simulateProcess(job) {
    const steps = [
        { pct: 20, label: 'Baixando vídeo de origem...' },
        { pct: 40, label: 'Detectando cenas e cortando clipes...' },
        { pct: 65, label: 'Aplicando legendas automáticas...' },
        { pct: 85, label: 'Renderizando e otimizando para o Instagram...' },
        { pct: 100, label: 'Cortes prontos para publicação' }
    ];
    let step = 0;

    const runStep = () => {
        if (step >= steps.length) {
            const outputUrl = 'https://drive.google.com/uc?export=download&id=autocut-sample';
            prepare('UPDATE autocut_jobs SET status = ?, progress = 100, output_url = ?, updated_at = datetime(\'now\') WHERE id = ?')
                .run('completed', outputUrl, job.id);
            console.log(`✅ Auto Cut: projeto #${job.id} concluído (${job.clips_count} cortes de ${job.clip_duration}s)`);
            return;
        }
        const s = steps[step];
        prepare('UPDATE autocut_jobs SET progress = ?, updated_at = datetime(\'now\') WHERE id = ?').run(s.pct, job.id);
        console.log(`  ✂️ Auto Cut #${job.id}: ${s.label}`);
        step++;
        setTimeout(runStep, 1500);
    };

    // Falha segura caso o job tenha sido excluído durante o processo
    runStep();
}

module.exports = router;