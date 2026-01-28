// ============================================================
//         DISCORD AI BOT v2.14.0 - FULL VERSION
//         Gemini Grounding + All Providers + Voice
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
    AttachmentBuilder,
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

// ==================== HEALTH SERVER ====================

const startTime = Date.now();

const healthServer = createServer((req, res) => {
    const status = {
        status: 'ok',
        bot: client?.user?.tag || 'starting...',
        version: '2.14.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        guilds: client?.guilds?.cache?.size || 0,
        conversations: conversations?.size || 0,
        activeVoice: voiceConnections?.size || 0,
        features: ['gemini-grounding', 'tavily', 'serper', 'pollinations', 'groq', 'openrouter', 'tts']
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
    dataPath: './data/settings.json',
    tempPath: './temp',
    // API Keys
    tavilyApiKey: process.env.TAVILY_API_KEY,
    serperApiKey: process.env.SERPER_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    groqApiKey: process.env.GROQ_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
    pollinationsApiKey: process.env.POLLINATIONS_API_KEY,
    // TTS Settings
    ttsMaxChunkLength: 1000,
    ttsMaxTotalLength: 10000,
    ttsMinChunkLength: 50,
    ttsConcatTimeout: 120000,
    ttsGenerateTimeout: 60000,
    // Voice Settings
    voiceInactivityTimeout: 300000,
    // Memory Settings
    maxConversationMessages: 100,
    maxConversationAge: 7200000,
    // Rate Limiting
    rateLimitWindow: 60000,
    rateLimitMax: 30
};

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
        return { allowed: false, waitTime: Math.ceil((userLimit.resetAt - now) / 1000), remaining: 0 };
    }
    
    userLimit.count++;
    return { allowed: true, remaining: CONFIG.rateLimitMax - userLimit.count };
}

setInterval(() => {
    const now = Date.now();
    for (const [userId, limit] of rateLimits) {
        if (now > limit.resetAt) rateLimits.delete(userId);
    }
}, 60000);

// ==================== SEARCH SYSTEM ====================

const SEARCH_TRIGGERS = [
    'berita', 'news', 'kabar', 'terbaru', 'hari ini', 'sekarang',
    'latest', 'current', 'today', 'recent', 'update', 'kemarin',
    'siapa presiden', 'siapa menteri', 'harga', 'kurs', 'cuaca',
    'jadwal', 'skor', 'hasil', 'pertandingan', 'match', 'score',
    'trending', 'viral', 'populer', 'terkini', 'breaking',
    'what is happening', 'what happened', 'who won', 'who is',
    'kapan', 'dimana', 'when', 'where', 'how much', 'berapa',
    '2024', '2025', '2026', '2027'
];

function shouldSearch(message) {
    const lower = message.toLowerCase();
    return SEARCH_TRIGGERS.some(trigger => lower.includes(trigger));
}

function getCurrentDateTime() {
    const now = new Date();
    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta'
    };
    return now.toLocaleDateString('id-ID', options) + ' WIB';
}

// ==================== TAVILY SEARCH ====================

async function searchTavily(query, options = {}) {
    if (!CONFIG.tavilyApiKey) return null;

    const searchParams = {
        api_key: CONFIG.tavilyApiKey,
        query: query,
        search_depth: options.depth || 'basic',
        include_answer: true,
        include_raw_content: false,
        max_results: options.maxResults || 5
    };

    return new Promise((resolve) => {
        const postData = JSON.stringify(searchParams);

        const req = https.request({
            hostname: 'api.tavily.com',
            path: '/search',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 15000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode === 200) {
                        resolve(JSON.parse(data));
                    } else {
                        console.log('Tavily error:', res.statusCode);
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => { console.log('Tavily error:', e.message); resolve(null); });
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(postData);
        req.end();
    });
}

// ==================== SERPER SEARCH ====================

async function searchSerper(query, options = {}) {
    if (!CONFIG.serperApiKey) return null;

    const searchParams = {
        q: query,
        gl: options.country || 'id',
        hl: options.language || 'id',
        num: options.maxResults || 5,
        autocorrect: true
    };

    return new Promise((resolve) => {
        const postData = JSON.stringify(searchParams);

        const req = https.request({
            hostname: 'google.serper.dev',
            path: '/search',
            method: 'POST',
            headers: {
                'X-API-KEY': CONFIG.serperApiKey,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 15000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode === 200) {
                        resolve(JSON.parse(data));
                    } else {
                        console.log('Serper error:', res.statusCode);
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => { console.log('Serper error:', e.message); resolve(null); });
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(postData);
        req.end();
    });
}

// ==================== COMBINED SEARCH ====================

async function performSearch(query, searchProvider = 'auto') {
    const dateTime = getCurrentDateTime();
    let searchData = {
        timestamp: dateTime,
        answer: null,
        facts: [],
        source: null
    };

    const useSerper = (searchProvider === 'serper' || searchProvider === 'auto') && CONFIG.serperApiKey;
    const useTavily = (searchProvider === 'tavily' || searchProvider === 'auto') && CONFIG.tavilyApiKey;

    if (useSerper && (searchProvider === 'serper' || searchProvider === 'auto')) {
        console.log('🔍 Searching with Serper...');
        const serperResult = await searchSerper(query);

        if (serperResult) {
            searchData.source = 'serper';

            if (serperResult.answerBox) {
                searchData.answer = serperResult.answerBox.answer || 
                                   serperResult.answerBox.snippet ||
                                   serperResult.answerBox.title;
            }

            if (serperResult.organic && serperResult.organic.length > 0) {
                serperResult.organic.slice(0, 4).forEach(item => {
                    if (item.snippet) {
                        searchData.facts.push(item.snippet);
                    }
                });
            }

            if (serperResult.knowledgeGraph) {
                const kg = serperResult.knowledgeGraph;
                if (kg.description) {
                    searchData.facts.unshift(kg.description);
                }
            }

            if (searchData.answer || searchData.facts.length > 0) {
                console.log('✅ Serper found results');
                return searchData;
            }
        }
    }

    if (useTavily && (searchProvider === 'tavily' || (searchProvider === 'auto' && searchData.facts.length === 0))) {
        console.log('🔍 Searching with Tavily...');
        const tavilyResult = await searchTavily(query);

        if (tavilyResult) {
            searchData.source = 'tavily';

            if (tavilyResult.answer) {
                searchData.answer = tavilyResult.answer;
            }

            if (tavilyResult.results && tavilyResult.results.length > 0) {
                tavilyResult.results.slice(0, 4).forEach(item => {
                    if (item.content) {
                        searchData.facts.push(item.content.slice(0, 300));
                    }
                });
            }

            if (searchData.answer || searchData.facts.length > 0) {
                console.log('✅ Tavily found results');
                return searchData;
            }
        }
    }

    return null;
}

function formatSearchForAI(searchData) {
    if (!searchData) return '';

    let context = `\n\n[INFORMASI TERKINI - ${searchData.timestamp}]\n`;

    if (searchData.answer) {
        context += `Jawaban langsung: ${searchData.answer}\n`;
    }

    if (searchData.facts.length > 0) {
        context += `Fakta terkait:\n`;
        searchData.facts.forEach((fact) => {
            context += `- ${fact}\n`;
        });
    }

    context += `\nGunakan informasi di atas untuk menjawab dengan natural. `;
    context += `Jangan sebutkan "menurut sumber" atau baca URL. `;
    context += `Jawab seolah kamu yang tahu informasinya.`;

    return context;
}

function formatSearchForDisplay(searchData, query) {
    if (!searchData) return null;

    let display = `🔍 **Hasil pencarian:** "${query}"\n`;
    display += `📅 *${searchData.timestamp}*\n`;
    display += `🔎 *Source: ${searchData.source}*\n\n`;

    if (searchData.answer) {
        display += `**Jawaban:**\n${searchData.answer}\n\n`;
    }

    if (searchData.facts.length > 0) {
        display += `**Info terkait:**\n`;
        searchData.facts.slice(0, 3).forEach((fact, i) => {
            display += `${i + 1}. ${fact.slice(0, 200)}...\n\n`;
        });
    }

    return display;
}

// ==================== SYSTEM PROMPT ====================

const MASTER_SYSTEM_PROMPT = `Kamu adalah Aria, asisten AI yang cerdas, friendly, dan helpful.

## KEPRIBADIAN:
- Bijaksana dan berpengetahuan luas
- Jujur - jangan mengarang fakta
- Friendly tapi profesional
- Bisa serius dan bisa santai

## GAYA BICARA:
- Bahasa Indonesia natural dan mengalir
- Jawaban lengkap tapi tidak bertele-tele
- Boleh pakai emoji secukupnya
- Untuk voice: jawab ringkas 2-4 kalimat

## ATURAN PENTING SAAT MENJAWAB DENGAN INFO DARI INTERNET:
1. JANGAN katakan "menurut sumber" atau "berdasarkan pencarian"
2. JANGAN baca URL atau link apapun
3. JANGAN sebutkan nama website sumber
4. Jawab NATURAL seolah kamu yang tahu informasinya
5. Jika ditanya kapan dapat info, sebutkan waktu yang diberikan
6. Sampaikan informasi dengan gaya percakapan biasa`;

// ==================== POLLINATIONS MODELS ====================

const POLLINATIONS_MODELS = [
    // OpenAI Models
    { id: 'openai', name: 'OpenAI GPT', version: 'GPT-5-nano', category: 'openai' },
    { id: 'openai-fast', name: 'OpenAI Fast', version: 'GPT-5-fast', category: 'openai' },
    { id: 'openai-large', name: 'OpenAI Large', version: 'GPT-5-large', category: 'openai' },
    { id: 'openai-reasoning', name: 'OpenAI Reasoning', version: 'o3-mini', category: 'openai' },
    { id: 'openai-audio', name: 'OpenAI Audio', version: 'GPT-4o-audio', category: 'voice' },
    // Claude Models
    { id: 'claude', name: 'Claude', version: 'Claude-3.5', category: 'claude' },
    { id: 'claude-fast', name: 'Claude Fast', version: 'Claude-fast', category: 'claude' },
    { id: 'claude-large', name: 'Claude Large', version: 'Claude-large', category: 'claude' },
    { id: 'claude-haiku', name: 'Claude Haiku', version: 'Haiku-4.5', category: 'claude' },
    { id: 'claude-sonnet', name: 'Claude Sonnet', version: 'Sonnet-4.5', category: 'claude' },
    { id: 'claude-opus', name: 'Claude Opus', version: 'Opus-4.5', category: 'claude' },
    // Gemini Models
    { id: 'gemini', name: 'Gemini', version: 'Gemini-3-Flash', category: 'gemini' },
    { id: 'gemini-fast', name: 'Gemini Fast', version: 'Gemini-fast', category: 'gemini' },
    { id: 'gemini-large', name: 'Gemini Large', version: 'Gemini-large', category: 'gemini' },
    { id: 'gemini-search', name: 'Gemini Search', version: 'Gemini-search', category: 'gemini' },
    { id: 'gemini-legacy', name: 'Gemini Legacy', version: 'Gemini-2.5', category: 'gemini' },
    { id: 'gemini-thinking', name: 'Gemini Thinking', version: 'Thinking', category: 'gemini' },
    // DeepSeek Models
    { id: 'deepseek', name: 'DeepSeek', version: 'V3', category: 'deepseek' },
    { id: 'deepseek-v3', name: 'DeepSeek V3', version: 'V3-latest', category: 'deepseek' },
    { id: 'deepseek-r1', name: 'DeepSeek R1', version: 'R1', category: 'deepseek' },
    { id: 'deepseek-reasoning', name: 'DeepSeek Reasoning', version: 'R1-Reasoner', category: 'deepseek' },
    // Qwen Models
    { id: 'qwen', name: 'Qwen', version: 'Qwen3', category: 'qwen' },
    { id: 'qwen-coder', name: 'Qwen Coder', version: 'Qwen3-Coder', category: 'qwen' },
    // Llama Models
    { id: 'llama', name: 'Llama', version: 'Llama-3.3', category: 'llama' },
    { id: 'llamalight', name: 'Llama Light', version: 'Llama-70B', category: 'llama' },
    // Mistral Models
    { id: 'mistral', name: 'Mistral', version: 'Mistral-Small', category: 'mistral' },
    { id: 'mistral-small', name: 'Mistral Small', version: 'Mistral-3.2', category: 'mistral' },
    { id: 'mistral-large', name: 'Mistral Large', version: 'Mistral-Large', category: 'mistral' },
    // Perplexity Models
    { id: 'perplexity-fast', name: 'Perplexity Fast', version: 'Sonar', category: 'perplexity' },
    { id: 'perplexity-reasoning', name: 'Perplexity Reasoning', version: 'Sonar-Pro', category: 'perplexity' },
    // Chinese AI Models
    { id: 'kimi', name: 'Kimi', version: 'Kimi-K2.5', category: 'chinese' },
    { id: 'kimi-large', name: 'Kimi Large', version: 'Kimi-large', category: 'chinese' },
    { id: 'kimi-reasoning', name: 'Kimi Reasoning', version: 'Kimi-reasoning', category: 'chinese' },
    { id: 'glm', name: 'GLM', version: 'GLM-4.7', category: 'chinese' },
    { id: 'minimax', name: 'MiniMax', version: 'M2.1', category: 'chinese' },
    // Grok Models
    { id: 'grok', name: 'Grok', version: 'Grok-4', category: 'grok' },
    { id: 'grok-fast', name: 'Grok Fast', version: 'Grok-fast', category: 'grok' },
    // Amazon Nova
    { id: 'nova-fast', name: 'Nova Fast', version: 'Amazon-Nova', category: 'amazon' },
    // Microsoft Phi
    { id: 'phi', name: 'Phi', version: 'Phi-4', category: 'microsoft' },
    // Search/Tool Models
    { id: 'searchgpt', name: 'SearchGPT', version: 'v1', category: 'search' },
    // Creative/Art Models
    { id: 'midijourney', name: 'Midijourney', version: 'v1', category: 'creative' },
    { id: 'unity', name: 'Unity', version: 'v1', category: 'creative' },
    { id: 'rtist', name: 'Rtist', version: 'v1', category: 'creative' },
    // Special/Character Models
    { id: 'evil', name: 'Evil Mode', version: 'Uncensored', category: 'special' },
    { id: 'p1', name: 'P1', version: 'v1', category: 'special' },
    { id: 'hormoz', name: 'Hormoz', version: 'v1', category: 'special' },
    { id: 'sur', name: 'Sur', version: 'v1', category: 'special' },
    { id: 'bidara', name: 'Bidara', version: 'v1', category: 'special' },
    // Education/Utility Models
    { id: 'chickytutor', name: 'ChickyTutor', version: 'Education', category: 'education' },
    { id: 'nomnom', name: 'NomNom', version: 'Food', category: 'utility' }
];

// ==================== AI PROVIDERS ====================

const AI_PROVIDERS = {
    gemini: {
        name: 'Google Gemini',
        requiresKey: true,
        keyEnv: 'GEMINI_API_KEY',
        models: [
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', version: '2.5-pro', category: 'stable' },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', version: '2.5-flash', category: 'stable' },
            { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', version: '2.5-lite', category: 'stable' },
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', version: '2.0-flash', category: 'stable' },
            { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', version: '2.0-lite', category: 'stable' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', version: '1.5-pro', category: 'stable' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', version: '1.5-flash', category: 'stable' },
            { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash Preview', version: '2.5-preview', category: 'preview' },
            { id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro Preview', version: '2.5-pro-preview', category: 'preview' }
        ]
    },

    groq: {
        name: 'Groq',
        requiresKey: true,
        keyEnv: 'GROQ_API_KEY',
        models: [
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', version: 'v3.3', category: 'production' },
            { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', version: 'v3.1', category: 'production' },
            { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', version: '120B', category: 'production' },
            { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', version: '20B', category: 'production' },
            { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', version: '8x7B', category: 'production' },
            { id: 'gemma2-9b-it', name: 'Gemma 2 9B', version: '9B', category: 'production' },
            { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick', version: '17B-128E', category: 'preview' },
            { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', version: '17B-16E', category: 'preview' },
            { id: 'moonshotai/kimi-k2-instruct-0905', name: 'Kimi K2', version: 'K2', category: 'preview' },
            { id: 'qwen/qwen-3-32b', name: 'Qwen 3 32B', version: '32B', category: 'preview' },
            { id: 'llama-3-groq-70b-tool-use', name: 'Llama 3 70B Tool', version: '70B-tool', category: 'tool' },
            { id: 'llama-3-groq-8b-tool-use', name: 'Llama 3 8B Tool', version: '8B-tool', category: 'tool' },
            { id: 'whisper-large-v3', name: 'Whisper Large V3', version: 'v3', category: 'stt' },
            { id: 'whisper-large-v3-turbo', name: 'Whisper V3 Turbo', version: 'v3-turbo', category: 'stt' }
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
        keyEnv: 'POLLINATIONS_API_KEY',
        models: POLLINATIONS_MODELS
    },

    openrouter: {
        name: 'OpenRouter',
        requiresKey: true,
        keyEnv: 'OPENROUTER_API_KEY',
        models: [
            { id: 'google/gemini-2.5-flash-preview:free', name: 'Gemini 2.5 Flash', version: '2.5-flash', category: 'google' },
            { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', version: '2.0-flash', category: 'google' },
            { id: 'thudm/glm-4-air:free', name: 'GLM-4.5 Air', version: 'GLM-4.5', category: 'thudm' },
            { id: 'meta-llama/llama-4-maverick:free', name: 'Llama 4 Maverick', version: 'Maverick', category: 'meta' },
            { id: 'meta-llama/llama-4-scout:free', name: 'Llama 4 Scout', version: 'Scout', category: 'meta' },
            { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', version: '70B', category: 'meta' },
            { id: 'moonshotai/kimi-vl-a3b-thinking:free', name: 'Kimi VL Thinking', version: 'VL-A3B', category: 'moonshot' },
            { id: 'nvidia/llama-3.1-nemotron-nano-8b-v1:free', name: 'Nemotron Nano 8B', version: '8B', category: 'nvidia' },
            { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 24B', version: '24B', category: 'mistral' },
            { id: 'openrouter/optimus-alpha', name: 'Optimus Alpha', version: 'Alpha', category: 'openrouter' },
            { id: 'openrouter/quasar-alpha', name: 'Quasar Alpha', version: 'Alpha', category: 'openrouter' },
            { id: 'deepseek/deepseek-v3-base:free', name: 'DeepSeek V3 Base', version: 'V3-base', category: 'deepseek' },
            { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek Chat V3', version: 'V3-chat', category: 'deepseek' },
            { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', version: 'R1', category: 'deepseek' },
            { id: 'deepseek/deepseek-r1-zero:free', name: 'DeepSeek R1 Zero', version: 'R1-zero', category: 'deepseek' },
            { id: 'qwen/qwen2.5-vl-3b-instruct:free', name: 'Qwen 2.5 VL 3B', version: 'VL-3B', category: 'qwen' },
            { id: 'qwen/qwen3-32b:free', name: 'Qwen3 32B', version: '32B', category: 'qwen' },
            { id: 'nousresearch/deephermes-3-llama-3-8b-preview:free', name: 'DeepHermes 3 8B', version: '8B', category: 'nous' },
            { id: 'allenai/olmo-3.1-32b-think:free', name: 'OLMo 3.1 32B', version: '32B', category: 'allenai' },
            { id: 'amazon/nova-micro-v1', name: 'Nova Micro', version: 'Micro', category: 'amazon' },
            { id: 'amazon/nova-lite-v1', name: 'Nova Lite', version: 'Lite', category: 'amazon' },
            { id: 'amazon/nova-pro-v1', name: 'Nova Pro', version: 'Pro', category: 'amazon' }
        ]
    },

    huggingface: {
        name: 'HuggingFace',
        requiresKey: true,
        keyEnv: 'HUGGINGFACE_API_KEY',
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

// ==================== TTS PROVIDERS ====================

const TTS_PROVIDERS = {
    edge: {
        name: 'Edge TTS',
        requiresKey: false,
        voices: [
            { id: 'id-ID-GadisNeural', name: 'Gadis (ID Female)', lang: 'id' },
            { id: 'id-ID-ArdiNeural', name: 'Ardi (ID Male)', lang: 'id' },
            { id: 'en-US-JennyNeural', name: 'Jenny (US Female)', lang: 'en' },
            { id: 'en-US-GuyNeural', name: 'Guy (US Male)', lang: 'en' },
            { id: 'en-US-AriaNeural', name: 'Aria (US Female)', lang: 'en' },
            { id: 'en-US-DavisNeural', name: 'Davis (US Male)', lang: 'en' },
            { id: 'en-GB-SoniaNeural', name: 'Sonia (UK Female)', lang: 'en' },
            { id: 'en-GB-RyanNeural', name: 'Ryan (UK Male)', lang: 'en' },
            { id: 'ja-JP-NanamiNeural', name: 'Nanami (JP Female)', lang: 'ja' },
            { id: 'ja-JP-KeitaNeural', name: 'Keita (JP Male)', lang: 'ja' },
            { id: 'ko-KR-SunHiNeural', name: 'SunHi (KR Female)', lang: 'ko' },
            { id: 'ko-KR-InJoonNeural', name: 'InJoon (KR Male)', lang: 'ko' },
            { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao (CN Female)', lang: 'zh' },
            { id: 'zh-CN-YunxiNeural', name: 'Yunxi (CN Male)', lang: 'zh' },
            { id: 'de-DE-KatjaNeural', name: 'Katja (DE Female)', lang: 'de' },
            { id: 'fr-FR-DeniseNeural', name: 'Denise (FR Female)', lang: 'fr' },
            { id: 'es-ES-ElviraNeural', name: 'Elvira (ES Female)', lang: 'es' },
            { id: 'pt-BR-FranciscaNeural', name: 'Francisca (BR Female)', lang: 'pt' },
            { id: 'ru-RU-SvetlanaNeural', name: 'Svetlana (RU Female)', lang: 'ru' },
            { id: 'th-TH-PremwadeeNeural', name: 'Premwadee (TH Female)', lang: 'th' },
            { id: 'vi-VN-HoaiMyNeural', name: 'HoaiMy (VN Female)', lang: 'vi' }
        ]
    },
    pollinations: {
        name: 'Pollinations TTS',
        requiresKey: false,
        voices: [
            { id: 'alloy', name: 'Alloy', lang: 'multi' },
            { id: 'echo', name: 'Echo', lang: 'multi' },
            { id: 'fable', name: 'Fable', lang: 'multi' },
            { id: 'onyx', name: 'Onyx', lang: 'multi' },
            { id: 'nova', name: 'Nova', lang: 'multi' },
            { id: 'shimmer', name: 'Shimmer', lang: 'multi' }
        ]
    },
    elevenlabs: {
        name: 'ElevenLabs',
        requiresKey: true,
        keyEnv: 'ELEVENLABS_API_KEY',
        voices: [
            { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', lang: 'multi' },
            { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', lang: 'multi' },
            { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', lang: 'multi' },
            { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', lang: 'multi' }
        ]
    }
};

// ==================== DEFAULT SETTINGS ====================

const DEFAULT_SETTINGS = {
    aiProvider: 'gemini',
    aiModel: 'gemini-2.0-flash',
    ttsProvider: 'edge',
    ttsVoice: 'id-ID-GadisNeural',
    mode: 'voice',
    ttsOutput: 'auto',
    searchEnabled: true,
    searchProvider: 'auto',
    geminiGrounding: true,
    systemPrompt: MASTER_SYSTEM_PROMPT
};

// ==================== CLIENT & STORAGE ====================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});

const guildSettings = new Map();
const voiceConnections = new Map();
const audioPlayers = new Map();
const ttsQueues = new Map();
const voiceTimeouts = new Map();
const conversations = new Map();

// ==================== CONVERSATION MEMORY ====================

function getConversation(guildId, oderId) {
    const key = `${guildId}-${oderId}`;
    if (!conversations.has(key)) {
        conversations.set(key, {
            messages: [],
            createdAt: Date.now(),
            lastActivity: Date.now()
        });
    }
    const conv = conversations.get(key);
    conv.lastActivity = Date.now();
    return conv;
}

function addToConversation(guildId, oderId, role, content) {
    const conv = getConversation(guildId, oderId);
    conv.messages.push({ role, content, timestamp: Date.now() });
    
    if (conv.messages.length > CONFIG.maxConversationMessages) {
        conv.messages = conv.messages.slice(-CONFIG.maxConversationMessages);
    }
    
    return conv;
}

function clearConversation(guildId, oderId) {
    conversations.delete(`${guildId}-${oderId}`);
}

function getConversationInfo(guildId, oderId) {
    const key = `${guildId}-${oderId}`;
    if (!conversations.has(key)) return null;
    const conv = conversations.get(key);
    return {
        messageCount: conv.messages.length,
        maxMessages: CONFIG.maxConversationMessages,
        ageMinutes: Math.floor((Date.now() - conv.createdAt) / 60000),
        lastActiveMinutes: Math.floor((Date.now() - conv.lastActivity) / 60000)
    };
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

function cleanupFiles(files) {
    if (Array.isArray(files)) files.forEach(f => cleanupFile(f));
    else cleanupFile(files);
}

setInterval(() => {
    try {
        const files = fs.readdirSync(CONFIG.tempPath);
        const now = Date.now();
        files.forEach(f => {
            const filepath = path.join(CONFIG.tempPath, f);
            try {
                const stat = fs.statSync(filepath);
                if (now - stat.mtimeMs > 600000) cleanupFile(filepath);
            } catch (e) {}
        });
    } catch (e) {}
}, 300000);

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

function splitTextForTTS(text, maxLength = CONFIG.ttsMaxChunkLength) {
    const clean = cleanTextForTTS(text);
    if (!clean || clean.length < CONFIG.ttsMinChunkLength) return [];
    
    const limitedText = clean.slice(0, CONFIG.ttsMaxTotalLength);
    if (limitedText.length <= maxLength) return [limitedText];
    
    const chunks = [];
    let remaining = limitedText;
    
    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            if (remaining.trim().length >= CONFIG.ttsMinChunkLength) chunks.push(remaining.trim());
            break;
        }
        
        let splitIndex = -1;
        const searchArea = remaining.slice(0, maxLength);
        
        const lastPeriod = searchArea.lastIndexOf('. ');
        const lastQuestion = searchArea.lastIndexOf('? ');
        const lastExclaim = searchArea.lastIndexOf('! ');
        splitIndex = Math.max(lastPeriod, lastQuestion, lastExclaim);
        
        if (splitIndex > 0 && splitIndex > maxLength / 3) splitIndex += 1;
        else splitIndex = -1;
        
        if (splitIndex === -1) {
            const lastComma = searchArea.lastIndexOf(', ');
            splitIndex = lastComma > maxLength / 3 ? lastComma + 1 : -1;
        }
        
        if (splitIndex === -1) {
            splitIndex = searchArea.lastIndexOf(' ');
            if (splitIndex < maxLength / 4) splitIndex = -1;
        }
        
        if (splitIndex === -1) splitIndex = maxLength;
        
        const chunk = remaining.slice(0, splitIndex).trim();
        if (chunk.length >= CONFIG.ttsMinChunkLength) chunks.push(chunk);
        remaining = remaining.slice(splitIndex).trim();
    }
    
    return chunks.filter(c => c.length >= CONFIG.ttsMinChunkLength);
}

function loadSettings() {
    try {
        if (fs.existsSync(CONFIG.dataPath)) {
            const data = JSON.parse(fs.readFileSync(CONFIG.dataPath, 'utf8'));
            Object.entries(data).forEach(([id, s]) => guildSettings.set(id, { ...DEFAULT_SETTINGS, ...s }));
            console.log(`📂 Loaded ${guildSettings.size} settings`);
        }
    } catch (e) { console.error('Load error:', e.message); }
}

function saveSettings() {
    try {
        const dir = path.dirname(CONFIG.dataPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const data = {};
        guildSettings.forEach((s, id) => data[id] = s);
        fs.writeFileSync(CONFIG.dataPath, JSON.stringify(data, null, 2));
    } catch (e) { console.error('Save error:', e.message); }
}

function getSettings(guildId) {
    if (!guildSettings.has(guildId)) guildSettings.set(guildId, { ...DEFAULT_SETTINGS });
    return guildSettings.get(guildId);
}

function updateSettings(guildId, key, value) {
    const s = getSettings(guildId);
    s[key] = value;
    saveSettings();
}

function isAdmin(oderId) {
    return CONFIG.adminIds.includes(oderId);
}

function getModelInfo(provider, modelId) {
    const p = AI_PROVIDERS[provider];
    if (!p) return { name: modelId, version: '?' };
    return p.models.find(m => m.id === modelId) || { name: modelId, version: '?' };
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

// ==================== HTTP HELPERS ====================

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

function httpRequestBinary(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
        if (body) req.write(body);
        req.end();
    });
}

// ==================== AI PROVIDERS IMPLEMENTATION ====================

async function callGemini(model, message, history, systemPrompt, useGrounding = false) {
    const apiKey = CONFIG.geminiApiKey;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');

    const contents = [];

    history.slice(-40).forEach(m => {
        contents.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        });
    });

    contents.push({
        role: 'user',
        parts: [{ text: message }]
    });

    const requestBody = {
        contents: contents,
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
        generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 2048
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
    };

    // Add Google Search grounding if enabled
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

    if (result.candidates && result.candidates[0]?.content?.parts?.[0]?.text) {
        return {
            text: result.candidates[0].content.parts[0].text,
            grounded: !!result.candidates[0]?.groundingMetadata
        };
    }

    throw new Error('No response from Gemini');
}

async function callGroq(model, message, history, systemPrompt) {
    const apiKey = CONFIG.groqApiKey;
    if (!apiKey) throw new Error('GROQ_API_KEY not set');

    const modelInfo = AI_PROVIDERS.groq.models.find(m => m.id === model);
    if (modelInfo && ['stt'].includes(modelInfo.category)) {
        throw new Error(`Model ${model} is not a chat model`);
    }

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-50).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
    ];

    const { data, statusCode } = await httpRequest({
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
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
    history.slice(-20).forEach(m => prompt += m.role === 'user' ? `User: ${m.content}\n` : `Assistant: ${m.content}\n`);
    prompt += `User: ${message}\nAssistant:`;

    const encoded = encodeURIComponent(prompt.slice(0, 8000));
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
                } else reject(new Error(`HTTP ${res.statusCode}`));
            });
        }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
    });
}

async function callPollinationsAPI(model, message, history, systemPrompt) {
    const apiKey = CONFIG.pollinationsApiKey;
    if (!apiKey) throw new Error('POLLINATIONS_API_KEY not set');

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-30).map(m => ({ role: m.role, content: m.content })),
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
    if (result.choices && result.choices[0]?.message?.content) {
        return result.choices[0].message.content;
    }

    throw new Error('No response from Pollinations API');
}

async function callOpenRouter(model, message, history, systemPrompt) {
    const apiKey = CONFIG.openrouterApiKey;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-50).map(m => ({ role: m.role, content: m.content })),
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

async function callHuggingFace(model, message, history, systemPrompt) {
    const apiKey = CONFIG.huggingfaceApiKey;
    if (!apiKey) throw new Error('HUGGINGFACE_API_KEY not set');

    let prompt = systemPrompt + '\n\n';
    history.slice(-20).forEach(m => prompt += m.role === 'user' ? `User: ${m.content}\n` : `Assistant: ${m.content}\n`);
    prompt += `User: ${message}\nAssistant:`;

    const { data, statusCode } = await httpRequest({
        hostname: 'api-inference.huggingface.co',
        path: `/models/${model}`,
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    }, JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 1000 } }));

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

async function callAI(guildId, oderId, userMessage, isVoiceMode = false) {
    const s = getSettings(guildId);
    const { aiProvider, aiModel, systemPrompt, searchEnabled, searchProvider, geminiGrounding } = s;
    const start = Date.now();

    const conv = getConversation(guildId, oderId);
    const history = conv.messages;

    let searchContext = '';
    let searchData = null;
    let useGeminiGrounding = false;

    // Determine if we should search
    const needsSearch = searchEnabled && searchProvider !== 'off' && shouldSearch(userMessage);

    // For Gemini with grounding enabled, use built-in Google Search
    if (aiProvider === 'gemini' && geminiGrounding && needsSearch) {
        useGeminiGrounding = true;
    } 
    // For other providers, use Serper/Tavily
    else if (needsSearch && (CONFIG.tavilyApiKey || CONFIG.serperApiKey)) {
        console.log('🔍 Searching:', userMessage.slice(0, 50));
        searchData = await performSearch(userMessage, searchProvider);
        if (searchData) {
            searchContext = formatSearchForAI(searchData);
            console.log('✅ Search completed via', searchData.source);
        }
    }

    // Build final prompt
    let finalSystemPrompt = systemPrompt;
    if (searchContext) {
        finalSystemPrompt += searchContext;
    }
    if (isVoiceMode) {
        finalSystemPrompt += '\n\n[MODE SUARA: Jawab singkat 2-4 kalimat, natural untuk didengarkan]';
    }

    try {
        let response;
        let grounded = false;

        switch (aiProvider) {
            case 'gemini':
                const geminiResult = await callGemini(aiModel, userMessage, history, finalSystemPrompt, useGeminiGrounding);
                response = geminiResult.text;
                grounded = geminiResult.grounded || useGeminiGrounding;
                break;
            case 'groq':
                response = await callGroq(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'pollinations_free':
                response = await callPollinationsFree(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'pollinations_api':
                response = await callPollinationsAPI(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'openrouter':
                response = await callOpenRouter(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'huggingface':
                response = await callHuggingFace(aiModel, userMessage, history, finalSystemPrompt);
                break;
            default:
                response = await callPollinationsFree('openai', userMessage, history, finalSystemPrompt);
        }

        addToConversation(guildId, oderId, 'user', userMessage);
        addToConversation(guildId, oderId, 'assistant', response);

        const info = getModelInfo(aiProvider, aiModel);

        return {
            text: response,
            provider: AI_PROVIDERS[aiProvider]?.name || aiProvider,
            model: info.name,
            version: info.version,
            latency: Date.now() - start,
            searched: !!searchData || grounded,
            searchSource: searchData?.source || (grounded ? 'gemini-grounding' : null)
        };

    } catch (error) {
        console.error(`AI Error (${aiProvider}):`, error.message);

        // Fallback to Pollinations Free
        if (aiProvider !== 'pollinations_free') {
            console.log('Fallback to Pollinations...');
            try {
                const fallback = await callPollinationsFree('openai', userMessage, history, finalSystemPrompt);
                addToConversation(guildId, oderId, 'user', userMessage);
                addToConversation(guildId, oderId, 'assistant', fallback);
                return {
                    text: fallback,
                    provider: 'Pollinations (Fallback)',
                    model: 'OpenAI GPT',
                    version: 'GPT-5-nano',
                    latency: Date.now() - start,
                    searched: !!searchData
                };
            } catch (fallbackError) {
                throw new Error(`Primary: ${error.message}, Fallback: ${fallbackError.message}`);
            }
        }

        throw error;
    }
}

// ==================== TTS GENERATION ====================

function generateSingleTTSChunk(text, voice, provider, outputPath) {
    return new Promise((resolve, reject) => {
        const safeText = text.replace(/"/g, "'").replace(/`/g, "'").replace(/\$/g, '').replace(/\\/g, '').replace(/\n/g, ' ').trim();

        if (!safeText || safeText.length < 2) return reject(new Error('Text too short'));

        const timeout = setTimeout(() => reject(new Error('TTS timeout')), CONFIG.ttsGenerateTimeout);

        switch (provider) {
            case 'edge':
                exec(`edge-tts --voice "${voice}" --text "${safeText}" --write-media "${outputPath}"`, { timeout: CONFIG.ttsGenerateTimeout }, (err) => {
                    clearTimeout(timeout);
                    if (err) reject(err);
                    else resolve(outputPath);
                });
                break;

            case 'pollinations':
                const encoded = encodeURIComponent(safeText);
                const file = fs.createWriteStream(outputPath);
                https.get(`https://text.pollinations.ai/${encoded}?model=openai-audio&voice=${voice}`, res => {
                    clearTimeout(timeout);
                    if (res.statusCode !== 200) { file.close(); return reject(new Error(`HTTP ${res.statusCode}`)); }
                    res.pipe(file);
                    file.on('finish', () => { file.close(); resolve(outputPath); });
                }).on('error', (e) => { clearTimeout(timeout); reject(e); });
                break;

            case 'elevenlabs':
                (async () => {
                    try {
                        const apiKey = CONFIG.elevenLabsApiKey;
                        if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');
                        const response = await httpRequestBinary({
                            hostname: 'api.elevenlabs.io',
                            path: `/v1/text-to-speech/${voice}`,
                            method: 'POST',
                            headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': apiKey }
                        }, JSON.stringify({ text: safeText, model_id: 'eleven_multilingual_v2' }));
                        clearTimeout(timeout);
                        fs.writeFileSync(outputPath, response);
                        resolve(outputPath);
                    } catch (e) { clearTimeout(timeout); reject(e); }
                })();
                break;

            default:
                exec(`edge-tts --voice "id-ID-GadisNeural" --text "${safeText}" --write-media "${outputPath}"`, { timeout: CONFIG.ttsGenerateTimeout }, (err) => {
                    clearTimeout(timeout);
                    if (err) reject(err);
                    else resolve(outputPath);
                });
        }
    });
}

function concatenateAudioFiles(inputFiles, outputPath) {
    return new Promise((resolve, reject) => {
        if (inputFiles.length === 0) return reject(new Error('No input'));
        if (inputFiles.length === 1) {
            try { fs.copyFileSync(inputFiles[0], outputPath); return resolve(outputPath); }
            catch (e) { return reject(e); }
        }

        const listPath = outputPath.replace('.mp3', '_list.txt');
        const listContent = inputFiles.map(f => `file '${path.resolve(f)}'`).join('\n');

        try { fs.writeFileSync(listPath, listContent); }
        catch (e) { return reject(e); }

        exec(`ffmpeg -f concat -safe 0 -i "${listPath}" -c:a libmp3lame -q:a 2 "${outputPath}" -y`, { timeout: CONFIG.ttsConcatTimeout }, (err) => {
            cleanupFile(listPath);
            if (err) reject(err);
            else resolve(outputPath);
        });
    });
}

async function generateTTS(guildId, text, progressCallback = null) {
    const s = getSettings(guildId);
    ensureTempDir();

    const chunks = splitTextForTTS(text, CONFIG.ttsMaxChunkLength);
    if (chunks.length === 0) return null;

    const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const chunkFiles = [];

    console.log(`🔊 TTS: ${chunks.length} chunks`);

    try {
        for (let i = 0; i < chunks.length; i++) {
            const chunkPath = path.join(CONFIG.tempPath, `tts_${sessionId}_chunk${i}.mp3`);
            if (progressCallback) progressCallback(i + 1, chunks.length);

            try {
                await generateSingleTTSChunk(chunks[i], s.ttsVoice, s.ttsProvider, chunkPath);
                if (fs.existsSync(chunkPath) && fs.statSync(chunkPath).size > 0) chunkFiles.push(chunkPath);
            } catch (e) {
                console.error(`TTS chunk ${i} error:`, e.message);
                if (s.ttsProvider !== 'edge') {
                    try {
                        await generateSingleTTSChunk(chunks[i], 'id-ID-GadisNeural', 'edge', chunkPath);
                        if (fs.existsSync(chunkPath)) chunkFiles.push(chunkPath);
                    } catch (e2) {}
                }
            }
        }

        if (chunkFiles.length === 0) throw new Error('No TTS generated');

        if (chunkFiles.length === 1) return { type: 'single', file: chunkFiles[0], sessionId };

        const combinedPath = path.join(CONFIG.tempPath, `tts_${sessionId}_combined.mp3`);

        try {
            await concatenateAudioFiles(chunkFiles, combinedPath);
            cleanupFiles(chunkFiles);
            return { type: 'combined', file: combinedPath, sessionId, chunkCount: chunks.length };
        } catch (e) {
            return { type: 'chunks', files: chunkFiles, sessionId, chunkCount: chunks.length };
        }

    } catch (error) {
        cleanupFiles(chunkFiles);
        throw error;
    }
}

// ==================== VOICE FUNCTIONS ====================

function resetVoiceTimeout(guildId) {
    if (voiceTimeouts.has(guildId)) clearTimeout(voiceTimeouts.get(guildId));

    const timeout = setTimeout(() => {
        const conn = voiceConnections.get(guildId);
        if (conn) leaveVoiceChannel({ id: guildId });
    }, CONFIG.voiceInactivityTimeout);

    voiceTimeouts.set(guildId, timeout);
}

async function joinUserVoiceChannel(member, guild) {
    const vc = member?.voice?.channel;
    if (!vc) return { success: false, error: 'Masuk voice channel dulu' };

    try {
        const existingConn = getVoiceConnection(guild.id);
        if (existingConn && existingConn.joinConfig.channelId === vc.id) {
            resetVoiceTimeout(guild.id);
            return { success: true, channel: vc, alreadyConnected: true };
        }

        if (existingConn) {
            existingConn.destroy();
            voiceConnections.delete(guild.id);
            audioPlayers.delete(guild.id);
            ttsQueues.delete(guild.id);
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
        player.on('error', () => processNextInQueue(guild.id));

        resetVoiceTimeout(guild.id);
        return { success: true, channel: vc };

    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function leaveVoiceChannel(guild) {
    const guildId = guild.id || guild;
    const conn = voiceConnections.get(guildId) || getVoiceConnection(guildId);

    if (voiceTimeouts.has(guildId)) {
        clearTimeout(voiceTimeouts.get(guildId));
        voiceTimeouts.delete(guildId);
    }

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
        resetVoiceTimeout(guildId);
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
        resetVoiceTimeout(guildId);
    } catch (e) {
        cleanupFile(next.file);
        processNextInQueue(guildId);
    }
}

function addToTTSQueue(guildId, ttsResult) {
    let queueData = ttsQueues.get(guildId);
    if (!queueData) {
        queueData = { queue: [], playing: false, currentFile: null };
        ttsQueues.set(guildId, queueData);
    }

    if (ttsResult.type === 'single' || ttsResult.type === 'combined') {
        queueData.queue.push({ file: ttsResult.file });
    } else if (ttsResult.type === 'chunks') {
        ttsResult.files.forEach(file => queueData.queue.push({ file }));
    }

    if (!queueData.playing) processNextInQueue(guildId);
}

async function playTTSInVoice(guildId, ttsResult) {
    const player = audioPlayers.get(guildId);
    if (!player) return false;
    addToTTSQueue(guildId, ttsResult);
    return true;
}

async function sendTTSAsFile(channel, ttsResult) {
    try {
        let filePath;
        let cleanup = [];

        if (ttsResult.type === 'single' || ttsResult.type === 'combined') {
            filePath = ttsResult.file;
        } else if (ttsResult.type === 'chunks') {
            const combinedPath = path.join(CONFIG.tempPath, `tts_${ttsResult.sessionId}_forfile.mp3`);
            try {
                await concatenateAudioFiles(ttsResult.files, combinedPath);
                filePath = combinedPath;
                cleanup = ttsResult.files;
            } catch (e) {
                filePath = ttsResult.files[0];
                cleanup = ttsResult.files.slice(1);
            }
        }

        const attachment = new AttachmentBuilder(filePath, { name: `aria_${Date.now()}.mp3` });
        await channel.send({ files: [attachment] });

        cleanupFile(filePath);
        cleanupFiles(cleanup);
        return true;

    } catch (e) {
        console.error('TTS file error:', e.message);
        return false;
    }
}

// ==================== SETTINGS UI ====================

function createSettingsEmbed(guildId) {
    const s = getSettings(guildId);
    const ai = AI_PROVIDERS[s.aiProvider];
    const tts = TTS_PROVIDERS[s.ttsProvider];
    const m = getModelInfo(s.aiProvider, s.aiModel);
    const totalModels = Object.values(AI_PROVIDERS).reduce((acc, p) => acc + p.models.length, 0);

    let searchStatus;
    if (s.searchProvider === 'off') {
        searchStatus = '🔴 Off';
    } else if (s.aiProvider === 'gemini' && s.geminiGrounding) {
        searchStatus = '🟢 Gemini Grounding';
    } else if (s.searchProvider === 'serper') {
        searchStatus = CONFIG.serperApiKey ? '🟢 Serper' : '🔴 No Key';
    } else if (s.searchProvider === 'tavily') {
        searchStatus = CONFIG.tavilyApiKey ? '🟢 Tavily' : '🔴 No Key';
    } else {
        searchStatus = (CONFIG.tavilyApiKey || CONFIG.serperApiKey) ? '🟢 Auto' : '🔴 No Key';
    }

    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Aria Settings')
        .setDescription(`**${totalModels}** models available`)
        .addFields(
            { name: '🧠 AI Provider', value: `**${ai?.name}**\n${m.name} (${m.version})`, inline: true },
            { name: '🔊 TTS Provider', value: `**${tts?.name}**\n${s.ttsVoice.split('-').slice(-1)[0]}`, inline: true },
            { name: '📝 Mode', value: s.mode === 'voice' ? '🔊 Voice + TTS' : '📝 Text Only', inline: true },
            { name: '🔍 Search', value: searchStatus, inline: true },
            { name: '🎵 TTS Output', value: s.ttsOutput === 'auto' ? '🔄 Auto' : (s.ttsOutput === 'file' ? '📁 File' : '🔊 Voice'), inline: true },
            { name: '💬 Memory', value: `${CONFIG.maxConversationMessages} msgs`, inline: true }
        )
        .setFooter({ text: 'v2.14.0 | Gemini Grounding + All Providers' })
        .setTimestamp();
}

function createAIProviderMenu(guildId) {
    const s = getSettings(guildId);
    const opts = Object.entries(AI_PROVIDERS).map(([k, p]) => {
        const ok = !p.requiresKey || process.env[p.keyEnv];
        const n = p.models.filter(m => !['stt'].includes(m.category)).length;
        return { label: p.name.slice(0, 25), value: k, description: `${n} models`, default: k === s.aiProvider, emoji: ok ? '🟢' : '🔴' };
    });
    return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_ai').setPlaceholder('🧠 AI Provider').addOptions(opts));
}

function createAIModelMenu(guildId) {
    const s = getSettings(guildId);
    const p = AI_PROVIDERS[s.aiProvider];
    if (!p) return null;

    const chatModels = p.models.filter(m => !['stt'].includes(m.category));
    const opts = chatModels.slice(0, 25).map(m => ({
        label: m.name.slice(0, 25),
        description: `${m.version}${m.category === 'preview' ? ' ⚠️' : ''}`.slice(0, 50),
        value: m.id,
        default: m.id === s.aiModel
    }));

    if (opts.length === 0) return null;
    return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_model').setPlaceholder('🤖 Model').addOptions(opts));
}

function createTTSProviderMenu(guildId) {
    const s = getSettings(guildId);
    const opts = Object.entries(TTS_PROVIDERS).map(([k, p]) => ({
        label: p.name, value: k, description: `${p.voices.length} voices`,
        default: k === s.ttsProvider, emoji: (!p.requiresKey || process.env[p.keyEnv]) ? '🟢' : '🔴'
    }));
    return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_tts').setPlaceholder('🔊 TTS').addOptions(opts));
}

function createTTSVoiceMenu(guildId) {
    const s = getSettings(guildId);
    const p = TTS_PROVIDERS[s.ttsProvider];
    if (!p) return null;
    const opts = p.voices.slice(0, 25).map(v => ({ label: v.name.slice(0, 25), description: v.lang, value: v.id, default: v.id === s.ttsVoice }));
    return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_voice').setPlaceholder('🎤 Voice').addOptions(opts));
}

function createModeButtons(guildId) {
    const s = getSettings(guildId);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mode_text').setLabel('📝 Text').setStyle(s.mode === 'text' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('mode_voice').setLabel('🔊 Voice').setStyle(s.mode === 'voice' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('tts_toggle').setLabel(`🎵 ${s.ttsOutput || 'auto'}`).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('search_toggle').setLabel(`🔍 ${s.searchProvider || 'auto'}`).setStyle(s.searchProvider === 'off' ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder().setCustomId('grounding_toggle').setLabel(s.geminiGrounding ? '🌐 Grounding' : '🌐 Off').setStyle(s.geminiGrounding ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
}

// ==================== MESSAGE HANDLERS ====================

async function handleAIMessage(msg, query) {
    const guildId = msg.guild.id;
    const oderId = msg.author.id;
    const s = getSettings(guildId);

    const rateCheck = checkRateLimit(oderId);
    if (!rateCheck.allowed) {
        return msg.reply(`⏳ Rate limited. Tunggu ${rateCheck.waitTime}s`);
    }

    if (query.length > 4000) {
        return msg.reply('❌ Pesan terlalu panjang (max 4000 karakter)');
    }

    const isVoiceMode = s.mode === 'voice';
    let inVoiceChannel = false;
    const ttsOutput = s.ttsOutput || 'auto';

    if (isVoiceMode && msg.member?.voice?.channel && ttsOutput !== 'file') {
        const result = await joinUserVoiceChannel(msg.member, msg.guild);
        if (result.success) inVoiceChannel = true;
    }

    await msg.channel.sendTyping();

    try {
        const response = await callAI(guildId, oderId, query, isVoiceMode);

        const searchIcon = response.searched ? ` 🔍${response.searchSource ? ` (${response.searchSource})` : ''}` : '';
        const modelInfo = `*${response.model} • ${response.latency}ms${searchIcon}*`;
        const fullResponse = `${response.text}\n\n-# ${modelInfo}`;

        const parts = splitMessage(fullResponse);
        for (let i = 0; i < parts.length; i++) {
            if (i === 0) await msg.reply(parts[i]);
            else await msg.channel.send(parts[i]);
        }

        if (isVoiceMode) {
            try {
                const ttsResult = await generateTTS(guildId, response.text);
                if (ttsResult) {
                    if (ttsOutput === 'auto') {
                        if (inVoiceChannel) await playTTSInVoice(guildId, ttsResult);
                        else await sendTTSAsFile(msg.channel, ttsResult);
                    } else if (ttsOutput === 'voice' && inVoiceChannel) {
                        await playTTSInVoice(guildId, ttsResult);
                    } else {
                        await sendTTSAsFile(msg.channel, ttsResult);
                    }
                }
            } catch (e) {
                console.error('TTS error:', e.message);
            }
        }

    } catch (e) {
        console.error('AI Error:', e);
        await msg.reply(`❌ Error: ${e.message}`);
    }
}

async function showSettings(msg) {
    if (!isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
    const comps = [createAIProviderMenu(msg.guild.id), createAIModelMenu(msg.guild.id), createTTSProviderMenu(msg.guild.id), createTTSVoiceMenu(msg.guild.id), createModeButtons(msg.guild.id)].filter(Boolean);
    await msg.reply({ embeds: [createSettingsEmbed(msg.guild.id)], components: comps });
}

async function showHelp(msg) {
    const searchStatus = `Serper: ${CONFIG.serperApiKey ? '✅' : '❌'} | Tavily: ${CONFIG.tavilyApiKey ? '✅' : '❌'}`;
    const geminiStatus = CONFIG.geminiApiKey ? '✅' : '❌';
    const pollinationsCount = POLLINATIONS_MODELS.length;

    const helpText = `**🤖 Aria AI Bot v2.14.0**

**Chat:**
• \`.ai <pertanyaan>\` - Tanya AI
• \`@Aria <pertanyaan>\` - Mention

**Voice:**
• \`.join\` - Gabung voice
• \`.leave\` - Keluar voice
• \`.speak <teks>\` - TTS manual
• \`.stop\` - Stop audio

**Search:**
• \`.search <query>\` - Manual search
• \`.setsearch <provider>\` - Set search engine
  ↳ Options: \`auto\`, \`serper\`, \`tavily\`, \`off\`

**Memory:**
• \`.memory\` - Cek memory
• \`.clear\` - Hapus memory

**Settings:**
• \`.settings\` - Panel settings (admin)
• \`.status\` - Status bot
• \`.models\` - List models

**Features:**
• Gemini AI + Grounding: ${geminiStatus}
• Search: ${searchStatus}
• Pollinations: ${pollinationsCount} free models
• Memory: ${CONFIG.maxConversationMessages} messages
• Rate limit: ${CONFIG.rateLimitMax} req/min`;

    await msg.reply(helpText);
}

async function handleSearch(msg, query) {
    if (!query) return msg.reply('❓ `.search berita hari ini`');
    if (!CONFIG.tavilyApiKey && !CONFIG.serperApiKey) return msg.reply('❌ No search API configured');

    const s = getSettings(msg.guild.id);
    await msg.channel.sendTyping();

    try {
        const result = await performSearch(query, s.searchProvider);
        if (!result) return msg.reply('❌ No results found');

        const display = formatSearchForDisplay(result, query);
        const parts = splitMessage(display);
        for (const part of parts) await msg.channel.send(part);

    } catch (e) {
        await msg.reply(`❌ Error: ${e.message}`);
    }
}

async function handleSetSearch(msg, provider) {
    if (!isAdmin(msg.author.id)) return msg.reply('❌ Admin only');

    const validProviders = ['auto', 'serper', 'tavily', 'off'];
    const p = provider?.toLowerCase();

    if (!p || !validProviders.includes(p)) {
        const current = getSettings(msg.guild.id).searchProvider || 'auto';
        return msg.reply(`**🔍 Search Provider Settings**

Current: \`${current}\`

**Options:**
• \`.setsearch auto\` - Auto (Serper → Tavily fallback)
• \`.setsearch serper\` - Use Serper only
• \`.setsearch tavily\` - Use Tavily only
• \`.setsearch off\` - Disable search

**API Status:**
• Serper: ${CONFIG.serperApiKey ? '✅ Ready' : '❌ No key'}
• Tavily: ${CONFIG.tavilyApiKey ? '✅ Ready' : '❌ No key'}`);
    }

    if (p === 'serper' && !CONFIG.serperApiKey) {
        return msg.reply('❌ SERPER_API_KEY not configured');
    }
    if (p === 'tavily' && !CONFIG.tavilyApiKey) {
        return msg.reply('❌ TAVILY_API_KEY not configured');
    }

    updateSettings(msg.guild.id, 'searchProvider', p);
    
    const emoji = p === 'off' ? '🔴' : '🟢';
    await msg.reply(`${emoji} Search provider set to: **${p}**`);
}

async function handleSpeak(msg, text) {
    if (!text) return msg.reply('❓ `.speak Halo dunia`');

    const statusMsg = await msg.reply('🔊 Generating...');

    try {
        const ttsResult = await generateTTS(msg.guild.id, text);
        if (!ttsResult) return statusMsg.edit('❌ TTS failed');

        const player = audioPlayers.get(msg.guild.id);
        if (player && msg.member?.voice?.channel) {
            await playTTSInVoice(msg.guild.id, ttsResult);
            await statusMsg.edit('🔊 Playing...');
        } else {
            await sendTTSAsFile(msg.channel, ttsResult);
            await statusMsg.delete().catch(() => {});
        }
    } catch (e) {
        await statusMsg.edit(`❌ ${e.message}`);
    }
}

async function handleStop(msg) {
    const player = audioPlayers.get(msg.guild.id);
    const queueData = ttsQueues.get(msg.guild.id);

    if (!player) return msg.reply('❌ Nothing playing');

    if (queueData) {
        if (queueData.currentFile) cleanupFile(queueData.currentFile);
        queueData.queue.forEach(item => cleanupFile(item.file));
        queueData.queue = [];
        queueData.playing = false;
        queueData.currentFile = null;
    }

    player.stop();
    await msg.reply('⏹️ Stopped');
}

// ==================== INTERACTIONS ====================

client.on(Events.InteractionCreate, async (int) => {
    if (!int.isStringSelectMenu() && !int.isButton()) return;
    if (!isAdmin(int.user.id)) return int.reply({ content: '❌ Admin only', ephemeral: true });

    const guildId = int.guild.id;

    try {
        if (int.customId === 'sel_ai') {
            const p = AI_PROVIDERS[int.values[0]];
            if (!p) return int.reply({ content: '❌ Invalid', ephemeral: true });
            if (p.requiresKey && !process.env[p.keyEnv]) return int.reply({ content: `❌ ${p.keyEnv} missing`, ephemeral: true });
            updateSettings(guildId, 'aiProvider', int.values[0]);
            const chatModels = p.models.filter(m => !['stt'].includes(m.category));
            if (chatModels.length > 0) updateSettings(guildId, 'aiModel', chatModels[0].id);
        } else if (int.customId === 'sel_model') {
            updateSettings(guildId, 'aiModel', int.values[0]);
        } else if (int.customId === 'sel_tts') {
            const p = TTS_PROVIDERS[int.values[0]];
            if (!p) return int.reply({ content: '❌ Invalid', ephemeral: true });
            updateSettings(guildId, 'ttsProvider', int.values[0]);
            updateSettings(guildId, 'ttsVoice', p.voices[0].id);
        } else if (int.customId === 'sel_voice') {
            updateSettings(guildId, 'ttsVoice', int.values[0]);
        } else if (int.customId === 'mode_text') {
            updateSettings(guildId, 'mode', 'text');
        } else if (int.customId === 'mode_voice') {
            updateSettings(guildId, 'mode', 'voice');
        } else if (int.customId === 'tts_toggle') {
            const s = getSettings(guildId);
            const order = ['auto', 'file', 'voice'];
            const idx = order.indexOf(s.ttsOutput || 'auto');
            updateSettings(guildId, 'ttsOutput', order[(idx + 1) % 3]);
        } else if (int.customId === 'search_toggle') {
            const s = getSettings(guildId);
            const order = ['auto', 'serper', 'tavily', 'off'];
            const idx = order.indexOf(s.searchProvider || 'auto');
            updateSettings(guildId, 'searchProvider', order[(idx + 1) % 4]);
        } else if (int.customId === 'grounding_toggle') {
            const s = getSettings(guildId);
            updateSettings(guildId, 'geminiGrounding', !s.geminiGrounding);
        }

        const comps = [createAIProviderMenu(guildId), createAIModelMenu(guildId), createTTSProviderMenu(guildId), createTTSVoiceMenu(guildId), createModeButtons(guildId)].filter(Boolean);
        await int.update({ embeds: [createSettingsEmbed(guildId)], components: comps });

    } catch (e) {
        int.reply({ content: `❌ ${e.message}`, ephemeral: true }).catch(() => {});
    }
});

// ==================== MESSAGES ====================

client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    const isMentioned = msg.mentions.has(client.user);
    let content = msg.content;

    if (isMentioned) {
        content = content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
    }

    if (isMentioned && content) return handleAIMessage(msg, content);
    if (!content.startsWith(CONFIG.prefix)) return;

    const args = content.slice(CONFIG.prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    try {
        switch (cmd) {
            case 'ai': case 'ask': case 'chat': case 'tanya':
                if (!args.join(' ')) return msg.reply('❓ `.ai pertanyaan`');
                await handleAIMessage(msg, args.join(' '));
                break;

            case 'search': case 'cari':
                await handleSearch(msg, args.join(' '));
                break;

            case 'setsearch':
                await handleSetSearch(msg, args[0]);
                break;

            case 'speak': case 'say': case 'tts':
                await handleSpeak(msg, args.join(' '));
                break;

            case 'stop': case 'skip':
                await handleStop(msg);
                break;

            case 'join': case 'j':
                const jr = await joinUserVoiceChannel(msg.member, msg.guild);
                await msg.reply(jr.success ? (jr.alreadyConnected ? `✅ Already in **${jr.channel.name}**` : `🔊 Joined **${jr.channel.name}**`) : `❌ ${jr.error}`);
                break;

            case 'leave': case 'dc':
                await msg.reply(await leaveVoiceChannel(msg.guild) ? '👋 Left voice channel' : '❌ Not in voice');
                break;

            case 'settings': case 'config':
                await showSettings(msg);
                break;

            case 'status':
                const st = getSettings(msg.guild.id);
                const pollinationsCount = POLLINATIONS_MODELS.length;
                let text = `**📊 Bot Status v2.14.0**\n\n`;
                text += `**Search Providers:**\n`;
                text += `• Serper: ${CONFIG.serperApiKey ? '🟢 Ready' : '🔴 No key'}\n`;
                text += `• Tavily: ${CONFIG.tavilyApiKey ? '🟢 Ready' : '🔴 No key'}\n`;
                text += `• Current: \`${st.searchProvider || 'auto'}\`\n`;
                text += `• Gemini Grounding: ${st.geminiGrounding ? '🟢 On' : '🔴 Off'}\n\n`;
                text += `**AI Providers:**\n`;
                text += `• Gemini: ${CONFIG.geminiApiKey ? '🟢' : '🔴'}\n`;
                text += `• Groq: ${CONFIG.groqApiKey ? '🟢' : '🔴'}\n`;
                text += `• OpenRouter: ${CONFIG.openrouterApiKey ? '🟢' : '🔴'}\n`;
                text += `• HuggingFace: ${CONFIG.huggingfaceApiKey ? '🟢' : '🔴'}\n`;
                text += `• Pollinations Free: 🟢 (${pollinationsCount} models)\n`;
                text += `• Pollinations API: ${CONFIG.pollinationsApiKey ? '🟢' : '🔴'}\n\n`;
                text += `**Stats:**\n`;
                text += `• Conversations: ${conversations.size}\n`;
                text += `• Voice connections: ${voiceConnections.size}\n`;
                text += `• Uptime: ${Math.floor((Date.now() - startTime) / 60000)} min`;
                await msg.reply(text);
                break;

            case 'memory': case 'mem':
                const info = getConversationInfo(msg.guild.id, msg.author.id);
                if (!info) return msg.reply('📭 No conversation history');
                await msg.reply(`**🧠 Memory Info**\n📝 Messages: ${info.messageCount}/${info.maxMessages}\n⏱️ Age: ${info.ageMinutes} min\n💤 Last active: ${info.lastActiveMinutes} min ago`);
                break;

            case 'clear': case 'reset':
                clearConversation(msg.guild.id, msg.author.id);
                await msg.reply('🗑️ Conversation cleared!');
                break;

            case 'clearall':
                if (!isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
                conversations.clear();
                await msg.reply('🗑️ All conversations cleared');
                break;

            case 'help': case 'h':
                await showHelp(msg);
                break;

            case 'ping':
                await msg.reply(`🏓 Pong! ${Date.now() - msg.createdTimestamp}ms`);
                break;

            case 'models':
                let modelText = '**📦 Available Models**\n\n';
                for (const [key, provider] of Object.entries(AI_PROVIDERS)) {
                    const available = !provider.requiresKey || process.env[provider.keyEnv];
                    const icon = available ? '🟢' : '🔴';
                    const count = provider.models.filter(m => !['stt'].includes(m.category)).length;
                    modelText += `${icon} **${provider.name}**: ${count} models\n`;
                }
                const totalModels = Object.values(AI_PROVIDERS).reduce((acc, p) => acc + p.models.filter(m => !['stt'].includes(m.category)).length, 0);
                modelText += `\n**Total: ${totalModels} models**`;
                await msg.reply(modelText);
                break;

            case 'grounding':
                if (!isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
                const gs = getSettings(msg.guild.id);
                updateSettings(msg.guild.id, 'geminiGrounding', !gs.geminiGrounding);
                await msg.reply(`🌐 Gemini Grounding: ${!gs.geminiGrounding ? '**Enabled**' : '**Disabled**'}`);
                break;
        }
    } catch (e) {
        console.error('Command error:', e);
        msg.reply(`❌ ${e.message}`).catch(() => {});
    }
});

// ==================== READY ====================

client.once(Events.ClientReady, () => {
    console.log('\n' + '='.repeat(50));
    console.log(`🤖 ${client.user.tag} online!`);
    console.log(`📡 ${client.guilds.cache.size} servers`);
    console.log(`📦 v2.14.0 - Gemini Grounding + Full Features`);
    console.log('='.repeat(50));
    console.log(`🔍 Serper: ${CONFIG.serperApiKey ? '✅' : '❌'}`);
    console.log(`🔍 Tavily: ${CONFIG.tavilyApiKey ? '✅' : '❌'}`);
    console.log(`🧠 Gemini: ${CONFIG.geminiApiKey ? '✅' : '❌'}`);
    console.log(`🧠 Groq: ${CONFIG.groqApiKey ? '✅' : '❌'}`);
    console.log(`🧠 OpenRouter: ${CONFIG.openrouterApiKey ? '✅' : '❌'}`);
    console.log(`🧠 HuggingFace: ${CONFIG.huggingfaceApiKey ? '✅' : '❌'}`);
    console.log(`🌸 Pollinations API: ${CONFIG.pollinationsApiKey ? '✅' : '❌'}`);
    console.log(`🎙️ ElevenLabs: ${CONFIG.elevenLabsApiKey ? '✅' : '❌'}`);
    console.log('='.repeat(50));
    
    const totalModels = Object.values(AI_PROVIDERS).reduce((acc, p) => acc + p.models.length, 0);
    const totalVoices = Object.values(TTS_PROVIDERS).reduce((acc, p) => acc + p.voices.length, 0);
    console.log(`📊 Total: ${totalModels} AI models, ${totalVoices} TTS voices`);
    console.log('='.repeat(50) + '\n');

    client.user.setActivity(`.ai | .help`, { type: ActivityType.Listening });
    loadSettings();
    ensureTempDir();
});

// ==================== ERROR HANDLING ====================

process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
process.on('uncaughtException', (e) => console.error('Uncaught:', e));
process.on('SIGTERM', () => {
    console.log('Shutting down...');
    voiceConnections.forEach((c) => c.destroy());
    client.destroy();
    process.exit(0);
});

// ==================== START ====================

if (!CONFIG.token) {
    console.error('❌ DISCORD_TOKEN not set!');
    process.exit(1);
}

client.login(CONFIG.token);
