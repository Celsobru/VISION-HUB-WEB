const express = require('express');
const router = express.Router();
const { prepare } = require('../database');
const { authenticateToken } = require('./auth');

// GET settings for logged-in user
router.get('/', authenticateToken, (req, res) => {
    try {
        const settings = prepare('SELECT * FROM user_ai_posting_settings WHERE user_id = ?').get(req.user.userId);
        if (!settings) {
            return res.json({
                niche_mode: 'manual',
                niche_product: '',
                instructions: '',
                post_time: '09:00',
                post_days: '1,2,3,4,5',
                is_enabled: 0
            });
        }
        res.json(settings);
    } catch (error) {
        console.error('Erro ao buscar configurações de IA:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar configurações' });
    }
});

// POST settings for logged-in user
router.post('/', authenticateToken, (req, res) => {
    const { niche_mode, niche_product, instructions, post_time, post_days, is_enabled } = req.body;
    try {
        const existing = prepare('SELECT id FROM user_ai_posting_settings WHERE user_id = ?').get(req.user.userId);
        if (existing) {
            prepare(`
                UPDATE user_ai_posting_settings 
                SET niche_mode = ?, niche_product = ?, instructions = ?, post_time = ?, post_days = ?, is_enabled = ?, updated_at = datetime('now')
                WHERE user_id = ?
            `).run(niche_mode || 'manual', niche_product, instructions, post_time, post_days, is_enabled ? 1 : 0, req.user.userId);
        } else {
            prepare(`
                INSERT INTO user_ai_posting_settings (user_id, niche_mode, niche_product, instructions, post_time, post_days, is_enabled)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(req.user.userId, niche_mode || 'manual', niche_product, instructions, post_time, post_days, is_enabled ? 1 : 0);
        }
        res.json({ success: true, message: 'Configurações salvas com sucesso!' });
    } catch (error) {
        console.error('Erro ao salvar configurações de IA:', error);
        res.status(500).json({ success: false, message: 'Erro ao salvar configurações' });
    }
});

// GET generate AI content
router.get('/generate', async (req, res) => {
    try {
        const { niche_mode, niche, instructions } = req.query;
        let selectedNiche = niche || '';
        
        // Se for modo automático (Perfil Dark), escolhemos um tema viral/curiosidade
        if (niche_mode === 'auto' || !selectedNiche) {
            const autoNiches = [
                "Curiosidades surpreendentes sobre o Universo e astronomia",
                "Fatos históricos bizarros que não são ensinados nas escolas",
                "Invenções tecnológicas incríveis que vão mudar o futuro",
                "Mistérios inexplicáveis do fundo do oceano",
                "Psicologia humana: truques mentais e fatos surpreendentes",
                "Cidades perdidas e mistérios das civilizações antigas",
                "Como o cérebro humano funciona: curiosidades intrigantes",
                "Estratégias de produtividade e hacks de vida dos bilionários",
                "Notícias incríveis do mundo da ciência e descobertas recentes",
                "Grandes mistérios do Egito Antigo"
            ];
            selectedNiche = autoNiches[Math.floor(Math.random() * autoNiches.length)];
        }
        
        let legenda = '';
        let promptImagemEn = '';
        let textOverlay = '';
        const geminiKey = process.env.GEMINI_API_KEY;
        
        if (geminiKey) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: `Você é um especialista em marketing de mídia social e fotografia. Crie um post para Instagram sobre o nicho/assunto: "${selectedNiche}". Instruções de legenda: "${instructions || 'Torne o post curioso e engajante. Instigue a interação nos comentários.'}".
                                
Responda EXCLUSIVAMENTE em formato JSON (sem formatação markdown de código, sem \`\`\`json), contendo as seguintes chaves:
{
  "legenda": "Legenda persuasiva em português com emojis e hashtags relevantes",
  "imagePrompt": "Descrição visual ultradetalhada da imagem em INGLÊS, estilo fotografia profissional de alta qualidade, 8k resolution, cinematic lighting, photorealistic, hyperrealistic, vibrant colors, aesthetic composition",
  "textOverlay": "Frase muito curta e impactante (máximo 6 palavras) em português para desenhar diretamente no topo da foto como manchete"
}`
                            }]
                        }]
                    })
                });
                const data = await response.json();
                if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
                    let rawText = data.candidates[0].content.parts[0].text.trim();
                    // Limpar sintaxe markdown se houver
                    rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
                    try {
                        const parsed = JSON.parse(rawText);
                        legenda = parsed.legenda;
                        promptImagemEn = parsed.imagePrompt;
                        textOverlay = parsed.textOverlay || '';
                    } catch(e) {
                        legenda = rawText;
                    }
                }
            } catch (err) {
                console.error("Erro ao chamar API do Gemini, usando gerador local:", err);
            }
        }
 
        // Se falhar ou não tiver chave Gemini, usar gerador local baseado em templates
        if (!legenda) {
            // Limpa caracteres especiais do nicho para criar hashtags
            const cleanNicheHashtag = selectedNiche
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9\s]/g, '')
                .replace(/\s+/g, '');
 
            const templates = [
                {
                    legenda: `✨ Você já parou para pensar nisso?\n\nNo mundo de "${selectedNiche}", pequenos detalhes mudam tudo! Estar por dentro desse assunto nos faz enxergar o mundo sob uma nova perspectiva.\n\n👉 Quer dominar esse tema? Clique no link da nossa bio e saiba mais!\n\n#${cleanNicheHashtag} #curiosidades #conhecimento #fatos #viral`,
                    textOverlay: "PENSOU NISSO?"
                },
                {
                    legenda: `💡 Curiosidade do dia sobre: "${selectedNiche}"!\n\nMuitos comentam, mas poucos compreendem a verdadeira essência deste assunto. Preparamos esse conteúdo especial para trazer insights valiosos.\n\n💬 O que você pensa sobre isso? Deixe sua opinião aqui nos comentários!\n\n#${cleanNicheHashtag} #novidades #aprendizado #sucesso`,
                    textOverlay: "CURIOSIDADE DO DIA!"
                },
                {
                    legenda: `🔥 Fato impressionante sobre "${selectedNiche}" que você provavelmente não sabia!\n\nA ciência, a história e as tendências nos mostram que sempre há algo novo a ser descobri-lo. Compartilhe esse post com aquele amigo que ama curiosidades!\n\n📲 Siga nosso perfil para mais conteúdos diários.\n\n#${cleanNicheHashtag} #misterio #descobertas #fatos`,
                    textOverlay: "VOCÊ SABIA?"
                }
            ];
            const chosenTemplate = templates[Math.floor(Math.random() * templates.length)];
            legenda = chosenTemplate.legenda;
            textOverlay = chosenTemplate.textOverlay;
            
            if (instructions) {
                legenda += `\n\n📌 Obs: ${instructions}`;
            }
        }
        // Gerar imagem do Pollinations AI com seed randômico e prompt profissional
        const seed = Math.floor(Math.random() * 1000000);
        
        let finalPrompt = promptImagemEn;
        if (!finalPrompt) {
            // Estilos e detalhes fotográficos aleatórios para garantir realismo e variedade sem repetição
            const realStyles = [
                "Stunning professional real action photography",
                "Cinematic high-detail outdoor photograph",
                "Close-up detailed action shot photography",
                "Dramatic natural lighting landscape photography",
                "Award-winning National Geographic style realistic photo"
            ];
            const cameraDetails = [
                "crisp focus, shallow depth of field, natural colors, shot on 85mm lens, f/1.8, extremely realistic",
                "action shot, sharp details, beautiful bokeh, professional color grading, golden hour lighting",
                "dramatic sunrise reflection, high resolution, photorealistic textures, 8k resolution, real life capture",
                "clear daylight, vivid natural environment, highly detailed water reflections, realistic, shot on DSLR"
            ];
            
            // Elementos extras para o nicho "pesca esportiva" ou outros
            let extraDetails = "";
            if (selectedNiche.toLowerCase().indexOf("pesca") > -1) {
                const fishingVariations = [
                    "showing a fisherman holding a fish at sunrise",
                    "showing a colorful fishing lure water splash",
                    "of a boat on a quiet misty lake",
                    "showing a close-up of a fly fishing reel",
                    "showing a giant fish jumping out of the water at sunset"
                ];
                extraDetails = ", " + fishingVariations[Math.floor(Math.random() * fishingVariations.length)];
            }
            
            const chosenStyle = realStyles[Math.floor(Math.random() * realStyles.length)];
            const chosenDetail = cameraDetails[Math.floor(Math.random() * cameraDetails.length)];
            
            finalPrompt = `${chosenStyle} representing ${selectedNiche}${extraDetails}, ${chosenDetail}`;
        }
        
        const imageUrl = `https://image.pollinations.ai/p/${encodeURIComponent(finalPrompt)}?width=1080&height=1080&nologo=true&seed=${seed}`;
 
        // Baixar a imagem no servidor e converter para base64 para bypassar CORS no cliente
        let imageBase64 = null;
        let imageMimeType = 'image/jpeg'; // fallback
        try {
            console.log(`[Proxy] Baixando imagem da IA: ${imageUrl}`);
            const imageRes = await fetch(imageUrl);
            if (imageRes.ok) {
                // Detectar o tipo real da imagem retornada
                const contentType = imageRes.headers.get('content-type') || '';
                if (contentType.includes('png')) {
                    imageMimeType = 'image/png';
                } else if (contentType.includes('webp')) {
                    imageMimeType = 'image/webp';
                } else if (contentType.includes('gif')) {
                    imageMimeType = 'image/gif';
                } else {
                    imageMimeType = 'image/jpeg';
                }
                const arrayBuffer = await imageRes.arrayBuffer();
                
                // Verificar se o conteúdo é uma imagem real (não HTML de erro)
                const firstBytes = Buffer.from(arrayBuffer.slice(0, 16));
                const isHTML = firstBytes.toString('utf8').trim().startsWith('<');
                if (isHTML) {
                    console.error("[Proxy] A resposta parece ser HTML, não uma imagem. Ignorando.");
                } else {
                    imageBase64 = Buffer.from(arrayBuffer).toString('base64');
                    console.log(`[Proxy] Imagem baixada com sucesso! Tipo: ${imageMimeType}, Tamanho: ${Math.round(arrayBuffer.byteLength / 1024)}KB`);
                }
            } else {
                console.error(`[Proxy] Erro de status ao baixar imagem: ${imageRes.status}`);
            }
        } catch (err) {
            console.error("[Proxy] Falha de conexão ao baixar imagem no proxy:", err);
        }
 
        res.json({ legenda, imageUrl, imageBase64, imageMimeType, textOverlay });
    } catch (error) {
        console.error('Erro na geração do post IA:', error);
        res.status(500).json({ error: 'Erro ao gerar conteúdo' });
    }
});

module.exports = router;
