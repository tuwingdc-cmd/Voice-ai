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
    const CONFIG = {
    token: process.env.DISCORD_TOKEN,
    prefix: '.',
    adminIds: (process.env.ADMIN_IDS || '').split(',').filter(Boolean),
    // ... sisanya tetap sama
};

// ==================== VALIDATE TOKEN ====================
if (!CONFIG.token) {
    console.error('❌ FATAL: DISCORD_TOKEN is not set!');
    process.exit(1);
}
if (CONFIG.token.length < 50) {
    console.error('❌ FATAL: DISCORD_TOKEN appears invalid (too short)');
    process.exit(1);
}
console.log('🔑 Token found:', CONFIG.token.slice(0, 10) + '...' + CONFIG.token.slice(-5));
    tempPath: './temp',
    // API Keys (ENV Fallback)
    tavilyApiKey: process.env.TAVILY_API_KEY,
    serperApiKey: process.env.SERPER_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    groqApiKey: process.env.GROQ_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
    pollinationsApiKey: process.env.POLLINATIONS_API_KEY,
    // Settings
    maxConversationMessages: 100,
    maxConversationAge: 7200000,
    rateLimitWindow: 60000,
    rateLimitMax: 30,
    voiceInactivityTimeout: 300000,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxImageSize: 5 * 1024 * 1024  // 5MB
};

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
        'discord.js.org', 'npmjs.com', 'wikipedia.org'
    ];
    return autoFetchDomains.some(d => domain.includes(d));
}

function isMediaFile(url) {
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

const SYSTEM_PROMPT = `Kamu adalah Aria, asisten AI premium yang elegan, cerdas, dan profesional.

## IDENTITAS
- Nama: Aria
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
- Gunakan bahasa Indonesia yang baik dan natural
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
// ==================== AI MODELS CONFIGURATION ====================

const POLLINATIONS_MODELS = [
    { id: 'openai', name: 'OpenAI GPT', version: 'GPT-5-nano' },
    { id: 'openai-fast', name: 'OpenAI Fast', version: 'GPT-5-fast' },
    { id: 'openai-large', name: 'OpenAI Large', version: 'GPT-5-large' },
    { id: 'claude', name: 'Claude', version: 'Claude-3.5' },
    { id: 'claude-fast', name: 'Claude Fast', version: 'Claude-fast' },
    { id: 'gemini', name: 'Gemini', version: 'Gemini-3-Flash' },
    { id: 'gemini-fast', name: 'Gemini Fast', version: 'Gemini-fast' },
    { id: 'deepseek', name: 'DeepSeek', version: 'V3' },
    { id: 'deepseek-r1', name: 'DeepSeek R1', version: 'R1' },
    { id: 'qwen', name: 'Qwen', version: 'Qwen3' },
    { id: 'llama', name: 'Llama', version: 'Llama-3.3' },
    { id: 'mistral', name: 'Mistral', version: 'Mistral-Small' }
];

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
            { id: 'deep-research-pro-preview-12-2025', name: 'Deep Research Pro', version: 'research' }
        ]
    },

    groq: {
        name: 'Groq',
        models: [
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', version: 'v3.3' },
            { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', version: 'v3.1' },
            { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', version: '8x7B' },
            { id: 'gemma2-9b-it', name: 'Gemma 2 9B', version: '9B' }
        ]
    },

    openrouter: {
        name: 'OpenRouter',
        models: [
            { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (free)', version: '2.0-flash' },
            { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)', version: '70B' },
            { id: 'deepseek/deepseek-r1-0528:free', name: 'DeepSeek R1 (free)', version: 'R1' },
            { id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder (free)', version: 'Coder' },
            { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 24B (free)', version: '24B' }
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
            { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', version: '70B' },
            { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B', version: '8B' },
            { id: 'meta-llama/Llama-3.2-3B-Instruct', name: 'Llama 3.2 3B', version: '3B' },
            { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B v0.3', version: '7B' },
            { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B', version: '8x7B' },
            { id: 'microsoft/Phi-3-mini-4k-instruct', name: 'Phi 3 Mini', version: '3.8B' },
            { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B', version: '9B' },
            { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen 2.5 7B', version: '7B' },
            { id: 'HuggingFaceH4/zephyr-7b-beta', name: 'Zephyr 7B', version: '7B' }
        ]
    }
};

const TTS_VOICES = [
    { id: 'id-ID-GadisNeural', name: 'Gadis (ID)', lang: 'id' },
    { id: 'id-ID-ArdiNeural', name: 'Ardi (ID)', lang: 'id' },
    { id: 'en-US-JennyNeural', name: 'Jenny (US)', lang: 'en' },
    { id: 'en-US-GuyNeural', name: 'Guy (US)', lang: 'en' },
    { id: 'ja-JP-NanamiNeural', name: 'Nanami (JP)', lang: 'ja' }
];

// ==================== DEFAULT SETTINGS ====================

const DEFAULT_SETTINGS = {
    aiProvider: 'gemini',
    aiModel: 'gemini-2.5-flash',
    ttsVoice: 'id-ID-GadisNeural',
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

function getSettings(guildId) {
    if (!guildSettings.has(guildId)) guildSettings.set(guildId, { ...DEFAULT_SETTINGS });
    return guildSettings.get(guildId);
}

function updateSettings(guildId, key, value) {
    const s = getSettings(guildId);
    s[key] = value;
}

function isAdmin(userId) {
    return CONFIG.adminIds.includes(userId);
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

async function generateTTS(text, voice) {
    return new Promise((resolve, reject) => {
        ensureTempDir();
        const outputPath = path.join(CONFIG.tempPath, `tts_${Date.now()}.mp3`);
        const safeText = cleanTextForTTS(text).replace(/"/g, "'").replace(/`/g, "'");

        if (!safeText || safeText.length < 2) return reject(new Error('Text too short'));

        exec(`edge-tts --voice "${voice}" --text "${safeText}" --write-media "${outputPath}"`, 
            { timeout: 30000 }, 
            (err) => {
                if (err) reject(err);
                else resolve(outputPath);
            }
        );
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
            maxOutputTokens: 2048,
            thinkingMode: model.includes('pro') || model.includes('research') // Enable thinking for pro models
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
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
    }, JSON.stringify({ model, messages, max_completion_tokens: 2000, temperature: 0.7 }));

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

        return { success: true, channel: vc };

    } catch (e) {
        console.error('Voice join error:', e.message);
        return { success: false, error: e.message };
    }
}

async function leaveVoiceChannel(guild) {
    const guildId = guild.id || guild;
    const conn = voiceConnections.get(guildId) || getVoiceConnection(guildId);

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

    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Aria Settings')
        .addFields(
            { name: '🧠 AI Provider', value: `**${ai?.name || s.aiProvider}**\n${model.name}`, inline: true },
            { name: '🔊 TTS Voice', value: s.ttsVoice.split('-').slice(-1)[0], inline: true },
            { name: '🔍 Search', value: s.geminiGrounding ? '🟢 Grounding ON' : (s.searchEnabled ? '🟢 ON' : '🔴 OFF'), inline: true }
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

function createVoiceMenu(guildId) {
    const s = getSettings(guildId);
    const opts = TTS_VOICES.map(v => ({
        label: v.name, value: v.id, default: v.id === s.ttsVoice
    }));
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_voice').setPlaceholder('🔊 Voice').addOptions(opts)
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
        if (inVoice) {
            try {
                const s = getSettings(msg.guild.id);
                const ttsFile = await generateTTS(response.text, s.ttsVoice);
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
        const ttsFile = await generateTTS(text, s.ttsVoice);
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

            // ===== SETTINGS COMMANDS =====
            case 'settings':
            case 'config':
            case 'set':
            case 'pengaturan':
                if (!isAdmin(msg.author.id)) return msg.reply('❌ Hanya admin yang bisa mengakses pengaturan');
                const comps = [
                    createProviderMenu(msg.guild.id),
                    createModelMenu(msg.guild.id),
                    createVoiceMenu(msg.guild.id),
                    createModeButtons(msg.guild.id)
                ].filter(Boolean);
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
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            signal: controller.signal,
            follow: 5 // Max redirects
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type') || '';
        
        // Handle different content types
        if (contentType.includes('application/json')) {
            const json = await response.json();
            return {
                type: 'json',
                content: JSON.stringify(json, null, 2).slice(0, maxLength)
            };
        }
        
        if (contentType.includes('text/plain')) {
            const text = await response.text();
            return {
                type: 'text',
                content: text.slice(0, maxLength)
            };
        }
        
        // Default: HTML processing
        const html = await response.text();
        const $ = cheerio.load(html);
        
        // Extract metadata
        const metadata = {
            title: $('title').text().trim() || $('meta[property="og:title"]').attr('content') || '',
            description: $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '',
            author: $('meta[name="author"]').attr('content') || $('meta[property="article:author"]').attr('content') || '',
            date: $('meta[property="article:published_time"]').attr('content') || $('time').first().attr('datetime') || ''
        };
        
        // Remove unwanted elements
        const removeSelectors = [
            'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
            'nav', 'header', 'footer', 'aside',
            '.ad', '.ads', '.advertisement', '.banner', '.promo',
            '.sidebar', '.widget', '.related', '.recommended',
            '.comments', '.comment-section', '.disqus',
            '.share', '.social-share', '.social-buttons',
            '.popup', '.modal', '.overlay', '.cookie',
            '.newsletter', '.subscribe', '.signup',
            '#ad', '#ads', '#advertisement', '#sidebar',
            '[class*="advertisement"]', '[class*="sponsor"]',
            '[id*="google_ads"]', '[id*="taboola"]', '[id*="outbrain"]'
        ];
        
        removeSelectors.forEach(sel => $(sel).remove());
        
        // Try to find main content
        let mainContent = '';
        
        const contentSelectors = [
            'article',
            '[role="main"]',
            'main',
            '.post-content',
            '.entry-content',
            '.article-content',
            '.article-body',
            '.content-body',
            '.story-body',
            '#content',
            '.content',
            '.post',
            '.article'
        ];
        
        for (const selector of contentSelectors) {
            const element = $(selector).first();
            if (element.length && element.text().trim().length > 200) {
                mainContent = element.text();
                break;
            }
        }
        
        // Fallback to body
        if (!mainContent || mainContent.length < 200) {
            mainContent = $('body').text();
        }
        
        // Clean whitespace
        mainContent = mainContent
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .trim();
        
        // Build output with metadata
        let output = '';
        
        if (metadata.title) {
            output += `📰 **${metadata.title}**\n\n`;
        }
        
        if (metadata.author || metadata.date) {
            const meta = [];
            if (metadata.author) meta.push(`Author: ${metadata.author}`);
            if (metadata.date) meta.push(`Date: ${new Date(metadata.date).toLocaleDateString('id-ID')}`);
            output += `*${meta.join(' | ')}*\n\n`;
        }
        
        output += mainContent;
        
        return {
            type: 'html',
            title: metadata.title,
            content: output.slice(0, maxLength)
        };
        
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Timeout: Halaman terlalu lama merespons');
        }
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

async function readURL(url) {
    const domain = new URL(url).hostname;
    
    // Special handlers for known sites
    if (domain.includes('github.com')) {
        return await readGitHubContent(url);
    }
    
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
        
        analysisPrompt += `[FILE CONTENT]\n${content.slice(0, 12000)}`;
        
        if (content.length > 12000) {
            analysisPrompt += `\n\n[Note: File terpotong, total ${content.length} karakter]`;
        }
        
        // Call AI
        const response = await callAI(msg.guild.id, msg.author.id, analysisPrompt, false);
        
        // Format response
        let finalMsg = `📄 **${attachment.name}**\n\n${response.text}`;
        finalMsg += `\n\n-# ${response.model} • ${response.latency}ms`;
        
        if (content.length > 12000) {
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
• \`.search siapa presiden Indonesia 2024\`
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
                    `• Voice TTS: ✅`,
                    `• Web Search: ${CONFIG.serperApiKey || CONFIG.tavilyApiKey ? '✅' : '❌'}`,
                    `• URL Reading: ✅`,
                    `• File Reading: ✅`,
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
                name: '🔊 Voice',
                value: [
                    '`.join` - Gabung voice channel',
                    '`.leave` - Keluar voice',
                    '`.speak <text>` - Text to speech',
                    '`.stop` - Stop audio'
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
    