// ============================================================
//         DISCORD AI BOT v3.0 - COMPLETE EDITION
//         All Features: AI, Voice, Search, URL, File, Image
// ============================================================

const {
    Client,
    GatewayIntentBits,
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
    token: process.env.DISCORD_TOKEN,
    prefix: '.',
    adminIds: (process.env.ADMIN_IDS || '').split(',').filter(Boolean),
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
        GatewayIntentBits.GuildVoiceStates
    ]
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

// ==================== MESSAGE HANDLER (CONTINUED) ====================

        // Check for readable files
        const readableFiles = msg.attachments.filter(a => {
            const ext = path.extname(a.name || '').toLowerCase();
            const readableExts = ['.txt', '.js', '.py', '.json', '.md', '.yml', '.yaml', '.xml', '.html', '.css', '.cpp', '.c', '.java', '.ts', '.tsx', '.jsx', '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.log', '.ini', '.env', '.sh', '.bat', '.sql', '.go', '.rs', '.php', '.rb', '.swift', '.kt'];
            return readableExts.includes(ext);
        });
        
        if (readableFiles.size > 0) {
            await handleFileRead(msg);
            return;
        }
        
        // Check for images
        const images = msg.attachments.filter(a => 
            a.contentType && a.contentType.startsWith('image/')
        );
        
        if (images.size > 0) {
            await handleImageAnalysis(msg);
            return;
        }
    }
    
    // ===== AUTO IMAGE DETECTION =====
    if (msg.attachments.size > 0 && !hasCommand) {
        const images = msg.attachments.filter(a => 
            a.contentType && a.contentType.startsWith('image/')
        );
        
        const imageKeywords = ['analisis', 'analyze', 'jelaskan', 'explain', 'apa ini', 'what is', 'describe', 'lihat', 'look', 'cek', 'check', 'baca', 'read'];
        const hasImageKeyword = imageKeywords.some(k => content.toLowerCase().includes(k));
        
        if (images.size > 0 && (hasMention || hasImageKeyword)) {
            await handleImageAnalysis(msg);
            return;
        }
    }
    
    // ===== MENTION HANDLER =====
    if (hasMention && !hasCommand) {
        const cleanQuery = content.replace(/<@!?\d+>/g, '').trim();
        if (cleanQuery.length > 0) {
            await handleAI(msg, cleanQuery);
        } else {
            const greetings = [
                '👋 Hai! Aku Aria, asisten AI-mu. Ada yang bisa kubantu?',
                '✨ Halo! Aku Aria. Mau tanya apa hari ini?',
                '🌟 Hey! Aria di sini. Silakan tanya apapun!',
                '💫 Hai! Aku Aria, siap membantu. Apa yang ingin kamu ketahui?'
            ];
            await msg.reply(greetings[Math.floor(Math.random() * greetings.length)]);
        }
        return;
    }

    // ===== COMMAND HANDLER =====
    if (!hasCommand) return;

    const args = content.slice(CONFIG.prefix.length).trim().split(/\s+/);
    const cmd = args.shift()?.toLowerCase();

    switch (cmd) {
        // ==================== AI COMMANDS ====================
        case 'ai':
        case 'chat':
        case 'ask':
        case 'tanya':
        case 'a':
            if (!args.length) return msg.reply('❓ Contoh: `.ai Apa itu machine learning?`');
            await handleAI(msg, args.join(' '));
            break;

        case 'search':
        case 'cari':
        case 's':
            await handleSearchCommand(msg, args.join(' '));
            break;

        case 'think':
        case 'reason':
        case 'pikir':
            if (!args.length) return msg.reply('❓ Contoh: `.think Bagaimana cara kerja AI?`');
            await handleThinkingAI(msg, args.join(' '));
            break;

        case 'analyze':
        case 'analisis':
            if (msg.attachments.size > 0) {
                const images = msg.attachments.filter(a => a.contentType?.startsWith('image/'));
                if (images.size > 0) {
                    await handleImageAnalysis(msg);
                } else {
                    await handleFileRead(msg);
                }
            } else {
                await msg.reply('❓ Upload file atau gambar untuk dianalisis\nContoh: Upload gambar lalu ketik `.analyze`');
            }
            break;

        case 'read':
        case 'baca':
            if (msg.attachments.size > 0) {
                await handleFileRead(msg);
            } else if (args.length > 0 && args[0].startsWith('http')) {
                await handleURLAuto(msg, [args[0]], args.slice(1).join(' ') || 'Jelaskan konten URL ini');
            } else {
                await msg.reply('❓ Upload file atau berikan URL\nContoh: `.read https://example.com`');
            }
            break;

        case 'url':
        case 'link':
        case 'web':
            if (args.length === 0) return msg.reply('❓ Contoh: `.url https://github.com/user/repo`');
            const targetUrl = args[0];
            const urlQuery = args.slice(1).join(' ') || 'Jelaskan konten dari URL ini secara detail';
            await handleURLAuto(msg, [targetUrl], urlQuery);
            break;

        case 'summarize':
        case 'ringkas':
        case 'summary':
            if (msg.attachments.size > 0) {
                await handleFileSummary(msg);
            } else if (args.length > 0 && args[0].startsWith('http')) {
                await handleURLSummary(msg, args[0]);
            } else {
                await msg.reply('❓ Upload file atau berikan URL untuk diringkas');
            }
            break;

        // ==================== VOICE COMMANDS ====================
        case 'join':
        case 'connect':
        case 'masuk':
            const joinResult = await joinUserVoiceChannel(msg.member, msg.guild);
            if (joinResult.success) {
                if (joinResult.alreadyConnected) {
                    await msg.reply(`✅ Sudah terhubung di **${joinResult.channel.name}**`);
                } else {
                    await msg.reply(`🔊 Bergabung ke **${joinResult.channel.name}**`);
                }
            } else {
                await msg.reply(`❌ ${joinResult.error}`);
            }
            break;

        case 'leave':
        case 'disconnect':
        case 'dc':
        case 'keluar':
            if (await leaveVoiceChannel(msg.guild)) {
                await msg.reply('👋 Keluar dari voice channel');
            } else {
                await msg.reply('❌ Tidak ada di voice channel');
            }
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
                    queueData.queue.forEach(item => cleanupFile(item.file));
                    queueData.queue = [];
                    if (queueData.currentFile) {
                        cleanupFile(queueData.currentFile);
                        queueData.currentFile = null;
                    }
                }
                await msg.reply('⏹️ Audio dihentikan');
            } else {
                await msg.reply('❌ Tidak ada audio yang sedang diputar');
            }
            break;

        case 'skip':
            const skipPlayer = audioPlayers.get(msg.guild.id);
            if (skipPlayer) {
                skipPlayer.stop();
                await msg.reply('⏭️ Skipped');
            }
            break;

        // ==================== CONVERSATION COMMANDS ====================
        case 'clear':
        case 'reset':
        case 'new':
        case 'baru':
            clearConversation(msg.guild.id, msg.author.id);
            await msg.reply('🗑️ Percakapan dihapus. Memulai sesi baru!');
            break;

        case 'history':
        case 'riwayat':
            const conv = getConversation(msg.guild.id, msg.author.id);
            if (conv.messages.length === 0) {
                await msg.reply('📭 Belum ada riwayat percakapan');
            } else {
                const historyEmbed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('📜 Riwayat Percakapan')
                    .setDescription(`Total: ${conv.messages.length} pesan`)
                    .addFields(
                        conv.messages.slice(-5).map((m, i) => ({
                            name: m.role === 'user' ? '👤 Kamu' : '🤖 Aria',
                            value: m.content.slice(0, 200) + (m.content.length > 200 ? '...' : ''),
                            inline: false
                        }))
                    )
                    .setFooter({ text: 'Menampilkan 5 pesan terakhir' });
                await msg.reply({ embeds: [historyEmbed] });
            }
            break;

        case 'clearall':
            if (!isAdmin(msg.author.id)) return msg.reply('❌ Hanya admin yang bisa menggunakan perintah ini');
            let cleared = 0;
            for (const [key] of conversations) {
                if (key.startsWith(msg.guild.id)) {
                    conversations.delete(key);
                    cleared++;
                }
            }
            await msg.reply(`🗑️ Menghapus ${cleared} percakapan di server ini`);
            break;

        // ==================== SETTINGS COMMANDS ====================
        case 'settings':
        case 'set':
        case 'config':
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

        case 'model':
        case 'info':
            const settings = getSettings(msg.guild.id);
            const aiInfo = AI_PROVIDERS[settings.aiProvider];
            const modelInfo = aiInfo?.models.find(m => m.id === settings.aiModel);
            
            const infoEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🧠 Model AI Aktif')
                .addFields(
                    { name: 'Provider', value: aiInfo?.name || settings.aiProvider, inline: true },
                    { name: 'Model', value: modelInfo?.name || settings.aiModel, inline: true },
                    { name: 'Voice', value: settings.ttsVoice.split('-').pop().replace('Neural', ''), inline: true },
                    { name: 'Search', value: settings.searchEnabled ? '✅ Aktif' : '❌ Nonaktif', inline: true },
                    { name: 'Grounding', value: settings.geminiGrounding ? '✅ Aktif' : '❌ Nonaktif', inline: true }
                );
            await msg.reply({ embeds: [infoEmbed] });
            break;

        case 'setmodel':
            if (!isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
            if (args.length < 2) return msg.reply('❓ `.setmodel <provider> <model>`\nProviders: gemini, groq, openrouter, huggingface, pollinations_free');
            const [newProvider, ...modelParts] = args;
            const newModel = modelParts.join(' ');
            if (!AI_PROVIDERS[newProvider]) return msg.reply(`❌ Provider tidak ditemukan: ${newProvider}`);
            updateSettings(msg.guild.id, 'aiProvider', newProvider);
            if (newModel) {
                const foundModel = AI_PROVIDERS[newProvider].models.find(m => 
                    m.id.toLowerCase().includes(newModel.toLowerCase()) || 
                    m.name.toLowerCase().includes(newModel.toLowerCase())
                );
                if (foundModel) {
                    updateSettings(msg.guild.id, 'aiModel', foundModel.id);
                    await msg.reply(`✅ Model diubah ke **${AI_PROVIDERS[newProvider].name}** - ${foundModel.name}`);
                } else {
                    updateSettings(msg.guild.id, 'aiModel', AI_PROVIDERS[newProvider].models[0].id);
                    await msg.reply(`✅ Provider diubah ke **${AI_PROVIDERS[newProvider].name}** (model default)`);
                }
            }
            break;

        // ==================== ADMIN COMMANDS ====================
        case 'dm':
        case 'dynamic':
        case 'keys':
            if (!isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
            const dmEmbed = manager.createStatusEmbed();
            const dmComponents = manager.createManagementUI();
            await msg.reply({ embeds: [dmEmbed], components: dmComponents });
            break;

        case 'addkey':
            if (!isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
            if (args.length < 2) return msg.reply('❓ `.addkey <provider> <key>`\nProviders: gemini, groq, openrouter, huggingface, pollinations_api, tavily, serper');
            const [keyProvider, apiKey] = args;
            try {
                await manager.addKey(keyProvider, apiKey);
                await msg.reply(`✅ Key untuk **${keyProvider}** berhasil ditambahkan`);
                try { await msg.delete(); } catch {} // Delete for security
            } catch (e) {
                await msg.reply(`❌ ${e.message}`);
            }
            break;

        case 'removekey':
            if (!isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
            if (args.length < 2) return msg.reply('❓ `.removekey <provider> <index>`');
            try {
                await manager.removeKey(args[0], parseInt(args[1]) - 1);
                await msg.reply(`✅ Key berhasil dihapus`);
            } catch (e) {
                await msg.reply(`❌ ${e.message}`);
            }
            break;

        case 'status':
        case 'stats':
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = uptime % 60;
            
            const statusEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('📊 Status Bot')
                .setThumbnail(client.user.displayAvatarURL())
                .addFields(
                    { name: '⏱️ Uptime', value: `${hours}h ${minutes}m ${seconds}s`, inline: true },
                    { name: '🏠 Servers', value: `${client.guilds.cache.size}`, inline: true },
                    { name: '👥 Users', value: `${client.users.cache.size}`, inline: true },
                    { name: '💬 Conversations', value: `${conversations.size}`, inline: true },
                    { name: '🔊 Voice', value: `${voiceConnections.size}`, inline: true },
                    { name: '🧠 Memory', value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, inline: true },
                    { name: '📡 Ping', value: `${Math.round(client.ws.ping)}ms`, inline: true },
                    { name: '🤖 Version', value: 'v3.0.0', inline: true }
                )
                .setTimestamp();
            await msg.reply({ embeds: [statusEmbed] });
            break;

        case 'ping':
        case 'p':
            const start = Date.now();
            const pingMsg = await msg.reply('🏓 Pinging...');
            const latency = Date.now() - start;
            await pingMsg.edit(`🏓 Pong!\n> Bot: \`${latency}ms\`\n> API: \`${Math.round(client.ws.ping)}ms\``);
            break;

        case 'eval':
            if (!isAdmin(msg.author.id)) return;
            if (!args.length) return;
            try {
                const code = args.join(' ');
                let result = eval(code);
                if (result instanceof Promise) result = await result;
                if (typeof result !== 'string') result = require('util').inspect(result, { depth: 2 });
                await msg.reply(`\`\`\`js\n${result.slice(0, 1900)}\n\`\`\``);
            } catch (e) {
                await msg.reply(`❌ \`\`\`js\n${e.message}\n\`\`\``);
            }
            break;

        // ==================== HELP COMMAND ====================
        case 'help':
        case 'h':
        case 'commands':
        case 'bantuan':
            const helpEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🌟 Aria - AI Assistant')
                .setDescription('Asisten AI premium dengan fitur lengkap: chat, voice, search, file reading, dan image analysis.')
                .setThumbnail(client.user.displayAvatarURL())
                .addFields(
                    { 
                        name: '💬 Chat & AI', 
                        value: [
                            '`.ai <pesan>` - Chat dengan AI',
                            '`.search <query>` - Cari & analisis info terkini',
                            '`.think <pertanyaan>` - Mode reasoning mendalam',
                            '`@Aria <pesan>` - Mention untuk chat'
                        ].join('\n'),
                        inline: false 
                    },
                    { 
                        name: '📄 File & URL', 
                        value: [
                            '`.read <url>` - Baca & analisis URL/website',
                            '`.analyze` + file - Analisis file dokumen',
                            '`.analyze` + gambar - Analisis gambar',
                            '`.summarize` + file/url - Ringkas konten'
                        ].join('\n'),
                        inline: false 
                    },
                    { 
                        name: '🔊 Voice & TTS', 
                        value: [
                            '`.join` - Masuk voice channel',
                            '`.leave` - Keluar voice channel',
                            '`.speak <teks>` - Text to speech',
                            '`.stop` - Hentikan audio'
                        ].join('\n'),
                        inline: false 
                    },
                    { 
                        name: '⚙️ Pengaturan', 
                        value: [
                            '`.settings` - Panel pengaturan (Admin)',
                            '`.model` - Lihat model aktif',
                            '`.status` - Status bot',
                            '`.clear` - Hapus riwayat chat'
                        ].join('\n'),
                        inline: false 
                    },
                    {
                        name: '💡 Tips',
                        value: [
                            '• Upload file/gambar lalu mention @Aria untuk auto-analyze',
                            '• Kirim URL dengan pertanyaan untuk auto-read',
                            '• Di voice channel, respons AI otomatis dibacakan'
                        ].join('\n'),
                        inline: false
                    }
                )
                .setFooter({ text: 'v3.0.0 • Complete Edition • Made with ❤️' })
                .setTimestamp();
            await msg.reply({ embeds: [helpEmbed] });
            break;

        // ==================== DEFAULT - DIRECT AI ====================
        default:
            if (cmd && cmd.length > 2 && !cmd.startsWith('.')) {
                await handleAI(msg, content.slice(CONFIG.prefix.length));
            }
    }
});

// ==================== ADDITIONAL HANDLERS ====================

async function handleThinkingAI(msg, query) {
    const rateCheck = checkRateLimit(msg.author.id);
    if (!rateCheck.allowed) return msg.reply(`⏳ Tunggu ${rateCheck.waitTime} detik`);

    const statusMsg = await msg.reply('💭 Sedang berpikir mendalam...');
    
    try {
        const thinkingPrompt = `${SYSTEM_PROMPT}

[THINKING MODE]
Kamu diminta untuk berpikir step-by-step secara mendalam sebelum memberikan jawaban.

Format respons:
[THINKING]
1. Analisis pertanyaan...
2. Pertimbangkan berbagai sudut pandang...
3. Evaluasi informasi yang relevan...
4. Simpulkan...
[/THINKING]

[ANSWER]
Jawaban final yang komprehensif...
[/ANSWER]

Pertanyaan: ${query}`;

        const response = await callAI(msg.guild.id, msg.author.id, thinkingPrompt, false);
        const { thinking, answer } = parseThinkingResponse(response.text);
        
        let finalResponse = '';
        
        if (thinking && thinking.length > 20) {
            finalResponse = `||💭 **Proses Berpikir:**\n${thinking.slice(0, 1500)}||\n\n`;
        }
        
        finalResponse += `✨ **Jawaban:**\n${answer || response.text}`;
        finalResponse += `\n\n-# ${response.model} • ${response.latency}ms 💭`;
        
        const parts = splitMessage(finalResponse);
        await statusMsg.edit(parts[0]);
        
        for (let i = 1; i < parts.length; i++) {
            await msg.channel.send(parts[i]);
        }
        
    } catch (e) {
        await statusMsg.edit(`❌ ${e.message}`);
    }
}

async function handleFileSummary(msg) {
    if (msg.attachments.size === 0) {
        return msg.reply('❓ Upload file yang ingin diringkas');
    }
    
    const attachment = msg.attachments.first();
    
    if (attachment.size > CONFIG.maxFileSize) {
        return msg.reply(`❌ File terlalu besar (max ${CONFIG.maxFileSize / 1024 / 1024}MB)`);
    }
    
    const statusMsg = await msg.reply('📄 Membaca file...');
    
    try {
        const content = await readFile(attachment);
        
        if (!content || content.length < 10) {
            return statusMsg.edit('❌ Tidak dapat membaca konten file');
        }
        
        await statusMsg.edit('✍️ Membuat ringkasan...');
        
        const prompt = `Buatkan ringkasan yang komprehensif dari dokumen berikut. Sertakan poin-poin penting.

File: ${attachment.name}
Konten:
${content.slice(0, 10000)}

Buat ringkasan dalam format:
## Ringkasan
[Ringkasan utama dalam 2-3 paragraf]

## Poin-Poin Penting
- [Poin 1]
- [Poin 2]
- [dst]

## Kesimpulan
[Kesimpulan singkat]`;
        
        const response = await callAI(msg.guild.id, msg.author.id, prompt, false);
        
        let finalMsg = `📄 **Ringkasan: ${attachment.name}**\n\n${response.text}\n\n-# ${response.model} • ${response.latency}ms`;
        
        const parts = splitMessage(finalMsg);
        await statusMsg.edit(parts[0]);
        
        for (let i = 1; i < parts.length; i++) {
            await msg.channel.send(parts[i]);
        }
        
    } catch (e) {
        await statusMsg.edit(`❌ ${e.message}`);
    }
}

async function handleURLSummary(msg, url) {
    const statusMsg = await msg.reply('🔗 Membaca URL...');
    
    try {
        let content;
        if (url.includes('github.com') && url.includes('/blob/')) {
            content = await readGitHubFile(url);
        } else {
            content = await fetchURLClean(url);
        }
        
        if (!content || content.length < 100) {
            return statusMsg.edit('❌ Tidak dapat membaca konten URL');
        }
        
        await statusMsg.edit('✍️ Membuat ringkasan...');
        
        const domain = new URL(url).hostname;
        const prompt = `Buatkan ringkasan yang komprehensif dari halaman web berikut.

URL: ${url}
Konten:
${content.slice(0, 10000)}

Buat ringkasan dalam format:
## Ringkasan
[Ringkasan utama]

## Poin-Poin Penting
- [Poin 1]
- [Poin 2]
- [dst]`;
        
        const response = await callAI(msg.guild.id, msg.author.id, prompt, false);
        
        let finalMsg = `🔗 **Ringkasan: ${domain}**\n\n${response.text}\n\n📎 ${url}\n\n-# ${response.model} • ${response.latency}ms`;
        
        const parts = splitMessage(finalMsg);
        await statusMsg.edit(parts[0]);
        
        for (let i = 1; i < parts.length; i++) {
            await msg.channel.send(parts[i]);
        }
        
    } catch (e) {
        await statusMsg.edit(`❌ ${e.message}`);
    }
}

// ==================== VOICE STATE UPDATE ====================

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    // Handle bot disconnect
    if (oldState.member?.id === client.user?.id && !newState.channelId) {
        leaveVoiceChannel(oldState.guild.id);
        console.log(`🔊 Disconnected from voice in ${oldState.guild.name}`);
    }
    
    // Auto-leave if alone in voice channel
    if (oldState.channelId && !newState.channelId) {
        const connection = voiceConnections.get(oldState.guild.id);
        if (connection && connection.joinConfig.channelId === oldState.channelId) {
            const channel = oldState.guild.channels.cache.get(oldState.channelId);
            if (channel) {
                const members = channel.members.filter(m => !m.user.bot);
                if (members.size === 0) {
                    console.log(`🔊 Auto-leaving empty voice channel in ${oldState.guild.name}`);
                    setTimeout(() => {
                        const ch = oldState.guild.channels.cache.get(oldState.channelId);
                        if (ch) {
                            const currentMembers = ch.members.filter(m => !m.user.bot);
                            if (currentMembers.size === 0) {
                                leaveVoiceChannel(oldState.guild.id);
                            }
                        }
                    }, CONFIG.voiceInactivityTimeout || 60000);
                }
            }
        }
    }
});

// ==================== READY EVENT ====================

client.once(Events.ClientReady, async () => {
    console.log('═'.repeat(50));
    console.log(`✅ Bot ready: ${client.user.tag}`);
    console.log(`📊 Serving ${client.guilds.cache.size} guilds`);
    console.log(`👥 Watching ${client.users.cache.size} users`);
    console.log('═'.repeat(50));
    
    // Set rotating activity
    const activities = [
        { name: '.help untuk bantuan', type: ActivityType.Playing },
        { name: 'AI conversations', type: ActivityType.Listening },
        { name: `${client.guilds.cache.size} servers`, type: ActivityType.Watching },
        { name: 'your questions', type: ActivityType.Listening }
    ];
    
    let activityIndex = 0;
    client.user.setActivity(activities[0].name, { type: activities[0].type });
    
    setInterval(() => {
        activityIndex = (activityIndex + 1) % activities.length;
        client.user.setActivity(activities[activityIndex].name, { type: activities[activityIndex].type });
    }, 30000);
    
    // Initialize manager
    await manager.initialize();
    
    // Ensure temp directory
    ensureTempDir();
    
    // Log configuration
    console.log('\n📋 Configuration:');
    console.log(`   • Prefix: ${CONFIG.prefix}`);
    console.log(`   • AI Providers: ${Object.keys(AI_PROVIDERS).join(', ')}`);
    console.log(`   • TTS Voices: ${TTS_VOICES.length}`);
    console.log(`   • Search: ${CONFIG.tavilyApiKey ? 'Tavily ✓' : 'Tavily ✗'} ${CONFIG.serperApiKey ? 'Serper ✓' : 'Serper ✗'}`);
    console.log(`   • Gemini: ${CONFIG.geminiApiKey ? '✓' : '✗'}`);
    console.log(`   • Groq: ${CONFIG.groqApiKey ? '✓' : '✗'}`);
    console.log('═'.repeat(50));
});

// ==================== ERROR HANDLING ====================

client.on(Events.Error, error => {
    console.error('❌ Client Error:', error);
});

client.on(Events.Warn, warn => {
    console.warn('⚠️ Client Warning:', warn);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', error => {
    console.error('❌ Uncaught Exception:', error);
    // Don't exit, try to recover
});

// Graceful shutdown
const shutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    
    // Leave all voice channels
    for (const [guildId] of voiceConnections) {
        try {
            await leaveVoiceChannel(guildId);
        } catch {}
    }
    
    // Cleanup temp files
    try {
        if (fs.existsSync(CONFIG.tempPath)) {
            const files = fs.readdirSync(CONFIG.tempPath);
            for (const file of files) {
                try {
                    fs.unlinkSync(path.join(CONFIG.tempPath, file));
                } catch {}
            }
        }
    } catch {}
    
    // Close Redis connection
    if (manager.redis) {
        try {
            await manager.redis.quit();
        } catch {}
    }
    
    // Destroy client
    client.destroy();
    
    console.log('👋 Goodbye!');
    process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ==================== LOGIN ====================

if (!CONFIG.token) {
    console.error('❌ DISCORD_TOKEN tidak ditemukan di environment variables!');
    console.error('   Pastikan file .env sudah dikonfigurasi dengan benar.');
    process.exit(1);
}

client.login(CONFIG.token).catch(err => {
    console.error('❌ Gagal login:', err.message);
    process.exit(1);
});
