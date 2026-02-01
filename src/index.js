// ============================================================
//         DISCORD AI BOT v3.0 - COMPLETE EDITION
//         All Features: AI, Voice, Search, URL, File, Image
// ============================================================

const {
    Client,
    GatewayIntentBits,
    Partials,  // <-- TAMBAH INI
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActivityType,
    Events
} = require('discord.js');

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    getVoiceConnection,
    StreamType
} = require('@discordjs/voice');

const { exec } = require('child_process');
const { createServer } = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const FormData = require('form-data');
const { EndBehaviorType } = require('@discordjs/voice');
const prism = require('prism-media');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const xlsx = require('xlsx');

const DynamicManager = require('./modules/dynamicManager');

// ==================== HEALTH SERVER ====================

const startTime = Date.now();

const healthServer = createServer((req, res) => {
    const status = {
        status: 'ok',
        bot: client?.user?.tag || 'starting...',
        version: '3.0.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        guilds: client?.guilds?.cache?.size || 0,
        features: {
            ai: true,
            voice: true,
            search: true,
            urlReading: true,
            fileReading: true,
            imageAnalysis: true
        }
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
});

healthServer.listen(process.env.PORT || 3000, () => console.log('🌐 Health server ready'));

// ==================== CONFIGURATION ====================

const CONFIG = {
    token: process.env.DISCORD_TOKEN,
    prefix: '.',
    adminIds: (process.env.ADMIN_IDS || '').split(',').filter(Boolean),
    tempPath: './temp',
    tavilyApiKey: process.env.TAVILY_API_KEY,
    serperApiKey: process.env.SERPER_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    groqApiKey: process.env.GROQ_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
    pollinationsApiKey: process.env.POLLINATIONS_API_KEY,
    maxConversationMessages: 100,
    maxConversationAge: 7200000,
    rateLimitWindow: 60000,
    rateLimitMax: 30,
    voiceInactivityTimeout: 300000,
    maxFileSize: 10 * 1024 * 1024,
    maxImageSize: 5 * 1024 * 1024,
        // ElevenLabs TTS Settings (Admin Only)
    elevenlabs: {
        apiKey: process.env.ELEVENLABS_API_KEY,
        modelId: 'eleven_multilingual_v2',
        defaultVoice: 'gmnazjXOFoOcWA59sd5m',
        adminOnly: true  // Hanya admin yang pakai ElevenLabs
    },
    // Voice AI Settings
        voiceAI: {
        enabled: true,
        whisperModel: 'whisper-large-v3-turbo',
        maxRecordingDuration: 30000,
        silenceDuration: 2000,
        minAudioLength: 500,
        supportedLanguages: ['id', 'en']
    }
}; // Pastikan ada titik koma dan kurung tutup di sini
// Initialize Dynamic Manager
const manager = new DynamicManager(process.env.REDIS_URL, CONFIG.adminIds);

// ==================== RATE LIMITER ====================

const rateLimits = new Map();

function checkRateLimit(userId) {
    const now = Date.now();
    const userLimit = rateLimits.get(userId);
    if (!userLimit || now > userLimit.resetAt) {
        rateLimits.set(userId, { count: 1, resetAt: now + CONFIG.rateLimitWindow });
        return { allowed: true, remaining: CONFIG.rateLimitMax - 1 };
    }
    if (userLimit.count >= CONFIG.rateLimitMax) {
        return { allowed: false, waitTime: Math.ceil((userLimit.resetAt - now) / 1000) };
    }
    userLimit.count++;
    return { allowed: true, remaining: CONFIG.rateLimitMax - userLimit.count };
}

// ==================== SEARCH TRIGGERS ====================

const SEARCH_TRIGGERS = [
    'berita', 'news', 'kabar', 'terbaru', 'hari ini', 'sekarang',
    'latest', 'current', 'today', 'recent', 'update', 'breaking',
    'terkini', 'baru saja', 'barusan', 'kemarin', 'minggu ini',
    '2024', '2025', '2026', '2027', '2028', '2029', '2030',
    'tahun ini', 'tahun lalu', 'tahun depan', 'kapan', 'jadwal',
    'harga', 'price', 'kurs', 'nilai tukar', 'saham', 'stock',
    'crypto', 'bitcoin', 'dollar', 'rupiah', 'biaya', 'tarif',
    'gaji', 'harga emas', 'ihsg',
    'cuaca', 'weather', 'hujan', 'gempa', 'banjir', 'suhu',
    'prakiraan', 'forecast',
    'siapa', 'who is', 'siapa presiden', 'siapa menteri',
    'profil', 'biodata', 'umur', 'meninggal',
    'trending', 'viral', 'populer', 'hits', 'fyp', 'gosip',
    'heboh', 'ramai', 'hot topic',
    'skor', 'score', 'hasil pertandingan', 'klasemen',
    'liga', 'piala dunia', 'final', 'motogp', 'f1',
    'rilis', 'release', 'launching', 'spesifikasi', 'spec',
    'review', 'fitur terbaru', 'update software'
];

// ==================== URL & FILE DETECTION ====================

function detectURLs(message) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = message.match(urlRegex) || [];
    return urls.filter(url => {
        const lower = url.toLowerCase();
        if (lower.match(/\.(jpg|jpeg|png|gif|mp4|mp3|zip|exe)$/i)) {
            return false;
        }
        if (lower.match(/bit\.ly|tinyurl|t\.co/)) {
            return false;
        }
        return true;
    });
}

function shouldAutoFetch(url) {
    const domain = new URL(url).hostname;
    const autoFetchDomains = [
        'github.com', 'stackoverflow.com', 'medium.com', 'dev.to',
        'docs.google.com', 'ai.google.dev', 'openai.com',
        'discord.js.org', 'npmjs.com', 'wikipedia.org',
        'youtube.com', 'youtu.be'
    ];
    return autoFetchDomains.some(d => domain.includes(d));
}

function isMediaFile(url) {
    // Jangan block YouTube URLs
    if (url.includes('youtube.com') || url.includes('youtu.be')) return false;
    return /\.(jpg|jpeg|png|gif|mp4|mp3|avi|mov|zip|rar)$/i.test(url);
}

function isShortener(url) {
    const shorteners = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'short.link'];
    return shorteners.some(s => url.includes(s));
}

// ==================== WEB SCRAPING FUNCTIONS ====================

async function fetchURLClean(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 15000
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        // Remove unwanted elements
        $('script').remove();
        $('style').remove();
        $('iframe').remove();
        $('noscript').remove();
        $('nav').remove();
        $('header').remove();
        $('footer').remove();
        $('aside').remove();
        $('.ad, .ads, .advertisement').remove();
        $('.banner, .promo, .promotion').remove();
        $('.sidebar, .widget, .related').remove();
        $('.comments, .comment-section').remove();
        $('.share, .social-share').remove();
        $('#ad, #ads, #advertisement').remove();
        $('[class*="advertisement"]').remove();
        $('[id*="google_ads"]').remove();
        $('img[width="1"]').remove();
        $('img[height="1"]').remove();
        
        // Extract main content
        let mainContent = '';
        
        if ($('article').length) {
            mainContent = $('article').first().text();
        } else if ($('main').length) {
            mainContent = $('main').first().text();
        } else if ($('.post-content, .entry-content, .article-body, .content').length) {
            mainContent = $('.post-content, .entry-content, .article-body, .content').first().text();
        } else {
            mainContent = $('body').text();
        }
        
        // Clean whitespace
        mainContent = mainContent.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
        
        return mainContent.slice(0, 8000);
        
    } catch (error) {
        console.error('Error fetching URL:', url, error.message);
        throw error;
    }
}

async function readGitHubFile(url) {
    try {
        const rawUrl = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
        const response = await fetch(rawUrl);
        if (!response.ok) throw new Error('File not found');
        return await response.text();
    } catch (error) {
        throw new Error('Failed to read GitHub file');
    }
}

// ==================== FILE READING FUNCTIONS ====================

async function readTextFile(buffer) {
    return buffer.toString('utf-8');
}

async function readPDFFile(buffer) {
    try {
        const data = await pdfParse(buffer);
        return data.text;
    } catch (error) {
        throw new Error('Failed to read PDF');
    }
}

async function readDOCXFile(buffer) {
    try {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    } catch (error) {
        throw new Error('Failed to read DOCX');
    }
}

async function readExcelFile(buffer) {
    try {
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        let text = '';
        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            text += `Sheet: ${sheetName}\n`;
            text += xlsx.utils.sheet_to_txt(sheet) + '\n\n';
        });
        return text;
    } catch (error) {
        throw new Error('Failed to read Excel file');
    }
}

async function readFile(attachment) {
    const response = await fetch(attachment.url);
    const buffer = await response.buffer();
    
    const ext = path.extname(attachment.name).toLowerCase();
    
    switch (ext) {
        case '.txt':
        case '.js':
        case '.py':
        case '.json':
        case '.md':
        case '.yml':
        case '.yaml':
        case '.xml':
        case '.html':
        case '.css':
        case '.cpp':
        case '.c':
        case '.java':
        case '.ts':
        case '.tsx':
        case '.jsx':
            return await readTextFile(buffer);
        case '.pdf':
            return await readPDFFile(buffer);
        case '.docx':
        case '.doc':
            return await readDOCXFile(buffer);
        case '.xlsx':
        case '.xls':
        case '.csv':
            return await readExcelFile(buffer);
        default:
            throw new Error(`Unsupported file type: ${ext}`);
    }
}

// ==================== IMAGE ANALYSIS ====================

async function analyzeImage(imageUrl, prompt = '') {
    const apiKey = await manager.getActiveKey('gemini', CONFIG.geminiApiKey);
    if (!apiKey) throw new Error('No Gemini API key for image analysis');
    
    // Fetch image as base64
    const imageResponse = await fetch(imageUrl);
    const buffer = await imageResponse.buffer();
    const base64 = buffer.toString('base64');
    
    const requestBody = {
        contents: [{
            parts: [
                {
                    inline_data: {
                        mime_type: imageResponse.headers.get('content-type') || 'image/jpeg',
                        data: base64
                    }
                },
                {
                    text: prompt || 'Jelaskan gambar ini dalam Bahasa Indonesia dengan detail.'
                }
            ]
        }],
        generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 2048
        }
    };
    
    const { data, statusCode } = await httpRequest({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify(requestBody));
    
    if (statusCode !== 200) {
        const result = JSON.parse(data);
        throw new Error(result.error?.message || `HTTP ${statusCode}`);
    }
    
    const result = JSON.parse(data);
    if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
        return result.candidates[0].content.parts[0].text;
    }
    throw new Error('No response from Gemini Vision');
}

// ==================== SEARCH FUNCTIONS ====================

function shouldSearch(message) {
    const lower = message.toLowerCase();
    return SEARCH_TRIGGERS.some(trigger => lower.includes(trigger));
}

async function searchSerper(query) {
    if (!CONFIG.serperApiKey) return null;
    return new Promise((resolve) => {
        const postData = JSON.stringify({ q: query, gl: 'id', hl: 'id', num: 5 });
        const req = https.request({
            hostname: 'google.serper.dev',
            path: '/search',
            method: 'POST',
            headers: { 'X-API-KEY': CONFIG.serperApiKey, 'Content-Type': 'application/json' },
            timeout: 15000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { 
                    if (res.statusCode === 200) {
                        const result = JSON.parse(data);
                        // Extract URLs from organic results
                        const urls = result.organic?.slice(0, 3).map(r => r.link).filter(Boolean) || [];
                        resolve({ ...result, urls });
                    } else {
                        resolve(null);
                    }
                } catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(postData);
        req.end();
    });
}

async function searchTavily(query) {
    if (!CONFIG.tavilyApiKey) return null;
    return new Promise((resolve) => {
        const postData = JSON.stringify({ 
            api_key: CONFIG.tavilyApiKey, 
            query, 
            include_answer: true, 
            max_results: 5 
        });
        const req = https.request({
            hostname: 'api.tavily.com',
            path: '/search',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { 
                    if (res.statusCode === 200) {
                        const result = JSON.parse(data);
                        // Extract URLs from results
                        const urls = result.results?.slice(0, 3).map(r => r.url).filter(Boolean) || [];
                        resolve({ ...result, urls });
                    } else {
                        resolve(null);
                    }
                } catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(postData);
        req.end();
    });
}

async function performSearch(query, provider = 'auto') {
    const now = new Date().toLocaleDateString('id-ID', { dateStyle: 'full', timeZone: 'Asia/Jakarta' });
    let result = { timestamp: now, answer: null, facts: [], urls: [], source: null };
    
    if (provider === 'serper' || provider === 'auto') {
        const serper = await searchSerper(query);
        if (serper) {
            result.source = 'serper';
            result.urls = serper.urls || [];
            if (serper.answerBox) result.answer = serper.answerBox.answer || serper.answerBox.snippet;
            if (serper.organic) result.facts = serper.organic.slice(0, 3).map(o => o.snippet).filter(Boolean);
            if (result.answer || result.facts.length || result.urls.length) return result;
        }
    }
    
    if (provider === 'tavily' || provider === 'auto') {
        const tavily = await searchTavily(query);
        if (tavily) {
            result.source = 'tavily';
            result.urls = tavily.urls || [];
            if (tavily.answer) result.answer = tavily.answer;
            if (tavily.results) result.facts = tavily.results.slice(0, 3).map(r => r.content?.slice(0, 200)).filter(Boolean);
            if (result.answer || result.facts.length || result.urls.length) return result;
        }
    }
    
    return null;
}

// ==================== REASONING FUNCTIONS ====================

function parseThinkingResponse(text) {
    const thinkingPatterns = [
        /\[THINKING\](.*?)\[\/THINKING\]/s,
        /<thinking>(.*?)<\/thinking>/s,
        /💭 Thinking:(.*?)(?=\n\n[^💭])/s
    ];
    
    let thinking = '';
    let answer = text;
    
    for (const pattern of thinkingPatterns) {
        const match = text.match(pattern);
        if (match) {
            thinking = match[1].trim();
            answer = text.replace(match[0], '').trim();
            break;
        }
    }
    
    return { thinking, answer };
}

function buildContextPrompt(query, contents, isThinking = true) {
    const timestamp = new Date().toLocaleDateString('id-ID', { 
        dateStyle: 'full', 
        timeZone: 'Asia/Jakarta' 
    });
    
    let prompt = `${SYSTEM_PROMPT}

[CURRENT DATE: ${timestamp}]

[INSTRUCTION]
You will receive content from multiple sources. Analyze them carefully and answer the user's question in Bahasa Indonesia.
`;

    if (isThinking) {
        prompt += `
THINK STEP BY STEP:
1. Identify key information from each source
2. Cross-reference facts across sources
3. Determine most reliable information
4. Formulate comprehensive answer

Format your response as:
[THINKING]
Your step-by-step reasoning here...
[/THINKING]

[ANSWER]
Your final answer here...
[/ANSWER]
`;
    }

    prompt += '\n[SOURCES]\n';
    
    contents.forEach((c, i) => {
        prompt += `\n--- Source ${i + 1}: ${c.url || c.name || 'Unknown'} ---\n${c.content || c.text}\n`;
    });
    
    prompt += `\n[USER QUESTION]\n${query}`;
    
    return prompt;
}

// ==================== SYSTEM PROMPT ====================

const SYSTEM_PROMPT = `Kamu adalah Toing, asisten AI premium yang elegan, cerdas, dan profesional.

## IDENTITAS
- Nama: Toing
- Kepribadian: Hangat, cerdas, humoris namun tetap profesional
- Gaya bicara: Santai tapi berkelas, seperti teman pintar yang menyenangkan

## KEMAMPUAN KHUSUS
- Bisa membaca dan analisis URL/website
- Bisa membaca file dokumen (PDF, Word, Excel, dll)
- Bisa analisis gambar dan foto
- Bisa search internet untuk informasi terkini
- Bisa generate voice/TTS

## PRINSIP UTAMA

### 1. KEJUJURAN ABSOLUT
- JANGAN PERNAH mengarang fakta atau informasi
- Jika tidak tahu, katakan dengan jujur
- Bedakan dengan jelas antara FAKTA, OPINI, dan SPEKULASI
- Sebutkan jika informasi mungkin sudah tidak update
- Tidak halusinasi dan mengingat komunikasi dari awal sampai akhir
- Selalu konsisten dengan pengetahuan coding nya kecuali user meminta di rubah

### 2. WAWASAN LUAS
- Berikan jawaban yang mendalam dan komprehensif
- Sertakan konteks yang relevan
- Hubungkan topik dengan pengetahuan terkait jika membantu
- Gunakan analogi sederhana untuk menjelaskan konsep kompleks

### 3. KEJELASAN & STRUKTUR
- Gunakan format yang rapi untuk informasi kompleks
- Prioritaskan informasi paling penting di awal
- Hindari jargon kecuali diperlukan
- Sesuaikan panjang jawaban dengan kompleksitas pertanyaan

### 4. PROFESIONAL TAPI MENYENANGKAN
- Gunakan bahasa Indonesia & Inggris yang baik dan natural
- Boleh sisipkan humor ringan yang relevan
- Gunakan emoji secukupnya untuk menambah ekspresi
- Tetap sopan dan respectful dalam semua situasi

## PANDUAN RESPONS

### Untuk Pertanyaan Faktual:
- Berikan jawaban akurat dan terverifikasi
- Sertakan sumber atau dasar informasi jika relevan
- Akui keterbatasan jika topik di luar jangkauan pengetahuan

### Untuk Analisis File/Gambar:
- Jelaskan dengan detail apa yang dilihat/dibaca
- Berikan insight yang berguna
- Tawarkan saran atau rekomendasi jika relevan

### Untuk Voice Response:
- Jawab ringkas dalam 2-4 kalimat
- Langsung ke poin utama
- Gunakan bahasa yang mudah dipahami saat didengar

Ingat: Lebih baik jujur tidak tahu daripada memberikan informasi yang salah.`;
// ==================== POLLINATIONS MODELS (SHARED) ====================

const POLLINATIONS_MODELS = [
    // OpenAI Models
    { id: 'openai', name: 'OpenAI GPT', version: 'GPT-5-nano' },
    { id: 'openai-fast', name: 'OpenAI Fast', version: 'GPT-5-fast' },
    { id: 'openai-large', name: 'OpenAI Large', version: 'GPT-5-large' },
    { id: 'openai-reasoning', name: 'OpenAI Reasoning', version: 'o3-mini' },
    { id: 'openai-audio', name: 'OpenAI Audio', version: 'GPT-4o-audio' },
    // Claude Models
    { id: 'claude', name: 'Claude', version: 'Claude-3.5' },
    { id: 'claude-fast', name: 'Claude Fast', version: 'Claude-fast' },
    { id: 'claude-large', name: 'Claude Large', version: 'Claude-large' },
    { id: 'claude-haiku', name: 'Claude Haiku', version: 'Haiku-4.5' },
    { id: 'claude-sonnet', name: 'Claude Sonnet', version: 'Sonnet-4.5' },
    { id: 'claude-opus', name: 'Claude Opus', version: 'Opus-4.5' },
    // Gemini Models
    { id: 'gemini', name: 'Gemini', version: 'Gemini-3-Flash' },
    { id: 'gemini-fast', name: 'Gemini Fast', version: 'Gemini-fast' },
    { id: 'gemini-large', name: 'Gemini Large', version: 'Gemini-large' },
    { id: 'gemini-search', name: 'Gemini Search', version: 'Gemini-search' },
    { id: 'gemini-legacy', name: 'Gemini Legacy', version: 'Gemini-2.5' },
    { id: 'gemini-thinking', name: 'Gemini Thinking', version: 'Thinking' },
    // DeepSeek Models
    { id: 'deepseek', name: 'DeepSeek', version: 'V3' },
    { id: 'deepseek-v3', name: 'DeepSeek V3', version: 'V3-latest' },
    { id: 'deepseek-r1', name: 'DeepSeek R1', version: 'R1' },
    { id: 'deepseek-reasoning', name: 'DeepSeek Reasoning', version: 'R1-Reasoner' },
    // Qwen Models
    { id: 'qwen', name: 'Qwen', version: 'Qwen3' },
    { id: 'qwen-coder', name: 'Qwen Coder', version: 'Qwen3-Coder' },
    // Llama Models
    { id: 'llama', name: 'Llama', version: 'Llama-3.3' },
    { id: 'llamalight', name: 'Llama Light', version: 'Llama-70B' },
    // Mistral Models
    { id: 'mistral', name: 'Mistral', version: 'Mistral-Small' },
    { id: 'mistral-small', name: 'Mistral Small', version: 'Mistral-3.2' },
    { id: 'mistral-large', name: 'Mistral Large', version: 'Mistral-Large' },
    // Perplexity Models
    { id: 'perplexity-fast', name: 'Perplexity Fast', version: 'Sonar' },
    { id: 'perplexity-reasoning', name: 'Perplexity Reasoning', version: 'Sonar-Pro' },
    // Chinese AI Models
    { id: 'kimi', name: 'Kimi', version: 'Kimi-K2.5' },
    { id: 'kimi-large', name: 'Kimi Large', version: 'Kimi-large' },
    { id: 'kimi-reasoning', name: 'Kimi Reasoning', version: 'Kimi-reasoning' },
    { id: 'glm', name: 'GLM', version: 'GLM-4.7' },
    { id: 'minimax', name: 'MiniMax', version: 'M2.1' },
    // Grok Models
    { id: 'grok', name: 'Grok', version: 'Grok-4' },
    { id: 'grok-fast', name: 'Grok Fast', version: 'Grok-fast' },
    // Amazon Nova
    { id: 'nova-fast', name: 'Nova Fast', version: 'Amazon-Nova' },
    // Microsoft Phi
    { id: 'phi', name: 'Phi', version: 'Phi-4' },
    // Search/Tool Models
    { id: 'searchgpt', name: 'SearchGPT', version: 'v1' },
    // Creative/Art Models
    { id: 'midijourney', name: 'Midijourney', version: 'v1' },
    { id: 'unity', name: 'Unity', version: 'v1' },
    { id: 'rtist', name: 'Rtist', version: 'v1' },
    // Special/Character Models
    { id: 'evil', name: 'Evil Mode', version: 'Uncensored' },
    { id: 'p1', name: 'P1', version: 'v1' },
    { id: 'hormoz', name: 'Hormoz', version: 'v1' },
    { id: 'sur', name: 'Sur', version: 'v1' },
    { id: 'bidara', name: 'Bidara', version: 'v1' },
    // Education/Utility Models
    { id: 'chickytutor', name: 'ChickyTutor', version: 'Education' },
    { id: 'nomnom', name: 'NomNom', version: 'Food' }
];

// ==================== AI PROVIDERS ====================

const AI_PROVIDERS = {
    gemini: {
    name: 'Google Gemini',
    models: [
        { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', version: '3.0-pro' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', version: '3.0-flash' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', version: '2.5-pro' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', version: '2.5-flash' },
        { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', version: '2.5-lite' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', version: '2.0-flash' },
        { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', version: '2.0-lite' },
        { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', version: 'latest' },
        { id: 'gemini-pro-latest', name: 'Gemini Pro Latest', version: 'latest' },
        { id: 'gemma-3-27b-it', name: 'Gemma 3 27B', version: '27B' },
        { id: 'gemma-3-12b-it', name: 'Gemma 3 12B', version: '12B' },
        { id: 'gemma-3-4b-it', name: 'Gemma 3 4B', version: '4B' },
        { id: 'deep-research-pro-preview-12-2025', name: 'Deep Research Pro', version: 'research' }
    ]
},

    groq: {
        name: 'Groq',
        models: [
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', version: 'v3.3' },
            { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', version: 'v3.1' },
            { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', version: '120B' },
            { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', version: '20B' },
            { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', version: '8x7B' },
            { id: 'gemma2-9b-it', name: 'Gemma 2 9B', version: '9B' },
            { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick', version: '17B-128E' },
            { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', version: '17B-16E' },
            { id: 'moonshotai/kimi-k2-instruct-0905', name: 'Kimi K2', version: 'K2' },
            { id: 'qwen/qwen-3-32b', name: 'Qwen 3 32B', version: '32B' },
            { id: 'llama-3-groq-70b-tool-use', name: 'Llama 3 70B Tool', version: '70B-tool' },
            { id: 'llama-3-groq-8b-tool-use', name: 'Llama 3 8B Tool', version: '8B-tool' }
        ]
    },

    openrouter: {
        name: 'OpenRouter',
        models: [
            { id: 'arcee-ai/trinity-large-preview:free', name: 'Trinity Large Preview (free)', version: 'Large' },
            { id: 'upstage/solar-pro-3:free', name: 'Solar Pro 3 (free)', version: 'Pro-3' },
            { id: 'liquid/lfm-2.5-1.2b-thinking:free', name: 'LFM2.5-1.2B-Thinking (free)', version: '1.2B' },
            { id: 'liquid/lfm-2.5-1.2b-instruct:free', name: 'LFM2.5-1.2B-Instruct (free)', version: '1.2B' },
            { id: 'allenai/molmo-2-8b:free', name: 'Molmo2 8B (free)', version: '8B' },
            { id: 'tngtech/deepseek-r1t-chimera:free', name: 'R1T Chimera (free)', version: 'R1T' },
            { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air (free)', version: '4.5-Air' },
            { id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free', name: 'Uncensored (free)', version: '24B' },
            { id: 'google/gemma-3n-e2b-it:free', name: 'Gemma 3n 2B (free)', version: '3n-2B' },
            { id: 'tngtech/deepseek-r1t2-chimera:free', name: 'DeepSeek R1T2 Chimera (free)', version: 'R1T2' },
            { id: 'deepseek/deepseek-r1-0528:free', name: 'R1 0528 (free)', version: '0528' },
            { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1 24B (free)', version: '24B' },
            { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (free)', version: '2.0-flash' },
            { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)', version: '70B' },
            { id: 'meta-llama/llama-3.1-405b-instruct:free', name: 'Llama 3.1 405B (free)', version: '405B' },
            { id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder (free)', version: 'Coder' },
            { id: 'moonshotai/kimi-k2:free', name: 'Kimi K2 (free)', version: 'K2' },
            { id: 'openai/gpt-oss-120b:free', name: 'GPT OSS 120B (free)', version: '120B' },
            { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 405B (free)', version: '405B' }
        ]
    },

    pollinations_free: {
        name: 'Pollinations (Free)',
        requiresKey: false,
        models: POLLINATIONS_MODELS
    },

    pollinations_api: {
        name: 'Pollinations (API)',
        requiresKey: true,
        models: POLLINATIONS_MODELS
    },

    huggingface: {
        name: 'HuggingFace',
        models: [
            { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B', version: '3.1-8B' },
            { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', version: '3.3-70B' },
            { id: 'HuggingFaceH4/zephyr-7b-beta', name: 'Zephyr 7B', version: '7B-beta' },
            { id: 'mistralai/Mistral-7B-Instruct-v0.1', name: 'Mistral 7B', version: '7B-v0.1' },
            { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B', version: '8x7B' },
            { id: 'google/flan-t5-large', name: 'Flan T5 Large', version: 'T5-large' },
            { id: 'EleutherAI/gpt-j-6B', name: 'GPT-J 6B', version: '6B' },
            { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', version: '2.5-72B' },
            { id: 'google/gemma-2-27b-it', name: 'Gemma 2 27B', version: '2-27B' }
        ]
    }
};

// ==================== TTS VOICES ====================

// Edge-TTS Voices (FREE - untuk semua user)
const EDGE_TTS_VOICES = [
    // Indonesia
    { id: 'id-ID-GadisNeural', name: '🇮🇩 Gadis (Wanita)', lang: 'id' },
    { id: 'id-ID-ArdiNeural', name: '🇮🇩 Ardi (Pria)', lang: 'id' },
    // English US
    { id: 'en-US-JennyNeural', name: '🇺🇸 Jenny (Female)', lang: 'en' },
    { id: 'en-US-GuyNeural', name: '🇺🇸 Guy (Male)', lang: 'en' },
    { id: 'en-US-AriaNeural', name: '🇺🇸 Aria (Female)', lang: 'en' },
    { id: 'en-US-DavisNeural', name: '🇺🇸 Davis (Male)', lang: 'en' },
    // English UK
    { id: 'en-GB-SoniaNeural', name: '🇬🇧 Sonia (Female)', lang: 'en' },
    { id: 'en-GB-RyanNeural', name: '🇬🇧 Ryan (Male)', lang: 'en' },
    // Japanese
    { id: 'ja-JP-NanamiNeural', name: '🇯🇵 Nanami (Female)', lang: 'ja' },
    { id: 'ja-JP-KeitaNeural', name: '🇯🇵 Keita (Male)', lang: 'ja' },
    // Korean
    { id: 'ko-KR-SunHiNeural', name: '🇰🇷 SunHi (Female)', lang: 'ko' },
    { id: 'ko-KR-InJoonNeural', name: '🇰🇷 InJoon (Male)', lang: 'ko' },
    // Chinese
    { id: 'zh-CN-XiaoxiaoNeural', name: '🇨🇳 Xiaoxiao (Female)', lang: 'zh' },
    { id: 'zh-CN-YunxiNeural', name: '🇨🇳 Yunxi (Male)', lang: 'zh' },
    // French
    { id: 'fr-FR-DeniseNeural', name: '🇫🇷 Denise (Female)', lang: 'fr' },
    { id: 'fr-FR-HenriNeural', name: '🇫🇷 Henri (Male)', lang: 'fr' },
    // German
    { id: 'de-DE-KatjaNeural', name: '🇩🇪 Katja (Female)', lang: 'de' },
    { id: 'de-DE-ConradNeural', name: '🇩🇪 Conrad (Male)', lang: 'de' },
    // Spanish
    { id: 'es-ES-ElviraNeural', name: '🇪🇸 Elvira (Female)', lang: 'es' },
    { id: 'es-MX-DaliaNeural', name: '🇲🇽 Dalia (Female)', lang: 'es' },
    // Portuguese
    { id: 'pt-BR-FranciscaNeural', name: '🇧🇷 Francisca (Female)', lang: 'pt' },
    { id: 'pt-BR-AntonioNeural', name: '🇧🇷 Antonio (Male)', lang: 'pt' },
    // Russian
    { id: 'ru-RU-SvetlanaNeural', name: '🇷🇺 Svetlana (Female)', lang: 'ru' },
    { id: 'ru-RU-DmitryNeural', name: '🇷🇺 Dmitry (Male)', lang: 'ru' }
];

// ElevenLabs Voices (PREMIUM - hanya admin)
const ELEVENLABS_VOICES = [
    // ===== YOUR SELECTED VOICE =====
    { id: 'gmnazjXOFoOcWA59sd5m', name: '🎙️ Default Voice', lang: 'multi' },
    
    // ===== ELEVENLABS PREMADE =====
    { id: 'EXAVITQu4vr4xnSDxMaL', name: '🇺🇸 Bella (Female)', lang: 'en' },
    { id: 'ErXwobaYiN019PkySvjV', name: '🇺🇸 Antoni (Male)', lang: 'en' },
    { id: 'MF3mGyEYCl7XYWbV9V6O', name: '🇺🇸 Elli (Female)', lang: 'en' },
    { id: 'TxGEqnHWrfWFTfGW9XjX', name: '🇺🇸 Josh (Male)', lang: 'en' },
    { id: 'VR6AewLTigWG4xSOukaG', name: '🇺🇸 Arnold (Male)', lang: 'en' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: '🇺🇸 Adam (Male)', lang: 'en' },
    { id: 'yoZ06aMxZJJ28mfd3POQ', name: '🇺🇸 Sam (Male)', lang: 'en' },
    { id: '21m00Tcm4TlvDq8ikWAM', name: '🇺🇸 Rachel (Female)', lang: 'en' },
    { id: 'AZnzlk1XvdvUeBnXmlld', name: '🇺🇸 Domi (Female)', lang: 'en' },
    { id: 'IKne3meq5aSn9XLyUdCD', name: '🇺🇸 Charlie (Male)', lang: 'en' },
    { id: 'XB0fDUnXU5powFXDhCwa', name: '🇬🇧 Charlotte (Female)', lang: 'en' },
    { id: 'Yko7PKs66umPhCgzNzNg', name: '🇬🇧 Thomas (Male)', lang: 'en' },
    { id: 'pFZP5JQG7iQjIQuC4Bku', name: '🇬🇧 Lily (Female)', lang: 'en' },
    { id: 'TX3LPaxmHKxFdv7VOQHJ', name: '🇺🇸 Liam (Male)', lang: 'en' },
    { id: 'XrExE9yKIg1WjnnlVkGX', name: '🇺🇸 Matilda (Female)', lang: 'en' },
    
    // ===== TAMBAHKAN VOICE BARU DI SINI =====
    // { id: 'YOUR_VOICE_ID', name: '🎤 Nama Voice', lang: 'id' },
];

// Helper functions
function getTTSVoices(provider) {
    return provider === 'elevenlabs' ? ELEVENLABS_VOICES : EDGE_TTS_VOICES;
}

function getDefaultVoice(provider) {
    return provider === 'elevenlabs' 
        ? 'gmnazjXOFoOcWA59sd5m' 
        : 'id-ID-GadisNeural';
}

// Backward compatibility
const TTS_VOICES = EDGE_TTS_VOICES;

// ==================== DEFAULT SETTINGS ====================

const DEFAULT_SETTINGS = {
    aiProvider: 'groq',
    aiModel: 'llama-3.3-70b-versatile',
    ttsProvider: 'edge-tts',           // 'elevenlabs' atau 'edge-tts'
    ttsVoice: 'id-ID-GadisNeural',     // Default untuk edge-tts
    ttsVoiceElevenlabs: 'gmnazjXOFoOcWA59sd5m',  // Default untuk elevenlabs
    searchEnabled: true,
    searchProvider: 'auto',
    geminiGrounding: true
};

// ==================== CLIENT & STORAGE ====================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
    presence: { status: 'online', activities: [{ name: '.help | AI Assistant', type: ActivityType.Listening }] }
});

const guildSettings = new Map();
const voiceConnections = new Map();
const audioPlayers = new Map();
const ttsQueues = new Map();
const conversations = new Map();
// ==================== VOICE AI STORAGE ====================
const voiceRecordings = new Map();
const voiceAISessions = new Map();
const processingUsers = new Set();

function getSettings(guildId) {
    if (!guildSettings.has(guildId)) guildSettings.set(guildId, { ...DEFAULT_SETTINGS });
    return guildSettings.get(guildId);
}

function updateSettings(guildId, key, value) {
    const s = getSettings(guildId);
    s[key] = value;
}

function isAdmin(userId) {
    // Convert to string untuk memastikan comparison benar
    return CONFIG.adminIds.includes(String(userId));
}

// ==================== CONVERSATION MEMORY ====================

function getConversation(guildId, userId) {
    const key = `${guildId}-${userId}`;
    if (!conversations.has(key)) {
        conversations.set(key, { messages: [], createdAt: Date.now(), lastActivity: Date.now() });
    }
    const conv = conversations.get(key);
    conv.lastActivity = Date.now();
    return conv;
}

function addToConversation(guildId, userId, role, content) {
    const conv = getConversation(guildId, userId);
    conv.messages.push({ role, content, timestamp: Date.now() });
    if (conv.messages.length > CONFIG.maxConversationMessages) {
        conv.messages = conv.messages.slice(-CONFIG.maxConversationMessages);
    }
}

function clearConversation(guildId, userId) {
    conversations.delete(`${guildId}-${userId}`);
}

setInterval(() => {
    const now = Date.now();
    for (const [key, conv] of conversations) {
        if (now - conv.lastActivity > CONFIG.maxConversationAge) {
            conversations.delete(key);
        }
    }
}, 300000);

// ==================== UTILITIES ====================

function ensureTempDir() {
    if (!fs.existsSync(CONFIG.tempPath)) {
        fs.mkdirSync(CONFIG.tempPath, { recursive: true });
    }
}

function cleanupFile(filepath) {
    try { if (filepath && fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch (e) {}
}

function splitMessage(text, maxLength = 1900) {
    if (text.length <= maxLength) return [text];
    const parts = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= maxLength) { parts.push(remaining); break; }
        let idx = remaining.lastIndexOf('\n', maxLength);
        if (idx === -1 || idx < maxLength / 2) idx = remaining.lastIndexOf('. ', maxLength);
        if (idx === -1 || idx < maxLength / 2) idx = remaining.lastIndexOf(' ', maxLength);
        if (idx === -1) idx = maxLength;
        parts.push(remaining.slice(0, idx + 1));
        remaining = remaining.slice(idx + 1);
    }
    return parts;
}

// ==================== HTTP HELPER ====================

function httpRequest(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ data, statusCode: res.statusCode }));
        });
        req.on('error', reject);
        req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
        if (body) req.write(body);
        req.end();
    });
}

// ==================== TTS FUNCTIONS ====================

function cleanTextForTTS(text) {
    return text
        .replace(/https?:\/\/[^\s]+/g, '')
        .replace(/www\.[^\s]+/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
        .replace(/[\u{2600}-\u{27BF}]/gu, '')
        .replace(/:[a-zA-Z0-9_]+:/g, '')
        .replace(/```[\w]*\n?([\s\S]*?)```/g, ' kode ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/#{1,6}\s*/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\s+/g, ' ')
        .trim();
}

async function generateTTS(text, voice, userId = null) {
    ensureTempDir();
    const outputPath = path.join(CONFIG.tempPath, `tts_${Date.now()}.mp3`);
    const safeText = cleanTextForTTS(text).slice(0, 2500);

    if (!safeText || safeText.length < 2) {
        throw new Error('Text too short');
    }

    const apiKey = CONFIG.elevenlabs?.apiKey;
    const userIsAdmin = userId ? isAdmin(String(userId)) : false;
    const hasValidKey = apiKey && apiKey !== 'xxx' && apiKey.length > 10;
    
    // Debug log
    console.log(`🔊 TTS: userId=${userId}, isAdmin=${userIsAdmin}, hasKey=${hasValidKey}`);
    
    // ElevenLabs hanya untuk admin + jika ada API key
    const useElevenlabs = userIsAdmin && hasValidKey;
    
    if (useElevenlabs) {
        try {
            // Pastikan voice adalah ElevenLabs voice ID
            const elevenVoice = isElevenlabsVoice(voice) ? voice : CONFIG.elevenlabs.defaultVoice;
            await generateElevenLabsTTS(safeText, elevenVoice, outputPath);
            console.log(`🔊 ElevenLabs (Admin) | Voice: ${elevenVoice}`);
            return outputPath;
        } catch (error) {
            console.error('❌ ElevenLabs error:', error.message);
            console.log('⚠️ Falling back to edge-tts...');
        }
    }
    
    // Edge-TTS untuk user biasa atau fallback
    const edgeVoice = isEdgeTTSVoice(voice) ? voice : 'id-ID-GadisNeural';
    await generateEdgeTTS(safeText, edgeVoice, outputPath);
    console.log(`🔊 Edge-TTS${userIsAdmin ? ' (Fallback)' : ''} | Voice: ${edgeVoice}`);
    
    return outputPath;
}

// Check apakah voice ID adalah ElevenLabs
function isElevenlabsVoice(voiceId) {
    return ELEVENLABS_VOICES.some(v => v.id === voiceId);
}

// Check apakah voice ID adalah Edge-TTS
function isEdgeTTSVoice(voiceId) {
    return voiceId.includes('Neural') || EDGE_TTS_VOICES.some(v => v.id === voiceId);
}

async function generateElevenLabsTTS(text, voiceId, outputPath) {
    const apiKey = CONFIG.elevenlabs.apiKey;
    const modelId = CONFIG.elevenlabs.modelId || 'eleven_multilingual_v2';
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': apiKey
        },
        body: JSON.stringify({
            text: text,
            model_id: modelId,
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0.0,
                use_speaker_boost: true
            }
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API: ${response.status} - ${errorText}`);
    }
    
    const audioBuffer = await response.buffer();
    
    if (audioBuffer.length < 1000) {
        throw new Error('ElevenLabs returned empty audio');
    }
    
    fs.writeFileSync(outputPath, audioBuffer);
    return outputPath;
}

function generateEdgeTTS(text, voice, outputPath) {
    return new Promise((resolve, reject) => {
        const safeText = text.replace(/"/g, "'").replace(/`/g, "'");
        const cmd = `edge-tts --voice "${voice}" --text "${safeText}" --write-media "${outputPath}"`;
        
        exec(cmd, { timeout: 30000 }, (err) => {
            if (err) reject(err);
            else resolve(outputPath);
        });
    });
}

// ==================== AI PROVIDER CALLS ====================

async function callGemini(model, message, history, systemPrompt, useGrounding = false) {
    const apiKey = await manager.getActiveKey('gemini', CONFIG.geminiApiKey);
    if (!apiKey) throw new Error('No Gemini API key');

    const contents = [];
    history.slice(-20).forEach(m => {
        contents.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        });
    });
    contents.push({ role: 'user', parts: [{ text: message }] });

    const requestBody = {
        contents: contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { 
            temperature: 0.7, 
            topP: 0.95, 
            topK: 40, 
            maxOutputTokens: 8192
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
    };

    if (useGrounding) {
        requestBody.tools = [{ googleSearch: {} }];
    }

    const { data, statusCode } = await httpRequest({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify(requestBody));

    if (statusCode !== 200) {
        const result = JSON.parse(data);
        throw new Error(result.error?.message || `HTTP ${statusCode}`);
    }

    const result = JSON.parse(data);
    if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
        return {
            text: result.candidates[0].content.parts[0].text,
            grounded: !!result.candidates[0]?.groundingMetadata
        };
    }
    throw new Error('No response from Gemini');
}

async function callGroq(model, message, history, systemPrompt) {
    const apiKey = await manager.getActiveKey('groq', CONFIG.groqApiKey);
    if (!apiKey) throw new Error('No Groq API key');

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-30).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
    ];

    const { data, statusCode } = await httpRequest({
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    }, JSON.stringify({ model, messages, max_completion_tokens: 8000, temperature: 0.7 }));

    if (statusCode !== 200) {
        const result = JSON.parse(data);
        throw new Error(result.error?.message || `HTTP ${statusCode}`);
    }

    const result = JSON.parse(data);
    return result.choices[0].message.content;
}

async function callOpenRouter(model, message, history, systemPrompt) {
    const apiKey = await manager.getActiveKey('openrouter', CONFIG.openrouterApiKey);
    if (!apiKey) throw new Error('No OpenRouter API key');

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-30).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
    ];

    const { data, statusCode } = await httpRequest({
        hostname: 'openrouter.ai',
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://discord.com',
            'X-Title': 'Discord AI Bot'
        }
    }, JSON.stringify({ model, messages, max_tokens: 2000, temperature: 0.7 }));

    if (statusCode !== 200) {
        const result = JSON.parse(data);
        throw new Error(result.error?.message || `HTTP ${statusCode}`);
    }

    const result = JSON.parse(data);
    return result.choices[0].message.content;
}

async function callPollinationsFree(model, message, history, systemPrompt) {
    let prompt = systemPrompt + '\n\n';
    history.slice(-10).forEach(m => {
        prompt += m.role === 'user' ? `User: ${m.content}\n` : `Assistant: ${m.content}\n`;
    });
    prompt += `User: ${message}\nAssistant:`;

    const encoded = encodeURIComponent(prompt.slice(0, 4000));
    const seed = Math.floor(Math.random() * 1000000);

    return new Promise((resolve, reject) => {
        https.get(`https://text.pollinations.ai/${encoded}?model=${model}&seed=${seed}`, { timeout: 60000 }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode === 200 && data.trim()) {
                    let r = data.trim();
                    if (r.startsWith('Assistant:')) r = r.slice(10).trim();
                    resolve(r);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
        }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
    });
}

async function callPollinationsAPI(model, message, history, systemPrompt) {
    const apiKey = await manager.getActiveKey('pollinations_api', CONFIG.pollinationsApiKey);
    if (!apiKey) throw new Error('No Pollinations API key');

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
    ];

    const requestBody = {
        model: model,
        messages: messages,
        max_tokens: 2000,
        temperature: 0.7
    };

    const { data, statusCode } = await httpRequest({
        hostname: 'gen.pollinations.ai',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    }, JSON.stringify(requestBody));

    if (statusCode !== 200) {
        try {
            const result = JSON.parse(data);
            throw new Error(result.error?.message || `HTTP ${statusCode}`);
        } catch {
            throw new Error(`HTTP ${statusCode}`);
        }
    }

    const result = JSON.parse(data);
    if (result.choices?.[0]?.message?.content) {
        return result.choices[0].message.content;
    }
    throw new Error('No response from Pollinations API');
}

async function callHuggingFace(model, message, history, systemPrompt) {
    const apiKey = await manager.getActiveKey('huggingface', CONFIG.huggingfaceApiKey);
    if (!apiKey) throw new Error('No HuggingFace API key');

    let prompt = systemPrompt + '\n\n';
    history.slice(-10).forEach(m => {
        prompt += m.role === 'user' ? `User: ${m.content}\n` : `Assistant: ${m.content}\n`;
    });
    prompt += `User: ${message}\nAssistant:`;

    const { data, statusCode } = await httpRequest({
        hostname: 'api-inference.huggingface.co',
        path: `/models/${model}`,
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    }, JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 1000, temperature: 0.7, return_full_text: false } }));

    if (statusCode !== 200) {
        const result = JSON.parse(data);
        throw new Error(result.error || `HTTP ${statusCode}`);
    }

    const result = JSON.parse(data);
    if (result.error) throw new Error(result.error);
    const text = Array.isArray(result) ? result[0].generated_text : result.generated_text;
    return text.split('Assistant:').pop().trim();
}

// ==================== MAIN AI CALL ====================

async function callAI(guildId, userId, userMessage, isVoiceMode = false) {
    const s = getSettings(guildId);
    const { aiProvider, aiModel, searchEnabled, searchProvider, geminiGrounding } = s;
    const start = Date.now();

    const conv = getConversation(guildId, userId);
    const history = conv.messages;

    let searchContext = '';
    let searchData = null;
    let useGeminiGrounding = false;

    const needsSearch = searchEnabled && shouldSearch(userMessage);

    if (aiProvider === 'gemini' && geminiGrounding && needsSearch) {
        useGeminiGrounding = true;
    } else if (needsSearch) {
        searchData = await performSearch(userMessage, searchProvider);
        if (searchData && searchData.urls && searchData.urls.length > 0) {
            // Fetch and read URLs from search results
            const contents = [];
            for (const url of searchData.urls.slice(0, 3)) {
                try {
                    const content = await fetchURLClean(url);
                    if (content) {
                        contents.push({ url, content: content.slice(0, 3000) });
                    }
                } catch (e) {
                    console.error('Failed to fetch search result URL:', e.message);
                }
            }
            
            if (contents.length > 0) {
                searchContext = '\n\n[SEARCH RESULTS]\n';
                contents.forEach((c, i) => {
                    searchContext += `\nSource ${i + 1}: ${c.url}\n${c.content}\n`;
                });
                searchContext += '\nUse the above search results to provide an accurate and up-to-date answer.';
            }
        }
    }

    let finalSystemPrompt = SYSTEM_PROMPT + searchContext;
    if (isVoiceMode) finalSystemPrompt += '\n[MODE SUARA: Jawab singkat 2-4 kalimat]';

    try {
        let response, grounded = false;

        switch (aiProvider) {
            case 'gemini':
                const geminiResult = await callGemini(aiModel, userMessage, history, finalSystemPrompt, useGeminiGrounding);
                response = geminiResult.text;
                grounded = geminiResult.grounded;
                break;
            case 'groq':
                response = await callGroq(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'openrouter':
                response = await callOpenRouter(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'huggingface':
                response = await callHuggingFace(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'pollinations_free':
                response = await callPollinationsFree(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'pollinations_api':
                response = await callPollinationsAPI(aiModel, userMessage, history, finalSystemPrompt);
                break;
            default:
                response = await callPollinationsFree('openai', userMessage, history, finalSystemPrompt);
        }

        addToConversation(guildId, userId, 'user', userMessage);
        addToConversation(guildId, userId, 'assistant', response);

        const modelInfo = AI_PROVIDERS[aiProvider]?.models.find(m => m.id === aiModel) || { name: aiModel };

        return {
            text: response,
            provider: AI_PROVIDERS[aiProvider]?.name || aiProvider,
            model: modelInfo.name,
            latency: Date.now() - start,
            searched: !!searchData || grounded,
            searchSource: searchData?.source || (grounded ? 'gemini-grounding' : null)
        };

    } catch (error) {
        console.error(`AI Error (${aiProvider}):`, error.message);

        if (error.message.includes('quota') || error.message.includes('limit') || error.message.includes('429')) {
            const rotated = await manager.rotateKey(aiProvider);
            if (rotated) {
                console.log(`🔄 Rotated ${aiProvider} key, retrying...`);
                try {
                    return await callAI(guildId, userId, userMessage, isVoiceMode);
                } catch (retryError) {
                    console.error('Retry failed:', retryError.message);
                }
            }
        }

        if (aiProvider !== 'pollinations_free') {
            console.log('Fallback to Pollinations Free...');
            try {
                const fallback = await callPollinationsFree('openai', userMessage, history, finalSystemPrompt);
                addToConversation(guildId, userId, 'user', userMessage);
                addToConversation(guildId, userId, 'assistant', fallback);
                return {
                    text: fallback,
                    provider: 'Pollinations (Fallback)',
                    model: 'OpenAI GPT',
                    latency: Date.now() - start,
                    searched: !!searchData
                };
            } catch (e) {
                throw new Error(`All providers failed`);
            }
        }
        throw error;
    }
}

// ==================== VOICE FUNCTIONS ====================

async function joinUserVoiceChannel(member, guild) {
    const vc = member?.voice?.channel;
    if (!vc) return { success: false, error: 'Masuk voice channel dulu' };

    try {
        const existingConn = getVoiceConnection(guild.id);
        if (existingConn && existingConn.joinConfig.channelId === vc.id) {
            return { success: true, channel: vc, alreadyConnected: true };
        }

        if (existingConn) {
            existingConn.destroy();
            voiceConnections.delete(guild.id);
            audioPlayers.delete(guild.id);
        }

        const conn = joinVoiceChannel({
            channelId: vc.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false
        });

        await entersState(conn, VoiceConnectionStatus.Ready, 30000);

        const player = createAudioPlayer();
        conn.subscribe(player);

        voiceConnections.set(guild.id, conn);
        audioPlayers.set(guild.id, player);
        ttsQueues.set(guild.id, { queue: [], playing: false, currentFile: null });

        player.on(AudioPlayerStatus.Idle, () => processNextInQueue(guild.id));
        player.on('error', (err) => {
            console.error('Audio player error:', err.message);
            processNextInQueue(guild.id);
        });

                // Setup voice receiver if Voice AI enabled
        const session = voiceAISessions.get(guild.id);
        if (session?.enabled) {
            setupVoiceReceiver(conn, guild.id, session.textChannel);
        }

        return { success: true, channel: vc };

    } catch (e) {
        console.error('Voice join error:', e.message);
        return { success: false, error: e.message };
    }
}

async function leaveVoiceChannel(guild) {
    const guildId = guild.id || guild;
    
    // Disable Voice AI when leaving
    disableVoiceAI(guildId);
    
    const conn = voiceConnections.get(guildId) || getVoiceConnection(guildId);
    // ... sisanya tetap

    const queueData = ttsQueues.get(guildId);
    if (queueData) {
        if (queueData.currentFile) cleanupFile(queueData.currentFile);
        queueData.queue.forEach(item => cleanupFile(item.file));
    }

    if (!conn) return false;

    conn.destroy();
    voiceConnections.delete(guildId);
    audioPlayers.delete(guildId);
    ttsQueues.delete(guildId);
    return true;
}

function processNextInQueue(guildId) {
    const queueData = ttsQueues.get(guildId);
    if (!queueData) return;

    if (queueData.currentFile) {
        cleanupFile(queueData.currentFile);
        queueData.currentFile = null;
    }

    if (queueData.queue.length === 0) {
        queueData.playing = false;
        return;
    }

    const player = audioPlayers.get(guildId);
    if (!player) return;

    const next = queueData.queue.shift();
    queueData.currentFile = next.file;
    queueData.playing = true;

    try {
        const resource = createAudioResource(next.file, { inputType: StreamType.Arbitrary });
        player.play(resource);
    } catch (e) {
        console.error('Audio resource error:', e.message);
        cleanupFile(next.file);
        processNextInQueue(guildId);
    }
}

async function playTTSInVoice(guildId, filePath) {
    let queueData = ttsQueues.get(guildId);
    if (!queueData) {
        queueData = { queue: [], playing: false, currentFile: null };
        ttsQueues.set(guildId, queueData);
    }

    queueData.queue.push({ file: filePath });

    if (!queueData.playing) processNextInQueue(guildId);
    return true;
}

// ==================== SETTINGS UI ====================

function createSettingsEmbed(guildId) {
    const s = getSettings(guildId);
    const ai = AI_PROVIDERS[s.aiProvider];
    const model = ai?.models.find(m => m.id === s.aiModel) || { name: s.aiModel };
    
    // Find voice names
    const edgeVoice = EDGE_TTS_VOICES.find(v => v.id === s.ttsVoice);
    const elevenVoice = ELEVENLABS_VOICES.find(v => v.id === s.ttsVoiceElevenlabs);

    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Toing Settings')
        .addFields(
            { name: '🧠 AI Provider', value: `**${ai?.name || s.aiProvider}**\n${model.name}`, inline: true },
            { name: '🔊 TTS (Public)', value: edgeVoice?.name || s.ttsVoice, inline: true },
            { name: '🎙️ TTS (Admin)', value: elevenVoice?.name || 'Default', inline: true },
        )
        .setFooter({ text: 'v3.0.0 • Complete Edition' })
        .setTimestamp();
}

function createProviderMenu(guildId) {
    const s = getSettings(guildId);
    const opts = Object.entries(AI_PROVIDERS).map(([k, p]) => ({
        label: p.name, value: k, default: k === s.aiProvider
    }));
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_ai').setPlaceholder('🧠 AI Provider').addOptions(opts)
    );
}

function createModelMenu(guildId) {
    const s = getSettings(guildId);
    const p = AI_PROVIDERS[s.aiProvider];
    if (!p) return null;

    const opts = p.models.slice(0, 25).map(m => ({
        label: m.name.slice(0, 25), value: m.id, default: m.id === s.aiModel
    }));

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_model').setPlaceholder('🤖 Model').addOptions(opts)
    );
}

// Menu untuk Edge-TTS (semua user)
function createVoiceMenu(guildId) {
    const s = getSettings(guildId);
    
    const opts = EDGE_TTS_VOICES.slice(0, 25).map(v => ({
        label: v.name.slice(0, 25),
        value: v.id,
        default: v.id === s.ttsVoice
    }));
    
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('sel_voice')
            .setPlaceholder('🔊 Voice (Public - Edge-TTS)')
            .addOptions(opts)
    );
}

// Menu untuk ElevenLabs (admin only)
function createElevenlabsVoiceMenu(guildId) {
    const s = getSettings(guildId);
    
    const opts = ELEVENLABS_VOICES.slice(0, 25).map(v => ({
        label: v.name.slice(0, 25),
        value: v.id,
        description: v.lang === 'multi' ? 'Multilingual' : v.lang.toUpperCase(),
        default: v.id === (s.ttsVoiceElevenlabs || CONFIG.elevenlabs.defaultVoice)
    }));
    
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('sel_voice_elevenlabs')
            .setPlaceholder('🎙️ Voice (Admin - ElevenLabs)')
            .addOptions(opts)
    );
}

function createModeButtons(guildId) {
    const s = getSettings(guildId);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('search_toggle').setLabel(s.searchEnabled ? '🔍 Search ON' : '🔍 Search OFF').setStyle(s.searchEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('grounding_toggle').setLabel(s.geminiGrounding ? '🌐 Grounding ON' : '🌐 Grounding OFF').setStyle(s.geminiGrounding ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
}

// ==================== INTERACTION HANDLER ====================

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.customId?.startsWith('dm_')) {
        return manager.handleInteraction(interaction);
    }

    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

    if (!isAdmin(interaction.user.id)) {
        return interaction.reply({ content: '❌ Admin only', ephemeral: true });
    }

    const guildId = interaction.guild.id;

    try {
        if (interaction.customId === 'sel_ai') {
            updateSettings(guildId, 'aiProvider', interaction.values[0]);
            const p = AI_PROVIDERS[interaction.values[0]];
            if (p?.models[0]) updateSettings(guildId, 'aiModel', p.models[0].id);
        } else if (interaction.customId === 'sel_model') {
            updateSettings(guildId, 'aiModel', interaction.values[0]);
                } else if (interaction.customId === 'sel_voice') {
            updateSettings(guildId, 'ttsVoice', interaction.values[0]);
        } else if (interaction.customId === 'sel_voice_elevenlabs') {
            if (!isAdmin(interaction.user.id)) {
                return interaction.reply({ content: '❌ ElevenLabs hanya untuk Admin', ephemeral: true });
            }
            updateSettings(guildId, 'ttsVoiceElevenlabs', interaction.values[0]);
        } else if (interaction.customId === 'search_toggle') {
            const s = getSettings(guildId);
            updateSettings(guildId, 'searchEnabled', !s.searchEnabled);
        } else if (interaction.customId === 'grounding_toggle') {
            const s = getSettings(guildId);
            updateSettings(guildId, 'geminiGrounding', !s.geminiGrounding);
        }

        const comps = [createProviderMenu(guildId), createModelMenu(guildId), createVoiceMenu(guildId), createModeButtons(guildId)].filter(Boolean);
        await interaction.update({ embeds: [createSettingsEmbed(guildId)], components: comps });

    } catch (e) {
        interaction.reply({ content: `❌ ${e.message}`, ephemeral: true }).catch(() => {});
    }
});

// ==================== COMMAND HANDLERS ====================

async function transcribeWithGroq(audioFilePath) {
    const apiKey = CONFIG.groqApiKey;
    if (!apiKey) throw new Error('No Groq API key for transcription');
    
    // Check file exists and size
    if (!fs.existsSync(audioFilePath)) {
        throw new Error('Audio file not found');
    }
    
    const fileSize = fs.statSync(audioFilePath).size;
    console.log(`📤 Sending to Whisper: ${audioFilePath} (${fileSize} bytes)`);
    
    if (fileSize < 1000) {
        throw new Error('Audio file too small');
    }
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioFilePath));
    formData.append('model', CONFIG.voiceAI.whisperModel);
    formData.append('response_format', 'verbose_json');
    
    // Jangan set language agar auto-detect
    // formData.append('language', 'id');
    
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`
        },
        body: formData
    });
    
    if (!response.ok) {
        const error = await response.text();
        console.error('❌ Whisper error:', error);
        throw new Error(`Whisper API error: ${response.status}`);
    }
    
    const result = await response.json();
    
    console.log(`🗣️ Whisper result:`, JSON.stringify(result).slice(0, 200));
    
    return result.text || '';
}

function setupVoiceReceiver(connection, guildId, textChannel) {
    const receiver = connection.receiver;
    
    receiver.speaking.on('start', (userId) => {
        const session = voiceAISessions.get(guildId);
        if (!session?.enabled) return;
        if (processingUsers.has(userId)) return;
        
        startRecording(connection, userId, guildId, textChannel);
    });
}

function startRecording(connection, userId, guildId, textChannel) {
    if (voiceRecordings.has(userId)) return;
    
    // Check if bot is speaking (prevent recording own TTS)
    const session = voiceAISessions.get(guildId);
    if (session?.isSpeaking) {
        console.log(`⏭️ Skipped recording - bot is speaking`);
        return;
    }
    
    const receiver = connection.receiver;
    
    console.log(`🎙️ Started recording user ${userId}`);
    
    const opusStream = receiver.subscribe(userId, {
        end: {
            behavior: EndBehaviorType.AfterSilence,
            duration: 2000
        }
    });
    
    // Decode Opus ke PCM menggunakan prism-media
    const opusDecoder = new prism.opus.Decoder({
        frameSize: 960,
        channels: 2,
        rate: 48000
    });
    
    const chunks = [];
    const startTime = Date.now();
    
    const recordingData = {
        chunks,
        startTime,
        stream: opusStream,
        decoder: opusDecoder,
        timeout: null
    };
    
    voiceRecordings.set(userId, recordingData);
    
    // Pipe opus stream through decoder
    opusStream.pipe(opusDecoder);
    
    opusDecoder.on('data', (chunk) => {
        if (Date.now() - startTime < CONFIG.voiceAI.maxRecordingDuration) {
            chunks.push(chunk);
        }
    });
    
    opusDecoder.on('end', async () => {
        voiceRecordings.delete(userId);
        
        const duration = Date.now() - startTime;
        if (duration < CONFIG.voiceAI.minAudioLength || chunks.length === 0) {
            console.log(`⏭️ Recording too short: ${duration}ms, chunks: ${chunks.length}`);
            return;
        }
        
        const pcmBuffer = Buffer.concat(chunks);
        console.log(`📊 PCM Buffer: ${pcmBuffer.length} bytes, duration: ${duration}ms`);
        
        await processVoiceInput(userId, guildId, pcmBuffer, textChannel);
    });
    
    opusDecoder.on('error', (err) => {
        console.error('Opus decoder error:', err.message);
        voiceRecordings.delete(userId);
    });
    
    opusStream.on('error', (err) => {
        console.error('Audio stream error:', err.message);
        voiceRecordings.delete(userId);
    });
    
    recordingData.timeout = setTimeout(() => {
        if (voiceRecordings.has(userId)) {
            console.log(`⏱️ Recording timeout for user ${userId}`);
            opusStream.destroy();
            voiceRecordings.delete(userId);
        }
    }, CONFIG.voiceAI.maxRecordingDuration + 1000);
}

async function processVoiceInput(userId, guildId, audioBuffer, textChannel) {
    if (processingUsers.has(userId)) return;
    
    // Prevent bot hearing itself
    const session = voiceAISessions.get(guildId);
    if (session?.isSpeaking) {
        return;
    }
    
    processingUsers.add(userId);
    
    const tempFile = path.join(CONFIG.tempPath, `voice_${userId}_${Date.now()}.ogg`);
    
    try {
        await convertOpusToOgg(audioBuffer, tempFile);
        
        const fileStats = fs.statSync(tempFile);
        if (fileStats.size < 1000) {
            return;
        }
        
        const transcription = await transcribeWithGroq(tempFile);
        
        if (!transcription || transcription.trim().length < 3) {
            return;
        }
        
        console.log(`🎤 [${userId}]: "${transcription}"`);
        
        const text = transcription.toLowerCase().trim();
        
        // Skip noise/filler words only
        const skipPhrases = [
            'hmm', 'uhh', 'ehh', 'ahh', 'umm',
            'hm', 'uh', 'eh', 'ah', 'um',
            'terima kasih', 'thank you', 'thanks',
            'you\'re welcome', 'sama-sama',
            'oke', 'okay', 'ok',
            'hvað', 'það',  // Icelandic noise
            'yes', 'no', 'ya', 'tidak'
        ];
        
        // Also skip if detected as non-Indonesian/English with short duration
        const validLanguages = ['indonesian', 'english', 'javanese', 'sundanese'];
        // Check from Whisper result if available
        
        if (skipPhrases.includes(text) || text.length < 5) {
            console.log(`⏭️ Skipped filler: "${text}"`);
            return;
        }
        
        // Log ke text channel
        if (textChannel) {
            textChannel.send(`🎤 **Voice:** ${transcription}`).catch(() => {});
        }
        
        // Mark bot as speaking
                // Mark bot as speaking (prevent hearing itself)
        if (session) {
            session.isSpeaking = true;
            session.speakingStartedAt = Date.now();
        }
        
        // Call AI
        console.log(`🤖 Processing: "${transcription}"`);
        const response = await callAI(guildId, userId, transcription, true);
        console.log(`✅ AI responded (${response.latency}ms)`);
        
        if (textChannel) {
            const info = `*${response.model} • ${response.latency}ms* 🎙️`;
            textChannel.send(`${response.text}\n\n-# ${info}`).catch(() => {});
        }
        
              const s = getSettings(guildId);
        const voice = isAdmin(userId) ? (s.ttsVoiceElevenlabs || s.ttsVoice) : s.ttsVoice;
        const ttsFile = await generateTTS(response.text, voice, userId);
        await playTTSInVoice(guildId, ttsFile);
        
                console.log(`✅ Voice response complete!`);
        
        // Reset speaking lock setelah TTS selesai + delay
        setTimeout(() => {
            const session = voiceAISessions.get(guildId);
            if (session) {
                session.isSpeaking = false;
                console.log(`🔓 Ready to listen again`);
            }
        }, 3000);
        
    } catch (error) {
        console.error('❌ Voice error:', error.message);
        } finally {
        cleanupFile(tempFile);
        processingUsers.delete(userId);
    }
}

async function convertOpusToOgg(opusBuffer, outputPath) {
    return new Promise((resolve, reject) => {
        try {
            console.log(`📁 Raw audio size: ${opusBuffer.length} bytes`);
            
            // Buffer sudah dalam format PCM dari opus decoder
            // Convert ke WAV untuk Whisper (16kHz mono)
            
            const tempPcm = outputPath.replace('.ogg', '.pcm');
            fs.writeFileSync(tempPcm, opusBuffer);
            
            // Convert PCM ke WAV dengan FFmpeg
            const ffmpegCmd = `ffmpeg -y -f s16le -ar 48000 -ac 2 -i "${tempPcm}" -ar 16000 -ac 1 -f wav "${outputPath}" 2>/dev/null`;
            
            exec(ffmpegCmd, { timeout: 15000 }, (error) => {
                cleanupFile(tempPcm);
                
                if (error || !fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
                    // Fallback: create WAV with header manually
                    console.log('⚠️ FFmpeg failed, creating WAV manually');
                    
                    const wavHeader = createWavHeader(opusBuffer.length, 48000, 2, 16);
                    const wavFile = Buffer.concat([wavHeader, opusBuffer]);
                    fs.writeFileSync(outputPath, wavFile);
                }
                
                const finalSize = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
                console.log(`✅ Audio converted: ${finalSize} bytes`);
                
                resolve(outputPath);
            });
            
        } catch (err) {
            console.error('❌ Conversion error:', err.message);
            fs.writeFileSync(outputPath, opusBuffer);
            resolve(outputPath);
        }
    });
}

function createWavHeader(dataLength, sampleRate, numChannels, bitsPerSample) {
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const buffer = Buffer.alloc(44);
    
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);
    
    return buffer;
}

function enableVoiceAI(guildId, textChannel = null) {
    voiceAISessions.set(guildId, {
        enabled: true,
        textChannel: textChannel,
        startedAt: Date.now(),
        isSpeaking: false  // ← TAMBAH INI
    });
    
    const conn = voiceConnections.get(guildId);
    if (conn) {
        setupVoiceReceiver(conn, guildId, textChannel);
    }
}

function disableVoiceAI(guildId) {
    voiceAISessions.delete(guildId);
    
    for (const [userId, recording] of voiceRecordings) {
        if (recording.stream) {
            recording.stream.destroy();
        }
        if (recording.timeout) {
            clearTimeout(recording.timeout);
        }
    }
    voiceRecordings.clear();
}

function isVoiceAIEnabled(guildId) {
    return voiceAISessions.get(guildId)?.enabled || false;
}

async function handleAI(msg, query) {
    const rateCheck = checkRateLimit(msg.author.id);
    if (!rateCheck.allowed) return msg.reply(`⏳ Wait ${rateCheck.waitTime}s`);

    let inVoice = false;
    if (msg.member?.voice?.channel) {
        const result = await joinUserVoiceChannel(msg.member, msg.guild);
        if (result.success) inVoice = true;
    }

    await msg.channel.sendTyping();

    try {
        const response = await callAI(msg.guild.id, msg.author.id, query, inVoice);

        const searchIcon = response.searched ? ` 🔍` : '';
        const info = `*${response.model} • ${response.latency}ms${searchIcon}*`;
        const fullResponse = `${response.text}\n\n-# ${info}`;

        const parts = splitMessage(fullResponse);
        for (let i = 0; i < parts.length; i++) {
            if (i === 0) await msg.reply(parts[i]);
            else await msg.channel.send(parts[i]);
        }

        // TTS untuk voice channel
                // TTS untuk voice channel
        if (inVoice) {
            try {
                const s = getSettings(msg.guild.id);
                
                // Pilih voice: ElevenLabs (Admin) atau Default (User)
                const voice = isAdmin(msg.author.id) ? (s.ttsVoiceElevenlabs || s.ttsVoice) : s.ttsVoice;
                
                // Kirim ID untuk validasi di generateTTS
                const ttsFile = await generateTTS(response.text, voice, msg.author.id);
                
                if (ttsFile) {
                    await playTTSInVoice(msg.guild.id, ttsFile);
                }
            } catch (e) {
                console.error('TTS error:', e.message);
            }
        }

    } catch (e) {
        console.error('AI Error:', e);
        await msg.reply(`❌ ${e.message}`);
    }
}

async function handleSpeak(msg, text) {
    if (!text) return msg.reply('❓ `.speak Halo dunia`');

    const player = audioPlayers.get(msg.guild.id);
    if (!player) return msg.reply('❌ Join voice channel first (`.join`)');

    const status = await msg.reply('🔊 Generating...');

    try {
                const s = getSettings(msg.guild.id);
        const voice = isAdmin(msg.author.id) ? (s.ttsVoiceElevenlabs || s.ttsVoice) : s.ttsVoice;
        const ttsFile = await generateTTS(text, voice, msg.author.id);
        if (ttsFile) {
            await playTTSInVoice(msg.guild.id, ttsFile);
            await status.edit('🔊 Playing...');
        } else {
            await status.edit('❌ TTS failed');
        }
    } catch (e) {
        await status.edit(`❌ ${e.message}`);
    }
}

async function handleURLAuto(msg, urls, originalMessage) {
    const urlsToFetch = urls.slice(0, 2);
    
    let statusMsg = await msg.reply('🔗 Detected URL, reading...');
    
    try {
        const contents = [];
        
        for (const url of urlsToFetch) {
            try {
                await statusMsg.edit(`💭 Reading: ${new URL(url).hostname}...`);
                
                let content;
                if (url.includes('github.com') && url.includes('/blob/')) {
                    content = await readGitHubFile(url);
                } else {
                    content = await fetchURLClean(url);
                }
                
                if (content && content.length > 100) {
                    contents.push({ url, content: content.slice(0, 5000) });
                }
            } catch (e) {
                console.error('Failed to fetch:', url, e.message);
            }
        }
        
        if (contents.length === 0) {
            return statusMsg.edit('❌ Could not read URL');
        }
        
        await statusMsg.edit(`💭 Analyzing ${contents.length} URL(s)...`);
        
        // Build context
        let contextPrompt = buildContextPrompt(
            originalMessage.replace(/(https?:\/\/[^\s]+)/g, '').trim() || 'Jelaskan konten dari URL ini',
            contents,
            true // Enable thinking mode
        );
        
        // Send to AI
        const response = await callAI(msg.guild.id, msg.author.id, contextPrompt, false);
        
        // Parse thinking
        const { thinking, answer } = parseThinkingResponse(response.text);
        
        // Format response
        let finalMsg = answer;
        finalMsg += '\n\n📚 **Source:**\n';
        finalMsg += contents.map(c => `• ${new URL(c.url).hostname}`).join('\n');
        
        // Add thinking as spoiler
        if (thinking && thinking.length > 20) {
            finalMsg += `\n\n||💭 **Reasoning:**\n${thinking.slice(0, 1000)}||`;
        }
        
        finalMsg += `\n\n-# ${response.model} • ${response.latency}ms 🔗`;
        
        const parts = splitMessage(finalMsg);
        await statusMsg.edit(parts[0]);
        
        for (let i = 1; i < parts.length; i++) {
            await msg.channel.send(parts[i]);
        }
        
    } catch (e) {
        await statusMsg.edit(`❌ ${e.message}`);
    }
}

async function handleFileRead(msg) {
    if (msg.attachments.size === 0) {
        return msg.reply('❓ Upload file yang ingin dibaca');
    }
    
    const attachment = msg.attachments.first();
    
    // Check file size
    if (attachment.size > CONFIG.maxFileSize) {
        return msg.reply(`❌ File terlalu besar (max ${CONFIG.maxFileSize / 1024 / 1024}MB)`);
    }
    
    const statusMsg = await msg.reply('📄 Reading file...');
    
    try {
        const content = await readFile(attachment);
        
        if (!content || content.length < 10) {
            return statusMsg.edit('❌ Could not read file content');
        }
        
        await statusMsg.edit(`💭 Analyzing ${attachment.name}...`);
        
        // Send to AI for analysis
        const prompt = `Analisis file berikut:\n\nFile: ${attachment.name}\nContent:\n${content.slice(0, 8000)}`;
        
        const response = await callAI(msg.guild.id, msg.author.id, prompt, false);
        
        let finalMsg = `📄 **${attachment.name}**\n\n${response.text}\n\n-# ${response.model} • ${response.latency}ms`;
        
        const parts = splitMessage(finalMsg);
        await statusMsg.edit(parts[0]);
        
        for (let i = 1; i < parts.length; i++) {
            await msg.channel.send(parts[i]);
        }
        
    } catch (e) {
        await statusMsg.edit(`❌ ${e.message}`);
    }
}

async function handleImageAnalysis(msg) {
    const images = msg.attachments.filter(a => 
        a.contentType && a.contentType.startsWith('image/')
    );
    
    if (images.size === 0) {
        return msg.reply('❓ Upload gambar yang ingin dianalisis');
    }
    
    const image = images.first();
    
    // Check image size
    if (image.size > CONFIG.maxImageSize) {
        return msg.reply(`❌ Gambar terlalu besar (max ${CONFIG.maxImageSize / 1024 / 1024}MB)`);
    }
    
    const statusMsg = await msg.reply('🖼️ Analyzing image...');
    
    try {
        const analysis = await analyzeImage(image.url, msg.content.replace(CONFIG.prefix + 'analyze', '').trim());
        
        let finalMsg = `🖼️ **Image Analysis**\n\n${analysis}\n\n-# Gemini Vision • ${Date.now() - msg.createdTimestamp}ms`;
        
        const parts = splitMessage(finalMsg);
        await statusMsg.edit(parts[0]);
        
        for (let i = 1; i < parts.length; i++) {
            await msg.channel.send(parts[i]);
        }
        
    } catch (e) {
        await statusMsg.edit(`❌ ${e.message}`);
    }
}

async function handleSearchCommand(msg, query) {
    if (!query) return msg.reply('❓ `.search <query>`');
    
    const statusMsg = await msg.reply('🔍 Searching...');
    
    try {
        // Perform search
        const searchResults = await performSearch(query);
        
        if (!searchResults || (!searchResults.urls?.length && !searchResults.facts?.length)) {
            return statusMsg.edit('❌ No search results found');
        }
        
        await statusMsg.edit(`📖 Reading ${searchResults.urls?.length || 0} sources...`);
        
        // Fetch URL contents
        const contents = [];
        if (searchResults.urls) {
            for (const url of searchResults.urls.slice(0, 3)) {
                try {
                    const content = await fetchURLClean(url);
                    if (content) {
                        contents.push({ url, content: content.slice(0, 3000) });
                    }
                } catch (e) {
                    console.error('Failed to fetch:', url);
                }
            }
        }
        
        await statusMsg.edit('💭 Reasoning...');
        
        // Build prompt with search results
        const contextPrompt = buildContextPrompt(query, contents, true);
        
        // Get AI response
        const response = await callAI(msg.guild.id, msg.author.id, contextPrompt, false);
        
        // Parse thinking
        const { thinking, answer } = parseThinkingResponse(response.text);
        
        // Format final response
        let finalMsg = answer;
        
        if (contents.length > 0) {
            finalMsg += '\n\n📚 **Sources:**\n';
            finalMsg += contents.map(c => `• ${new URL(c.url).hostname}`).join('\n');
        }
        
        if (thinking && thinking.length > 20) {
            finalMsg += `\n\n||💭 **Reasoning Process:**\n${thinking.slice(0, 1500)}||`;
        }
        
        finalMsg += `\n\n-# ${response.model} • ${response.latency}ms 🔍`;
        
        const parts = splitMessage(finalMsg);
        await statusMsg.edit(parts[0]);
        
        for (let i = 1; i < parts.length; i++) {
            await msg.channel.send(parts[i]);
        }
        
    } catch (e) {
        await statusMsg.edit(`❌ ${e.message}`);
    }
}

// ==================== MESSAGE HANDLER (COMPLETE) ====================

client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    const content = msg.content.trim();
    const urls = detectURLs(content);
    const hasMention = msg.mentions.has(client.user);
    const hasCommand = content.startsWith(CONFIG.prefix);
    const hasAttachments = msg.attachments.size > 0;
    
    // ========== AUTO FILE/IMAGE DETECTION (Mention + Attachment) ==========
    if (hasMention && hasAttachments) {
        const query = content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
        
        // Check for images first
        const images = msg.attachments.filter(a => 
            a.contentType && a.contentType.startsWith('image/')
        );
        
        if (images.size > 0) {
            return await handleImageAnalysisWithQuery(msg, images.first(), query);
        }
        
        // Check for document files
        const docs = msg.attachments.filter(a => {
            const ext = path.extname(a.name || '').toLowerCase();
            return SUPPORTED_FILE_EXTENSIONS.includes(ext);
        });
        
        if (docs.size > 0) {
            return await handleFileReadWithQuery(msg, docs.first(), query);
        }
    }
    
    // ========== AUTO URL DETECTION ==========
    if (urls.length > 0 && !hasCommand) {
        const validURLs = urls.filter(url => !isMediaFile(url) && !isShortener(url));
        
        if (validURLs.length > 0) {
            const textWithoutUrls = content.replace(/(https?:\/\/[^\s]+)/g, '').trim();
            const hasQuestion = /apa|bagaimana|jelaskan|what|how|explain|analyze|summarize|ringkas|baca|read|tolong|please|bantu|help|cari|find|tentang|about/i.test(textWithoutUrls);
            const autoFetch = validURLs.some(shouldAutoFetch);
            
            if (hasMention || hasQuestion || autoFetch) {
                return await handleURLAnalysis(msg, validURLs, textWithoutUrls);
            }
        }
    }
    
    // ========== PURE MENTION (No attachment, no URL) ==========
    if (hasMention && !hasCommand) {
        const query = content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
        
        if (!query) {
            return msg.reply('👋 Hai! Aku **Aria**, asisten AI-mu!\n\n💡 **Tips:**\n• Mention aku + pertanyaan\n• Upload file/gambar + mention\n• Kirim URL + pertanyaan\n• Ketik `.help` untuk bantuan lengkap');
        }
        
        return await handleAI(msg, query);
    }

    // ========== COMMAND HANDLER ==========
    if (!hasCommand) return;

    const args = content.slice(CONFIG.prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    try {
        switch (cmd) {
            // ===== AI COMMANDS =====
            case 'ai':
            case 'ask':
            case 'chat':
            case 'tanya':
            case 'a':
                if (!args.join(' ')) return msg.reply('❓ **Penggunaan:** `.ai <pertanyaan>`\n\n**Contoh:**\n• `.ai jelaskan quantum computing`\n• `.ai bagaimana cara belajar programming?`');
                await handleAI(msg, args.join(' '));
                break;

            // ===== SEARCH COMMAND =====
            case 'search':
            case 'cari':
            case 's':
            case 'google':
                if (!args.join(' ')) return msg.reply('❓ **Penggunaan:** `.search <query>`\n\n**Contoh:**\n• `.search berita teknologi hari ini`\n• `.search harga bitcoin terkini`');
                await handleSearchCommand(msg, args.join(' '));
                break;

            // ===== FILE & URL COMMANDS =====
            case 'read':
            case 'baca':
            case 'r':
                await handleReadCommand(msg, args);
                break;

            case 'analyze':
            case 'analisis':
            case 'scan':
                await handleAnalyzeCommand(msg, args);
                break;
                
            case 'url':
            case 'web':
            case 'fetch':
                if (!args[0] || !args[0].startsWith('http')) {
                    return msg.reply('❓ **Penggunaan:** `.url <link>`\n\n**Contoh:**\n• `.url https://example.com/article`\n• `.url https://github.com/user/repo jelaskan kodenya`');
                }
                await handleURLAnalysis(msg, [args[0]], args.slice(1).join(' '));
                break;

            // ===== VOICE COMMANDS =====
            case 'join':
            case 'j':
            case 'masuk':
                const jr = await joinUserVoiceChannel(msg.member, msg.guild);
                await msg.reply(jr.success 
                    ? (jr.alreadyConnected ? `✅ Sudah di **${jr.channel.name}**` : `🔊 Bergabung ke **${jr.channel.name}**`) 
                    : `❌ ${jr.error}`);
                break;

            case 'leave':
            case 'dc':
            case 'disconnect':
            case 'keluar':
                await msg.reply(await leaveVoiceChannel(msg.guild) ? '👋 Keluar dari voice channel' : '❌ Tidak ada di voice channel');
                break;

            case 'speak':
            case 'say':
            case 'tts':
            case 'bicara':
                await handleSpeak(msg, args.join(' '));
                break;

            case 'stop':
            case 'berhenti':
                const player = audioPlayers.get(msg.guild.id);
                if (player) {
                    player.stop();
                    const queueData = ttsQueues.get(msg.guild.id);
                    if (queueData) {
                        queueData.queue = [];
                    }
                    await msg.reply('⏹️ Audio dihentikan');
                } else {
                    await msg.reply('❌ Tidak ada yang diputar');
                }
                break;

            // ===== VOICE AI COMMANDS =====
            case 'voiceai':
            case 'vai':
            case 'podcast':
                if (!isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
                
                const voiceSubCmd = args[0]?.toLowerCase();
                
                if (voiceSubCmd === 'on' || voiceSubCmd === 'start') {
                    const jr = await joinUserVoiceChannel(msg.member, msg.guild);
                    if (!jr.success) return msg.reply(`❌ ${jr.error}`);
                    
                    enableVoiceAI(msg.guild.id, msg.channel);
                     await msg.reply(`🎙️ **Podcast Mode Activated!**\n\n` +
                    `📍 Channel: **${jr.channel.name}**\n` +
                    `🗣️ Mode: **Natural Conversation**\n\n` +
                    `Langsung bicara saja, aku akan mendengar dan menjawab! 🎧`);
                        
                } else if (voiceSubCmd === 'off' || voiceSubCmd === 'stop') {
                    disableVoiceAI(msg.guild.id);
                    await msg.reply('🔇 Voice AI dinonaktifkan');
                    
                } else if (voiceSubCmd === 'status') {
                    const enabled = isVoiceAIEnabled(msg.guild.id);
                    const session = voiceAISessions.get(msg.guild.id);
                    
                    if (enabled && session) {
                        const uptime = Math.floor((Date.now() - session.startedAt) / 1000);
                        await msg.reply(`🎙️ **Voice AI Status**\n\n` +
                            `Status: 🟢 Active\n` +
                            `Uptime: ${uptime}s\n` +
                            `Wake word: "${CONFIG.voiceAI.wakeWord}"`);
                    } else {
                        await msg.reply(`🎙️ **Voice AI Status**\n\nStatus: 🔴 Inactive\n\nGunakan \`.voiceai on\` untuk mengaktifkan.`);
                    }
                    
                } else {
                    await msg.reply(`🎙️ **Voice AI Commands**\n\n` +
                        `\`.voiceai on\` - Aktifkan mode podcast\n` +
                        `\`.voiceai off\` - Matikan voice AI\n` +
                        `\`.voiceai status\` - Cek status\n\n` +
                        `**Cara pakai:**\n` +
                        `1. Join voice channel\n` +
                        `2. Ketik \`.voiceai on\`\n` +
                        `3. Bicara: *"${CONFIG.voiceAI.wakeWord}, [pertanyaan]"*\n` +
                        `4. Bot akan menjawab via voice!`);
                }
                break;
                
            case 'listen':
            case 'dengar':
                if (!isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
                
                const ljr = await joinUserVoiceChannel(msg.member, msg.guild);
                if (!ljr.success) return msg.reply(`❌ ${ljr.error}`);
                
                enableVoiceAI(msg.guild.id, msg.channel);
                await msg.reply(`👂 Listening di **${ljr.channel.name}**...\n\nKatakan *"${CONFIG.voiceAI.wakeWord}"* untuk berbicara denganku!`);
                break;

            // ===== SETTINGS COMMANDS =====
            case 'settings':
            case 'config':
            case 'set':
            case 'pengaturan':
                if (!isAdmin(msg.author.id)) return msg.reply('❌ Hanya admin yang bisa mengakses pengaturan');
                const comps = [
                    createProviderMenu(msg.guild.id),
                    createModelMenu(msg.guild.id),
                    createVoiceMenu(msg.guild.id)
                ];
                
                // Tambah ElevenLabs menu jika user adalah admin
                if (isAdmin(msg.author.id) && CONFIG.elevenlabs?.apiKey) {
                    comps.push(createElevenlabsVoiceMenu(msg.guild.id));
                }
                
                comps.push(createModeButtons(msg.guild.id));
                
                // Discord limit 5 action rows
                const finalComps = comps.filter(Boolean).slice(0, 5);
                await msg.reply({ embeds: [createSettingsEmbed(msg.guild.id)], components: comps });
                break;

            case 'clear':
            case 'reset':
            case 'forget':
            case 'lupa':
            case 'hapus':
                clearConversation(msg.guild.id, msg.author.id);
                await msg.reply('🗑️ Memory percakapan dihapus! Aku sudah lupa pembicaraan sebelumnya.');
                break;

            // ===== API MANAGER COMMANDS =====
            case 'manage':
            case 'apimanager':
            case 'manager':
            case 'api':
                if (!isAdmin(msg.author.id)) return msg.reply('❌ Hanya admin');
                await manager.showMainMenu(msg);
                break;

            case 'listapi':
            case 'apis':
                if (!isAdmin(msg.author.id)) return msg.reply('❌ Hanya admin');
                await manager.quickListApi(msg);
                break;

            case 'syncmodels':
                if (!isAdmin(msg.author.id)) return msg.reply('❌ Hanya admin');
                await manager.quickSyncModels(msg, args[0]);
                break;

            // ===== INFO COMMANDS =====
            case 'status':
            case 'stats':
            case 'info':
                await handleStatusCommand(msg);
                break;

            case 'help':
            case 'h':
            case 'commands':
            case 'bantuan':
            case '?':
                await handleHelpCommand(msg);
                break;

            case 'ping':
            case 'p':
                const latency = Date.now() - msg.createdTimestamp;
                const wsLatency = client.ws.ping;
                await msg.reply(`🏓 **Pong!**\n\`\`\`\nLatency   : ${latency}ms\nWebSocket : ${wsLatency}ms\nStatus    : ${latency < 200 ? '🟢 Excellent' : latency < 500 ? '🟡 Good' : '🔴 Slow'}\n\`\`\``);
                break;

            case 'model':
            case 'models':
                await handleModelInfoCommand(msg);
                break;

            default:
                // Unknown command - suggest help
                if (cmd.length > 0 && cmd.length < 20) {
                    // Don't respond to random text that starts with prefix
                }
                break;
        }
    } catch (e) {
        console.error('Command error:', e);
        msg.reply(`❌ Terjadi error: ${e.message}`).catch(() => {});
    }
});

// ==================== SUPPORTED FILE TYPES ====================

const SUPPORTED_FILE_EXTENSIONS = [
    // Text & Code
    '.txt', '.md', '.markdown', '.rst',
    '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
    '.py', '.pyw', '.pyi',
    '.java', '.kt', '.kts', '.scala',
    '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',
    '.cs', '.fs', '.vb',
    '.go', '.rs', '.swift', '.m', '.mm',
    '.rb', '.php', '.pl', '.pm',
    '.r', '.R', '.rmd',
    '.sql', '.prisma',
    '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
    '.lua', '.vim', '.el',
    '.asm', '.s',
    // Config & Data
    '.json', '.jsonc', '.json5',
    '.yaml', '.yml',
    '.xml', '.xsl', '.xsd',
    '.toml', '.ini', '.cfg', '.conf',
    '.env', '.env.local', '.env.example',
    '.properties',
    '.csv', '.tsv',
    // Web
    '.html', '.htm', '.xhtml',
    '.css', '.scss', '.sass', '.less', '.styl',
    '.vue', '.svelte', '.astro',
    // Documents
    '.pdf',
    '.docx', '.doc',
    '.xlsx', '.xls',
    '.pptx', '.ppt',
    '.odt', '.ods', '.odp',
    '.rtf',
    // Other
    '.log', '.diff', '.patch',
    '.dockerfile', '.containerfile',
    '.gitignore', '.gitattributes',
    '.editorconfig', '.prettierrc', '.eslintrc',
    'makefile', 'cmakelists.txt', '.cmake',
    '.gradle', '.sbt', 'pom.xml', 'build.xml'
];

// ==================== ENHANCED FILE READING ====================

async function readFile(attachment) {
    const response = await fetch(attachment.url, { timeout: 30000 });
    
    if (!response.ok) {
        throw new Error(`Failed to download file: HTTP ${response.status}`);
    }
    
    const buffer = await response.buffer();
    const ext = path.extname(attachment.name || '').toLowerCase();
    const filename = attachment.name || 'unknown';
    
    console.log(`📄 Reading file: ${filename} (${ext}, ${buffer.length} bytes)`);
    
    // Detect by extension
    switch (ext) {
        // PDF
        case '.pdf':
            return await readPDFFile(buffer);
            
        // Word Documents
        case '.docx':
            return await readDOCXFile(buffer);
        case '.doc':
            return await readDOCFile(buffer);
            
        // Excel/Spreadsheet
        case '.xlsx':
        case '.xls':
        case '.csv':
        case '.ods':
            return await readExcelFile(buffer, ext);
            
        // PowerPoint
        case '.pptx':
        case '.ppt':
            return await readPPTXFile(buffer);
            
        // JSON with formatting
        case '.json':
        case '.jsonc':
        case '.json5':
            return formatJSONContent(buffer.toString('utf-8'));
            
        // All text-based files
        default:
            if (isTextBasedExtension(ext)) {
                return readTextFile(buffer);
            }
            
            // Try to detect if it's text
            if (isLikelyText(buffer)) {
                return readTextFile(buffer);
            }
            
            throw new Error(`Tipe file tidak didukung: ${ext}\n\nFile yang didukung:\n• Dokumen: PDF, Word, Excel, PowerPoint\n• Code: JS, Python, Java, C++, dll\n• Data: JSON, YAML, XML, CSV\n• Text: TXT, MD, LOG, dll`);
    }
}

function isTextBasedExtension(ext) {
    const textExts = [
        '.txt', '.md', '.markdown', '.rst', '.log', '.diff', '.patch',
        '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
        '.py', '.pyw', '.pyi', '.rb', '.php', '.pl', '.pm',
        '.java', '.kt', '.kts', '.scala', '.groovy',
        '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',
        '.cs', '.fs', '.vb',
        '.go', '.rs', '.swift', '.m', '.mm',
        '.r', '.R', '.rmd', '.jl',
        '.sql', '.prisma', '.graphql', '.gql',
        '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
        '.lua', '.vim', '.el', '.clj', '.cljs', '.edn',
        '.asm', '.s', '.wasm', '.wat',
        '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.properties',
        '.xml', '.xsl', '.xsd', '.svg', '.html', '.htm', '.xhtml',
        '.css', '.scss', '.sass', '.less', '.styl',
        '.vue', '.svelte', '.astro', '.ejs', '.pug', '.hbs',
        '.env', '.gitignore', '.gitattributes', '.editorconfig',
        '.dockerfile', '.containerfile',
        '.tf', '.tfvars', '.hcl',
        '.makefile', '.cmake', '.gradle', '.sbt'
    ];
    return textExts.includes(ext.toLowerCase()) || ext === '';
}

function isLikelyText(buffer) {
    // Check first 1000 bytes for binary content
    const sample = buffer.slice(0, Math.min(1000, buffer.length));
    let nullCount = 0;
    let controlCount = 0;
    
    for (const byte of sample) {
        if (byte === 0) nullCount++;
        if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) controlCount++;
    }
    
    // If more than 10% null bytes or control chars, probably binary
    return nullCount < sample.length * 0.1 && controlCount < sample.length * 0.1;
}

async function readTextFile(buffer) {
    // Try UTF-8 first
    let text = buffer.toString('utf-8');
    
    // Check for BOM and remove
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
    }
    
    // If garbled, try other encodings
    if (text.includes('�')) {
        try {
            text = buffer.toString('latin1');
        } catch {
            // Keep UTF-8 result
        }
    }
    
    return text;
}

async function readPDFFile(buffer) {
    try {
        const data = await pdfParse(buffer);
        
        if (!data.text || data.text.trim().length === 0) {
            throw new Error('PDF tidak memiliki teks yang bisa diekstrak (mungkin berupa gambar/scan)');
        }
        
        let text = data.text;
        
        // Clean up common PDF artifacts
        text = text
            .replace(/\f/g, '\n\n--- Page Break ---\n\n')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
            .replace(/\n{4,}/g, '\n\n\n')
            .trim();
        
        // Add metadata
        const meta = [];
        if (data.info?.Title) meta.push(`Title: ${data.info.Title}`);
        if (data.info?.Author) meta.push(`Author: ${data.info.Author}`);
        if (data.numpages) meta.push(`Pages: ${data.numpages}`);
        
        if (meta.length > 0) {
            text = `[PDF Metadata]\n${meta.join('\n')}\n\n[Content]\n${text}`;
        }
        
        return text;
        
    } catch (error) {
        if (error.message.includes('scan') || error.message.includes('gambar')) {
            throw error;
        }
        throw new Error(`Gagal membaca PDF: ${error.message}`);
    }
}

async function readDOCXFile(buffer) {
    try {
        const result = await mammoth.extractRawText({ buffer });
        
        if (!result.value || result.value.trim().length === 0) {
            throw new Error('Dokumen Word kosong atau tidak memiliki teks');
        }
        
        let text = result.value;
        
        // Report any warnings
        if (result.messages && result.messages.length > 0) {
            const warnings = result.messages
                .filter(m => m.type === 'warning')
                .map(m => m.message)
                .slice(0, 3);
            if (warnings.length > 0) {
                text = `[Catatan: ${warnings.join('; ')}]\n\n${text}`;
            }
        }
        
        return text;
        
    } catch (error) {
        throw new Error(`Gagal membaca DOCX: ${error.message}`);
    }
}

async function readDOCFile(buffer) {
    // Old .doc format - try to extract text
    try {
        // Simple text extraction for old .doc files
        let text = '';
        const content = buffer.toString('latin1');
        
        // Extract readable text between binary content
        const readable = content.match(/[\x20-\x7E\n\r\t]{20,}/g);
        if (readable) {
            text = readable.join('\n').trim();
        }
        
        if (text.length < 50) {
            throw new Error('Format .doc lama tidak dapat dibaca dengan baik. Coba konversi ke .docx');
        }
        
        return `[Catatan: Format .doc lama, sebagian konten mungkin hilang]\n\n${text}`;
        
    } catch (error) {
        throw new Error(`File .doc tidak dapat dibaca. Coba konversi ke .docx terlebih dahulu`);
    }
}

async function readExcelFile(buffer, ext) {
    try {
        const workbook = xlsx.read(buffer, { 
            type: 'buffer',
            cellDates: true,
            cellNF: true
        });
        
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            throw new Error('File spreadsheet kosong');
        }
        
        let output = [];
        
        workbook.SheetNames.forEach((sheetName, idx) => {
            const sheet = workbook.Sheets[sheetName];
            
            // Get range
            const range = xlsx.utils.decode_range(sheet['!ref'] || 'A1');
            const rowCount = range.e.r - range.s.r + 1;
            const colCount = range.e.c - range.s.c + 1;
            
            output.push(`\n📊 Sheet ${idx + 1}: "${sheetName}" (${rowCount} rows × ${colCount} columns)`);
            output.push('─'.repeat(50));
            
            // Convert to array of arrays
            const data = xlsx.utils.sheet_to_json(sheet, { 
                header: 1, 
                defval: '',
                blankrows: false 
            });
            
            if (data.length === 0) {
                output.push('(Sheet kosong)');
                return;
            }
            
            // Format as table
            data.slice(0, 100).forEach((row, rowIdx) => {
                if (Array.isArray(row)) {
                    const formattedRow = row.map(cell => {
                        if (cell === null || cell === undefined) return '';
                        if (cell instanceof Date) return cell.toLocaleDateString('id-ID');
                        return String(cell).slice(0, 50);
                    }).join(' | ');
                    
                    output.push(`Row ${rowIdx + 1}: ${formattedRow}`);
                    
                    // Add separator after header
                    if (rowIdx === 0) {
                        output.push('─'.repeat(50));
                    }
                }
            });
            
            if (data.length > 100) {
                output.push(`\n... dan ${data.length - 100} baris lainnya`);
            }
        });
        
        return output.join('\n');
        
    } catch (error) {
        throw new Error(`Gagal membaca spreadsheet: ${error.message}`);
    }
}

async function readPPTXFile(buffer) {
    try {
        // PowerPoint files are ZIP archives with XML content
        const JSZip = require('jszip');
        const zip = await JSZip.loadAsync(buffer);
        
        let slides = [];
        let slideNum = 1;
        
        // Read slide content
        for (const [filename, file] of Object.entries(zip.files)) {
            if (filename.match(/ppt\/slides\/slide\d+\.xml$/)) {
                const content = await file.async('string');
                
                // Extract text from XML
                const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g) || [];
                const texts = textMatches.map(m => m.replace(/<\/?a:t>/g, '').trim()).filter(t => t);
                
                if (texts.length > 0) {
                    slides.push(`\n📑 Slide ${slideNum}:\n${texts.join('\n')}`);
                }
                slideNum++;
            }
        }
        
        if (slides.length === 0) {
            throw new Error('Tidak dapat mengekstrak teks dari PowerPoint');
        }
        
        return `[PowerPoint - ${slides.length} slides]\n${slides.join('\n\n')}`;
        
    } catch (error) {
        if (error.message.includes('jszip')) {
            throw new Error('PowerPoint reader tidak tersedia');
        }
        throw new Error(`Gagal membaca PowerPoint: ${error.message}`);
    }
}

function formatJSONContent(text) {
    try {
        // Remove comments for JSONC
        const cleaned = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        const parsed = JSON.parse(cleaned);
        return JSON.stringify(parsed, null, 2);
    } catch {
        // Return original if can't parse
        return text;
    }
}

// ==================== ENHANCED URL READING ====================

async function fetchURLClean(url, options = {}) {
    const { maxLength = 10000, timeout = 20000 } = options;
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1'
            },
            signal: controller.signal,
            redirect: 'follow',
            follow: 5
        });
        
        clearTimeout(timeoutId);

        // ... (sisanya tetap sama)
        
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
            const json = await response.json();
            return { type: 'json', content: JSON.stringify(json, null, 2).slice(0, maxLength) };
        }
        
        if (contentType.includes('text/plain')) {
            const text = await response.text();
            return { type: 'text', content: text.slice(0, maxLength) };
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        const metadata = {
            title: $('title').text().trim() || $('meta[property="og:title"]').attr('content') || '',
            description: $('meta[name="description"]').attr('content') || '',
            author: $('meta[name="author"]').attr('content') || ''
        };
        
        $('script, style, noscript, iframe, svg, nav, header, footer, aside, .ad, .ads, .sidebar, .comments, .share, #ad, #ads').remove();
        
        let mainContent = '';
        const selectors = ['article', 'main', '.post-content', '.entry-content', '.article-body', '#content', '.content'];
        
        for (const sel of selectors) {
            const el = $(sel).first();
            if (el.length && el.text().trim().length > 200) {
                mainContent = el.text();
                break;
            }
        }
        
        if (!mainContent || mainContent.length < 200) mainContent = $('body').text();
        
        mainContent = mainContent.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
        
        let output = metadata.title ? `📰 **${metadata.title}**\n\n` : '';
        output += mainContent;
        
        return { type: 'html', title: metadata.title, content: output.slice(0, maxLength) };
        
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('Timeout');
        throw error;
    }
}

async function readGitHubContent(url) {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    
    // GitHub file URL: /owner/repo/blob/branch/path/to/file
    if (pathParts.length >= 4 && pathParts[2] === 'blob') {
        const rawUrl = url
            .replace('github.com', 'raw.githubusercontent.com')
            .replace('/blob/', '/');
        
        const response = await fetch(rawUrl, { timeout: 15000 });
        if (!response.ok) throw new Error(`Failed to fetch: HTTP ${response.status}`);
        
        const content = await response.text();
        const filename = pathParts[pathParts.length - 1];
        
        return {
            type: 'github-file',
            filename: filename,
            content: content
        };
    }
    
    // GitHub repo main page: /owner/repo
    if (pathParts.length === 2) {
        // Try to fetch README
        const readmeUrls = [
            `https://raw.githubusercontent.com/${pathParts[0]}/${pathParts[1]}/main/README.md`,
            `https://raw.githubusercontent.com/${pathParts[0]}/${pathParts[1]}/master/README.md`,
            `https://raw.githubusercontent.com/${pathParts[0]}/${pathParts[1]}/main/readme.md`,
            `https://raw.githubusercontent.com/${pathParts[0]}/${pathParts[1]}/master/readme.md`
        ];
        
        for (const readmeUrl of readmeUrls) {
            try {
                const response = await fetch(readmeUrl, { timeout: 10000 });
                if (response.ok) {
                    const content = await response.text();
                    return {
                        type: 'github-readme',
                        repo: `${pathParts[0]}/${pathParts[1]}`,
                        content: content
                    };
                }
            } catch {
                continue;
            }
        }
        
        // Fallback to regular fetch
        return await fetchURLClean(url);
    }
    
    // GitHub directory or other: fallback to regular fetch
    return await fetchURLClean(url);
}

async function readStackOverflow(url) {
    const result = await fetchURLClean(url, { maxLength: 15000 });
    
    // StackOverflow specific processing
    const $ = cheerio.load(result.content);
    
    let output = '';
    
    // Get question
    const question = $('.question .s-prose').first().text().trim();
    const questionTitle = $('h1').first().text().trim();
    
    if (questionTitle) output += `❓ **${questionTitle}**\n\n`;
    if (question) output += `${question}\n\n`;
    
    // Get accepted answer
    const acceptedAnswer = $('.accepted-answer .s-prose').first().text().trim();
    if (acceptedAnswer) {
        output += `✅ **Accepted Answer:**\n${acceptedAnswer}\n\n`;
    }
    
    // Get top voted answers
    $('.answer:not(.accepted-answer)').slice(0, 2).each((i, el) => {
        const answerText = $(el).find('.s-prose').first().text().trim();
        const votes = $(el).find('.js-vote-count').first().text().trim();
        if (answerText) {
            output += `📝 **Answer (${votes} votes):**\n${answerText.slice(0, 1000)}\n\n`;
        }
    });
    
    return {
        type: 'stackoverflow',
        content: output || result.content
    };
}

async function readYouTube(url) {
    // 1. Extract Video ID
    let videoId = null;
    const patterns = [
        /youtu\.be\/([^?&]+)/,
        /youtube\.com\/watch\?v=([^&]+)/,
        /youtube\.com\/embed\/([^?&]+)/,
        /youtube\.com\/v\/([^?&]+)/,
        /youtube\.com\/shorts\/([^?&]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            videoId = match[1];
            break;
        }
    }
    
    if (!videoId) throw new Error('Invalid YouTube URL');
    
    let output = '';
    let title = '';
    let description = '';
    let transcriptText = '';

    try {
        // 2. Fetch Halaman YouTube
        const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });
        
        const html = await pageRes.text();

        // 3. Extract Metadata
        const titleMatch = html.match(/<meta name="title" content="([^"]+)"/);
        title = titleMatch ? titleMatch[1] : `Video ${videoId}`;
        
        const descMatch = html.match(/"shortDescription":"([^"]+)"/);
        if (descMatch) description = descMatch[1].replace(/\\n/g, '\n');

        const channelMatch = html.match(/"ownerChannelName":"([^"]+)"/);
        const channel = channelMatch ? channelMatch[1] : 'Unknown';

        const viewMatch = html.match(/"viewCount":"(\d+)"/);
        const views = viewMatch ? parseInt(viewMatch[1]).toLocaleString('id-ID') : '-';

        const lengthMatch = html.match(/"lengthSeconds":"(\d+)"/);
        const duration = lengthMatch ? `${Math.floor(lengthMatch[1]/60)}:${(lengthMatch[1]%60).toString().padStart(2,'0')}` : '-';

        // 4. Extract Transcript / Subtitle (HACK)
        // YouTube menyimpan subtitle di dalam variabel javascript 'captionTracks'
        const captionMatch = html.match(/"captionTracks":(\[.*?\])/);
        
        if (captionMatch) {
            const tracks = JSON.parse(captionMatch[1]);
            // Prioritaskan Bahasa Indonesia, lalu Inggris, lalu yang pertama
            const track = tracks.find(t => t.languageCode === 'id') || 
                          tracks.find(t => t.languageCode === 'en') || 
                          tracks[0];

            if (track && track.baseUrl) {
                // Fetch XML Transcript
                const transcriptRes = await fetch(track.baseUrl);
                const transcriptXml = await transcriptRes.text();
                
                // Bersihkan XML tags untuk dapat teks murni
                transcriptText = transcriptXml
                    .replace(/<[^>]*>/g, ' ')       // Hapus tag HTML/XML
                    .replace(/&amp;/g, '&')
                    .replace(/&#39;/g, "'")
                    .replace(/&quot;/g, '"')
                    .replace(/\s+/g, ' ')           // Hapus spasi ganda
                    .trim();
            }
        }

        // 5. Susun Output untuk AI
        output = `🎬 **${title}**\n`;
        output += `📺 Channel: ${channel} | 👁️ Views: ${views} | ⏱️ Durasi: ${duration}\n\n`;
        
        if (transcriptText) {
            output += `🗣️ **TRANSKRIP AUDIO (ISI VIDEO):**\n"${transcriptText.slice(0, 15000)}..."\n\n`;
            output += `*Catatan: Analisis di atas didasarkan pada apa yang diucapkan dalam video.*\n\n`;
        } else {
            output += `⚠️ **Tidak ada subtitle/transkrip tersedia.** Analisis hanya berdasarkan deskripsi.\n\n`;
        }

        output += `📝 **Deskripsi:**\n${description.slice(0, 2000)}`;

    } catch (e) {
        console.error('YouTube Fetch Error:', e.message);
        output = `Gagal mengambil data YouTube. ID: ${videoId}`;
    }

    return {
        type: 'youtube',
        videoId: videoId,
        title: title,
        content: output
    };
}

async function readURL(url) {
    const domain = new URL(url).hostname;
    
    // YouTube
    if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
        return await readYouTube(url);
    }
    
    // GitHub
    if (domain.includes('github.com')) {
        return await readGitHubContent(url);
    }
    
    // StackOverflow
    if (domain.includes('stackoverflow.com') || domain.includes('stackexchange.com')) {
        return await readStackOverflow(url);
    }
    
    // Generic fetch
    return await fetchURLClean(url);
}

// ==================== HANDLER FUNCTIONS ====================

async function handleReadCommand(msg, args) {
    // Check for URL argument
    if (args.length > 0 && args[0].match(/^https?:\/\//)) {
        return await handleURLAnalysis(msg, [args[0]], args.slice(1).join(' '));
    }
    
    // Check for attachment
    if (msg.attachments.size > 0) {
        const attachment = msg.attachments.first();
        return await handleFileReadWithQuery(msg, attachment, args.join(' '));
    }
    
    // Check for reply with attachment
    if (msg.reference) {
        try {
            const repliedMsg = await msg.channel.messages.fetch(msg.reference.messageId);
            if (repliedMsg.attachments.size > 0) {
                const attachment = repliedMsg.attachments.first();
                return await handleFileReadWithQuery(msg, attachment, args.join(' '));
            }
        } catch {
            // Ignore fetch error
        }
    }
    
    // No input
    await msg.reply(`📄 **Cara menggunakan .read:**

**File Upload:**
\`.read\` + upload file
\`.read jelaskan kode ini\` + upload file

**URL:**
\`.read https://example.com/article\`
\`.read https://github.com/user/repo/blob/main/file.js jelaskan\`

**Reply:**
Reply ke pesan dengan attachment + ketik \`.read\`

**Format yang didukung:**
• 📄 Dokumen: PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx)
• 💻 Code: JS, Python, Java, C++, Go, Rust, dll
• 📊 Data: JSON, YAML, XML, CSV
• 📝 Text: TXT, MD, LOG, dll`);
}

async function handleAnalyzeCommand(msg, args) {
    if (msg.attachments.size === 0) {
        // Check for reply
        if (msg.reference) {
            try {
                const repliedMsg = await msg.channel.messages.fetch(msg.reference.messageId);
                if (repliedMsg.attachments.size > 0) {
                    const attachment = repliedMsg.attachments.first();
                    const images = [attachment].filter(a => a.contentType?.startsWith('image/'));
                    if (images.length > 0) {
                        return await handleImageAnalysisWithQuery(msg, images[0], args.join(' '));
                    } else {
                        return await handleFileReadWithQuery(msg, attachment, args.join(' '));
                    }
                }
            } catch {
                // Ignore
            }
        }
        
        return msg.reply(`🔍 **Cara menggunakan .analyze:**

**Gambar:**
\`.analyze\` + upload gambar
\`.analyze apa yang ada di gambar ini?\` + upload gambar

**File:**
\`.analyze\` + upload file
\`.analyze apakah ada bug di kode ini?\` + upload file

**Reply:**
Reply ke pesan dengan gambar/file + ketik \`.analyze\``);
    }
    
    const attachment = msg.attachments.first();
    const images = msg.attachments.filter(a => a.contentType?.startsWith('image/'));
    
    if (images.size > 0) {
        return await handleImageAnalysisWithQuery(msg, images.first(), args.join(' '));
    } else {
        return await handleFileReadWithQuery(msg, attachment, args.join(' '));
    }
}

async function handleFileReadWithQuery(msg, attachment, query = '') {
    // Size check
    if (attachment.size > CONFIG.maxFileSize) {
        return msg.reply(`❌ File terlalu besar!\n\nMax: ${(CONFIG.maxFileSize / 1024 / 1024).toFixed(1)} MB\nFile: ${(attachment.size / 1024 / 1024).toFixed(2)} MB`);
    }
    
    const statusMsg = await msg.reply(`📄 Membaca **${attachment.name}**...`);
    
    try {
        const content = await readFile(attachment);
        
        if (!content || content.trim().length < 10) {
            return statusMsg.edit('❌ File kosong atau tidak dapat dibaca');
        }
        
        await statusMsg.edit(`💭 Menganalisis **${attachment.name}**...`);
        
        // Determine file type for better prompting
        const ext = path.extname(attachment.name || '').toLowerCase();
        const isCode = ['.js', '.ts', '.py', '.java', '.c', '.cpp', '.go', '.rs', '.rb', '.php'].includes(ext);
        const isData = ['.json', '.yaml', '.yml', '.xml', '.csv'].includes(ext);
        const isDoc = ['.pdf', '.docx', '.doc', '.txt', '.md'].includes(ext);
        
        let analysisPrompt = '';
        
        if (query) {
            analysisPrompt = `Berdasarkan file "${attachment.name}" berikut, jawab pertanyaan/permintaan user:\n\n[USER REQUEST]\n${query}\n\n`;
        } else if (isCode) {
            analysisPrompt = `Analisis kode dalam file "${attachment.name}":\n1. Jelaskan fungsi utama kode ini\n2. Identifikasi pola/pattern yang digunakan\n3. Berikan saran improvement jika ada\n\n`;
        } else if (isData) {
            analysisPrompt = `Analisis data dalam file "${attachment.name}":\n1. Jelaskan struktur data\n2. Identifikasi informasi penting\n3. Berikan ringkasan isi data\n\n`;
        } else if (isDoc) {
            analysisPrompt = `Analisis dokumen "${attachment.name}":\n1. Berikan ringkasan isi\n2. Identifikasi poin-poin penting\n3. Jelaskan kesimpulan utama jika ada\n\n`;
        } else {
            analysisPrompt = `Analisis file "${attachment.name}" dan jelaskan isinya:\n\n`;
        }
        
        const maxContent = 50000;
analysisPrompt += `[FILE CONTENT]\n${content.slice(0, maxContent)}`;

if (content.length > maxContent) {
    analysisPrompt += `\n\n[Note: File terpotong, total ${content.length} karakter]`;
}
        
        // Call AI
        const response = await callAI(msg.guild.id, msg.author.id, analysisPrompt, false);
        
        // Format response
        let finalMsg = `📄 **${attachment.name}**\n\n${response.text}`;
        finalMsg += `\n\n-# ${response.model} • ${response.latency}ms`;
        
        if (content.length > 1000000) {
            finalMsg += ` • ⚠️ File terpotong`;
        }
        
        const parts = splitMessage(finalMsg);
        await statusMsg.edit(parts[0]);
        
        for (let i = 1; i < parts.length; i++) {
            await msg.channel.send(parts[i]);
        }
        
    } catch (error) {
        console.error('File read error:', error);
        await statusMsg.edit(`❌ Gagal membaca file: ${error.message}`);
    }
}

async function handleImageAnalysisWithQuery(msg, image, query = '') {
    // Size check
    if (image.size > CONFIG.maxImageSize) {
        return msg.reply(`❌ Gambar terlalu besar!\n\nMax: ${(CONFIG.maxImageSize / 1024 / 1024).toFixed(1)} MB\nGambar: ${(image.size / 1024 / 1024).toFixed(2)} MB`);
    }
    
    const statusMsg = await msg.reply(`🖼️ Menganalisis gambar...`);
    
    try {
        const prompt = query || 'Jelaskan gambar ini secara detail dalam Bahasa Indonesia. Identifikasi objek, teks, warna, dan konteks yang terlihat.';
        
        const analysis = await analyzeImage(image.url, prompt);
        
        let finalMsg = `🖼️ **Analisis Gambar**\n\n${analysis}`;
        finalMsg += `\n\n-# Gemini Vision • ${Date.now() - msg.createdTimestamp}ms`;
        
        const parts = splitMessage(finalMsg);
        await statusMsg.edit(parts[0]);
        
        for (let i = 1; i < parts.length; i++) {
            await msg.channel.send(parts[i]);
        }
        
    } catch (error) {
        console.error('Image analysis error:', error);
        await statusMsg.edit(`❌ Gagal menganalisis gambar: ${error.message}`);
    }
}

async function handleURLAnalysis(msg, urls, query = '') {
    const statusMsg = await msg.reply(`🔗 Membaca ${urls.length} URL...`);
    
    try {
        const contents = [];
        const failedUrls = [];
        
        for (const url of urls.slice(0, 3)) {
            try {
                const hostname = new URL(url).hostname;
                await statusMsg.edit(`📖 Membaca: ${hostname}...`);
                
                const result = await readURL(url);
                
                if (result && result.content && result.content.length > 100) {
                    contents.push({
                        url: url,
                        hostname: hostname,
                        type: result.type,
                        title: result.title || result.filename || hostname,
                        content: result.content
                    });
                }
            } catch (error) {
                console.error(`Failed to fetch ${url}:`, error.message);
                failedUrls.push({ url, error: error.message });
            }
        }
        
        if (contents.length === 0) {
            let errorMsg = '❌ Tidak dapat membaca URL.';
            if (failedUrls.length > 0) {
                errorMsg += '\n\n**Errors:**\n' + failedUrls.map(f => `• ${new URL(f.url).hostname}: ${f.error}`).join('\n');
            }
            return statusMsg.edit(errorMsg);
        }
        
        await statusMsg.edit(`💭 Menganalisis ${contents.length} sumber...`);
        
        // Build analysis prompt
        let analysisPrompt = '';
        
        if (query) {
            analysisPrompt = `Berdasarkan konten dari URL berikut, jawab pertanyaan/permintaan user:\n\n[USER REQUEST]\n${query}\n\n`;
        } else {
            analysisPrompt = `Analisis dan jelaskan konten dari URL berikut:\n\n`;
        }
        
        contents.forEach((c, i) => {
            analysisPrompt += `\n[SOURCE ${i + 1}: ${c.title}]\nURL: ${c.url}\nType: ${c.type}\n\n${c.content.slice(0, 5000)}\n`;
        });
        
        if (!query) {
            analysisPrompt += '\n\nBerikan:\n1. Ringkasan utama\n2. Poin-poin penting\n3. Kesimpulan\n\nJawab dalam Bahasa Indonesia.';
        }
        
        // Call AI
        const response = await callAI(msg.guild.id, msg.author.id, analysisPrompt, false);
        
        // Format response
        let finalMsg = response.text;
        
        // Add sources
        finalMsg += '\n\n📚 **Sumber:**\n';
        finalMsg += contents.map(c => `• [${c.title}](${c.url})`).join('\n');
        
        if (failedUrls.length > 0) {
            finalMsg += `\n\n⚠️ ${failedUrls.length} URL gagal dibaca`;
        }
        
        finalMsg += `\n\n-# ${response.model} • ${response.latency}ms 🔗`;
        
        const parts = splitMessage(finalMsg);
        await statusMsg.edit(parts[0]);
        
        for (let i = 1; i < parts.length; i++) {
            await msg.channel.send(parts[i]);
        }
        
    } catch (error) {
        console.error('URL analysis error:', error);
        await statusMsg.edit(`❌ Error: ${error.message}`);
    }
}

async function handleSearchCommand(msg, query) {
    if (!query) {
        return msg.reply(`🔍 **Cara menggunakan .search:**

\`.search <query>\`

**Contoh:**
• \`.search berita teknologi hari ini\`
• \`.search harga bitcoin terkini\`
• \`.search siapa presiden Indonesia 2026\`
• \`.search cuaca Jakarta hari ini\`

Bot akan mencari di internet dan memberikan jawaban lengkap.`);
    }
    
    const statusMsg = await msg.reply('🔍 Mencari...');
    
    try {
        // Perform search
        const searchResults = await performSearch(query);
        
        if (!searchResults) {
            return statusMsg.edit('❌ Search tidak tersedia. Pastikan SERPER_API_KEY atau TAVILY_API_KEY sudah diset.');
        }
        
        if (!searchResults.urls?.length && !searchResults.facts?.length && !searchResults.answer) {
            return statusMsg.edit('❌ Tidak ada hasil pencarian untuk query tersebut.');
        }
        
        // Fetch URL contents if available
        const contents = [];
        if (searchResults.urls && searchResults.urls.length > 0) {
            await statusMsg.edit(`📖 Membaca ${searchResults.urls.length} sumber...`);
            
            for (const url of searchResults.urls.slice(0, 3)) {
                try {
                    const result = await fetchURLClean(url, { maxLength: 4000, timeout: 10000 });
                    if (result && result.content) {
                        contents.push({
                            url,
                            content: result.content
                        });
                    }
                } catch (e) {
                    console.error('Search URL fetch failed:', e.message);
                }
            }
        }
        
        await statusMsg.edit('💭 Menyusun jawaban...');
        
        // Build context
        let contextPrompt = `Jawab pertanyaan user berdasarkan informasi dari internet.

[CURRENT DATE: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full', timeZone: 'Asia/Jakarta' })}]

[USER QUESTION]
${query}

[SEARCH RESULTS]
`;
        
        if (searchResults.answer) {
            contextPrompt += `\nDirect Answer: ${searchResults.answer}\n`;
        }
        
        if (searchResults.facts && searchResults.facts.length > 0) {
            contextPrompt += `\nFacts:\n${searchResults.facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`;
        }
        
        if (contents.length > 0) {
            contextPrompt += `\n[DETAILED SOURCES]\n`;
            contents.forEach((c, i) => {
                contextPrompt += `\nSource ${i + 1} (${new URL(c.url).hostname}):\n${c.content.slice(0, 3000)}\n`;
            });
        }
        
        contextPrompt += `\n[INSTRUCTIONS]
1. Berikan jawaban yang akurat berdasarkan informasi di atas
2. Sebutkan jika informasi mungkin sudah tidak update
3. Gunakan Bahasa Indonesia yang baik
4. Jangan mengarang informasi yang tidak ada di sumber`;
        
        // Call AI
        const response = await callAI(msg.guild.id, msg.author.id, contextPrompt, false);
        
        // Format response
        let finalMsg = response.text;
        
        // Add sources
        if (searchResults.urls && searchResults.urls.length > 0) {
            finalMsg += '\n\n📚 **Sumber:**\n';
            finalMsg += searchResults.urls.slice(0, 3).map(url => {
                try {
                    return `• ${new URL(url).hostname}`;
                } catch {
                    return `• ${url.slice(0, 50)}`;
                }
            }).join('\n');
        }
        
        finalMsg += `\n\n-# ${response.model} • ${response.latency}ms • 🔍 ${searchResults.source}`;
        
        const parts = splitMessage(finalMsg);
        await statusMsg.edit(parts[0]);
        
        for (let i = 1; i < parts.length; i++) {
            await msg.channel.send(parts[i]);
        }
        
    } catch (error) {
        console.error('Search error:', error);
        await statusMsg.edit(`❌ Error: ${error.message}`);
    }
}

async function handleStatusCommand(msg) {
    const poolStatus = await manager.getPoolStatus();
    const settings = getSettings(msg.guild.id);
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    
    const formatUptime = (seconds) => {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        
        const parts = [];
        if (d > 0) parts.push(`${d}d`);
        if (h > 0) parts.push(`${h}h`);
        if (m > 0) parts.push(`${m}m`);
        if (s > 0 || parts.length === 0) parts.push(`${s}s`);
        return parts.join(' ');
    };
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Aria AI Bot Status')
        .setDescription(`v3.0.0 Complete Edition`)
        .addFields(
            { 
                name: '⏱️ Uptime', 
                value: formatUptime(uptime), 
                inline: true 
            },
            { 
                name: '🌐 Servers', 
                value: `${client.guilds.cache.size}`, 
                inline: true 
            },
            { 
                name: '💬 Conversations', 
                value: `${conversations.size}`, 
                inline: true 
            },
            {
                name: '🎯 Current Settings',
                value: `AI: ${AI_PROVIDERS[settings.aiProvider]?.name || settings.aiProvider}\nModel: ${settings.aiModel}\nSearch: ${settings.searchEnabled ? '✅' : '❌'}\nGrounding: ${settings.geminiGrounding ? '✅' : '❌'}`,
                inline: false
            },
            {
                name: '✨ Features',
                value: [
                    `• AI Chat: ✅`,
                    `• Voice AI: ${isVoiceAIEnabled(msg.guild.id) ? '🟢 ON' : '⚪ OFF'}`,
                    `• TTS Public: Edge-TTS ✅`,
                    `• TTS Admin: ${CONFIG.elevenlabs?.apiKey ? 'ElevenLabs 🟢' : 'Edge-TTS ⚪'}`,
                    `• Web Search: ${CONFIG.serperApiKey || CONFIG.tavilyApiKey ? '✅' : '❌'}`,
                    `• Image Analysis: ${CONFIG.geminiApiKey ? '✅' : '❌'}`
                ].join('\n'),
                inline: true
            },
            {
                name: '🔗 Connections',
                value: [
                    `• Redis: ${manager.connected ? '🟢' : '🔴'}`,
                    `• Voice: ${voiceConnections.size} active`,
                    `• WebSocket: ${client.ws.ping}ms`
                ].join('\n'),
                inline: true
            }
        )
        .setTimestamp();
    
    // Add API pool info
    const poolInfo = Object.entries(poolStatus)
        .filter(([_, s]) => s.keys > 0)
        .map(([p, s]) => `${p}: ${s.keys} keys`)
        .join(' | ');
    
    if (poolInfo) {
        embed.addFields({ name: '🔑 API Pool', value: poolInfo, inline: false });
    }
    
    await msg.reply({ embeds: [embed] });
}

async function handleHelpCommand(msg) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🤖 Aria AI Bot')
        .setDescription('Asisten AI canggih dengan berbagai kemampuan')
        .addFields(
            {
                name: '💬 Chat AI',
                value: [
                    '`.ai <pertanyaan>` - Tanya AI',
                    '`@Aria <pertanyaan>` - Mention bot',
                    '`.clear` - Hapus memory percakapan'
                ].join('\n'),
                inline: false
            },
            {
                name: '🔍 Search',
                value: [
                    '`.search <query>` - Cari di internet',
                    'Auto search untuk pertanyaan real-time'
                ].join('\n'),
                inline: false
            },
            {
                name: '📄 File & Dokumen',
                value: [
                    '`.read` + upload file',
                    '`.read <url>` - Baca dari URL',
                    '`.analyze` + upload - Analisis mendalam',
                    '',
                    '*Didukung: PDF, Word, Excel, PowerPoint, Code (JS/Python/dll), JSON, YAML, CSV, TXT, MD*'
                ].join('\n'),
                inline: false
            },
            {
                name: '🖼️ Gambar',
                value: [
                    '`@Aria` + upload gambar',
                    '`.analyze` + upload gambar',
                    'Bisa identifikasi objek, baca teks, dll'
                ].join('\n'),
                inline: false
            },
            {
                name: '🔗 URL & Web',
                value: [
                    '`.url <link>` - Baca halaman web',
                    '`@Aria <url>` - Auto analisis URL',
                    'Support: GitHub, StackOverflow, artikel, dokumentasi'
                ].join('\n'),
                inline: false
            },
            {
                name: '🎙️ Podcast Mode',
                value: [
                    '`.on` - Mulai podcast (Bot mendengar & menjawab)',
                    '`.off` - Selesai podcast',
                    '`.voiceai status` - Cek status',
                    '',
                    '**🔊 Voice Commands:**',
                    '`.speak <text>` - Bot bicara (TTS)',
                    '`.join` / `.leave` - Kontrol voice channel',
                    '`.stop` - Stop audio yang sedang main'
                ].join('\n'),
                inline: false
            },
            {
                name: '⚙️ Admin Commands',
                value: [
                    '`.settings` - Panel pengaturan',
                    '`.manage` - API Manager',
                    '`.status` - Status bot'
                ].join('\n'),
                inline: false
            },
            {
                name: 'ℹ️ Info',
                value: [
                    '`.ping` - Cek latency',
                    '`.model` - Info AI models',
                    '`.help` - Bantuan ini'
                ].join('\n'),
                inline: false
            }
        )
        .setFooter({ text: 'Aria AI Bot v3.0.0 • Made with ❤️' })
        .setTimestamp();
    
    await msg.reply({ embeds: [embed] });
}

async function handleModelInfoCommand(msg) {
    const settings = getSettings(msg.guild.id);
    const currentProvider = AI_PROVIDERS[settings.aiProvider];
    
    let description = `**Current:** ${currentProvider?.name || settings.aiProvider} - ${settings.aiModel}\n\n`;
    
    description += '**Available Providers:**\n';
    
    for (const [key, provider] of Object.entries(AI_PROVIDERS)) {
        const modelCount = provider.models?.length || 0;
        const isActive = key === settings.aiProvider ? ' ✅' : '';
        description += `• **${provider.name}**${isActive} (${modelCount} models)\n`;
    }
    
    description += '\n*Gunakan `.settings` untuk mengubah provider/model*';
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🤖 AI Models')
        .setDescription(description)
        .setTimestamp();
    
    await msg.reply({ embeds: [embed] });
}

// ==================== BOT EVENTS & LOGIN ====================
client.once(Events.ClientReady, () => {
    console.log('='.repeat(50));
    console.log(`✅ ${client.user.tag} is ONLINE!`);
    console.log(`📡 Serving ${client.guilds.cache.size} servers`);
    console.log(`📦 v3.0.0 Complete Edition`);
    console.log('='.repeat(50));
    client.user.setPresence({
        status: 'online',
        activities: [{ name: '.help | AI Assistant', type: ActivityType.Listening }]
    });
    ensureTempDir();
});

client.on(Events.Error, e => console.error('Client Error:', e.message));
client.on(Events.Warn, w => console.warn('Warning:', w));
process.on('unhandledRejection', e => console.error('Unhandled:', e));
process.on('uncaughtException', e => console.error('Uncaught:', e));
process.on('SIGTERM', () => { voiceConnections.forEach(c => c.destroy()); client.destroy(); process.exit(0); });
process.on('SIGINT', () => { voiceConnections.forEach(c => c.destroy()); client.destroy(); process.exit(0); });

if (!CONFIG.token) { console.error('❌ DISCORD_TOKEN not set!'); process.exit(1); }
console.log('🔑 Token:', CONFIG.token.slice(0,10) + '***');
console.log('🔄 Connecting...');

client.login(CONFIG.token).then(() => {
    console.log('✅ Login successful!');
}).catch(err => {
    console.error('❌ LOGIN FAILED:', err.message);
    if (err.message.includes('TOKEN_INVALID')) console.error('Token invalid! Reset di Developer Portal');
    if (err.message.includes('DISALLOWED_INTENTS')) console.error('Enable MESSAGE CONTENT INTENT di Developer Portal!');
    process.exit(1);
});
