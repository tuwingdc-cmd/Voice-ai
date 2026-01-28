// ============================================================
//         DISCORD AI BOT - MULTI PROVIDER v2.6
//         Command: .ai | Mention Support | Plain Text Response
//         Memory: 1 Hour / 30 Messages | Universal Voice
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
    PermissionFlagsBits
} = require('discord.js');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    getVoiceConnection
} = require('@discordjs/voice');
const { exec } = require('child_process');
const { createServer } = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ==================== KONFIGURASI ====================
const CONFIG = {
    token: process.env.DISCORD_TOKEN,
    prefix: '.',
    adminIds: (process.env.ADMIN_IDS || '').split(',').filter(Boolean),
    dataPath: './data/settings.json',
    // Conversation settings
    conversationTimeout: 60 * 60 * 1000, // 1 hour in milliseconds
    maxConversationMessages: 30 // Max messages before soft reset
};

// ==================== SYSTEM PROMPT ====================
const MASTER_SYSTEM_PROMPT = `Kamu adalah Aria, asisten AI yang cerdas dan menyenangkan.

## KEPRIBADIAN INTI:
- **Bijaksana & Berpengetahuan**: Kamu memiliki pengetahuan luas tentang berbagai topik. Jelaskan dengan detail yang cukup, bukan jawaban super singkat.
- **Jujur & Transparan**: JANGAN pernah mengarang fakta atau berhalusinasi. Jika tidak tahu, katakan "Saya tidak yakin tentang itu" atau "Saya perlu informasi lebih lanjut".
- **Profesional tapi Friendly**: Bisa serius saat diperlukan, tapi juga bisa bercanda dan santai.
- **Empati & Helpful**: Pahami konteks dan kebutuhan user, berikan jawaban yang benar-benar membantu.

## GAYA KOMUNIKASI:
- Gunakan bahasa Indonesia yang natural dan mengalir
- Jawaban cukup lengkap (3-6 kalimat untuk pertanyaan umum, lebih panjang untuk topik kompleks)
- Boleh pakai sedikit emoji untuk ekspresi, tapi jangan berlebihan
- Bisa pakai humor ringan yang sopan
- Untuk coding: berikan kode yang clean, commented, dan penjelasan singkat

## ATURAN PENTING:
1. JANGAN mengarang informasi yang tidak kamu ketahui
2. Akui keterbatasan dengan jujur
3. Jika diminta pendapat, berikan perspektif seimbang
4. Ingat konteks percakapan sebelumnya
5. Untuk voice mode: jawab lebih ringkas (2-4 kalimat)

## CONTOH RESPONS YANG BAIK:
- User: "Apa itu AI?"
- Aria: "AI atau Artificial Intelligence adalah teknologi yang memungkinkan mesin untuk 'berpikir' dan belajar seperti manusia. Bayangkan seperti otak digital yang bisa mengenali pola, membuat keputusan, dan bahkan ngobrol kayak kita sekarang 😄 Ada banyak jenisnya, dari yang sederhana kayak filter spam email, sampai yang kompleks kayak self-driving car. Ada yang mau kamu ketahui lebih dalam?"`;

// ==================== AI PROVIDERS ====================
const AI_PROVIDERS = {
    // ========== GROQ - Updated July 2025 ==========
    groq: {
        name: 'Groq',
        requiresKey: true,
        keyEnv: 'GROQ_API_KEY',
        models: [
            // === Production Models ===
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', version: 'v3.3', category: 'production' },
            { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', version: 'v3.1', category: 'production' },
            { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', version: '120B', category: 'production' },
            { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', version: '20B', category: 'production' },
            
            // === Production Systems ===
            { id: 'groq/compound', name: 'Groq Compound', version: 'v1-system', category: 'system' },
            { id: 'groq/compound-mini', name: 'Groq Compound Mini', version: 'mini-system', category: 'system' },
            
            // === Preview Models ===
            { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', version: '32B', category: 'preview' },
            { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick', version: '17B-128E', category: 'preview' },
            { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', version: '17B-16E', category: 'preview' },
            { id: 'moonshotai/kimi-k2-instruct-0905', name: 'Kimi K2', version: '0905', category: 'preview' },
            { id: 'openai/gpt-oss-safeguard-20b', name: 'GPT OSS Safeguard', version: '20B-safe', category: 'preview' },
            
            // === Guard Models ===
            { id: 'meta-llama/llama-guard-4-12b', name: 'Llama Guard 4', version: '12B', category: 'guard' },
            { id: 'meta-llama/llama-prompt-guard-2-22m', name: 'Prompt Guard 2', version: '22M', category: 'guard' },
            { id: 'meta-llama/llama-prompt-guard-2-86m', name: 'Prompt Guard 2 Large', version: '86M', category: 'guard' },
            
            // === TTS Models (Canopy Labs) ===
            { id: 'canopylabs/orpheus-v1-english', name: 'Orpheus English TTS', version: 'v1', category: 'tts' },
            { id: 'canopylabs/orpheus-arabic-saudi', name: 'Orpheus Arabic TTS', version: 'saudi', category: 'tts' },
            
            // === Whisper (Speech-to-Text) ===
            { id: 'whisper-large-v3', name: 'Whisper Large V3', version: 'v3', category: 'stt' },
            { id: 'whisper-large-v3-turbo', name: 'Whisper Large V3 Turbo', version: 'v3-turbo', category: 'stt' }
        ]
    },
    
    // ========== POLLINATIONS FREE ==========
    pollinations_free: {
        name: 'Pollinations (Free)',
        requiresKey: false,
        models: [
            { id: 'openai', name: 'OpenAI GPT', version: 'GPT-4.1-nano' },
            { id: 'openai-large', name: 'OpenAI Large', version: 'GPT-4.1-large' },
            { id: 'openai-reasoning', name: 'OpenAI Reasoning', version: 'o3-mini' },
            { id: 'qwen', name: 'Qwen', version: 'Qwen3' },
            { id: 'qwen-coder', name: 'Qwen Coder', version: 'Qwen3-Coder' },
            { id: 'llama', name: 'Llama', version: 'Llama-3.3' },
            { id: 'mistral', name: 'Mistral', version: 'Mistral-Small' },
            { id: 'mistral-large', name: 'Mistral Large', version: 'Mistral-Large' },
            { id: 'deepseek', name: 'DeepSeek', version: 'V3' },
            { id: 'deepseek-r1', name: 'DeepSeek R1', version: 'R1' },
            { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', version: 'R1-Reasoner' },
            { id: 'gemini', name: 'Gemini', version: '2.5-Pro' },
            { id: 'gemini-thinking', name: 'Gemini Thinking', version: '2.5-Thinking' },
            { id: 'claude-hybridspace', name: 'Claude Hybridspace', version: 'Claude-3.5' },
            { id: 'phi', name: 'Phi', version: 'Phi-4' },
            { id: 'unity', name: 'Unity', version: 'v1' },
            { id: 'searchgpt', name: 'SearchGPT', version: 'v1' },
            { id: 'llamalight', name: 'Llama Light', version: 'Llama-3.3-70B' }
        ]
    },
    
    // ========== POLLINATIONS API ==========
    pollinations_api: {
        name: 'Pollinations (API)',
        requiresKey: true,
        keyEnv: 'POLLINATIONS_API_KEY',
        models: [
            { id: 'openai', name: 'OpenAI GPT', version: 'GPT-4.1' },
            { id: 'openai-fast', name: 'OpenAI Fast', version: 'GPT-4.1-fast' },
            { id: 'openai-large', name: 'OpenAI Large', version: 'GPT-4.1-large' },
            { id: 'claude', name: 'Claude', version: 'Claude-3.5' },
            { id: 'claude-fast', name: 'Claude Fast', version: 'Claude-3.5-fast' },
            { id: 'gemini', name: 'Gemini', version: '2.5-Pro' },
            { id: 'deepseek', name: 'DeepSeek', version: 'V3' }
        ]
    },
    
    // ========== OPENROUTER - Updated July 2025 ==========
    openrouter: {
        name: 'OpenRouter',
        requiresKey: true,
        keyEnv: 'OPENROUTER_API_KEY',
        models: [
            // === January 2026 Models ===
            { id: 'aetherclood/trinity-large-preview:free', name: 'Trinity Large Preview', version: 'preview-free', category: 'jan2026' },
            { id: 'upstage/solar-pro-3:free', name: 'Solar Pro 3', version: 'v3-free', category: 'jan2026' },
            { id: 'liquid/lfm-2.5-1.2b-thinking:free', name: 'LFM 2.5 Thinking', version: '1.2B-think', category: 'jan2026' },
            { id: 'liquid/lfm-2.5-1.2b-instruct:free', name: 'LFM 2.5 Instruct', version: '1.2B-inst', category: 'jan2026' },
            { id: 'black-forest-labs/flux-2-klein-4b', name: 'FLUX.2 Klein 4B', version: '4B', category: 'jan2026' },
            { id: 'allenai/molmo-2-8b:free', name: 'Molmo2 8B', version: '8B-free', category: 'jan2026' },
            
            // === December 2025 Models ===
            { id: 'deepseek/deepseek-r1t-chimera:free', name: 'R1T Chimera', version: 'R1T-free', category: 'dec2025' },
            { id: 'black-forest-labs/flux-2-flex', name: 'FLUX.2 Flex', version: 'flex', category: 'dec2025' },
            { id: 'black-forest-labs/flux-2-pro', name: 'FLUX.2 Pro', version: 'pro', category: 'dec2025' },
            
            // === October 2025 Models ===
            { id: 'nvidia/nemotron-nano-12b-2-vl:free', name: 'Nemotron Nano 12B 2 VL', version: '12B-VL', category: 'oct2025' },
            
            // === September 2025 Models ===
            { id: 'nvidia/nemotron-nano-9b-v2:free', name: 'Nemotron Nano 9B V2', version: '9B-v2', category: 'sep2025' },
            { id: 'thudm/glm-4.5-air:free', name: 'GLM 4.5 Air', version: '4.5-air', category: 'sep2025' },
            { id: 'google/gemma-3n-2b:free', name: 'Gemma 3n 2B', version: '3n-2B', category: 'sep2025' },
            { id: 'deepseek/deepseek-r1t2-chimera:free', name: 'DeepSeek R1T2 Chimera', version: 'R1T2', category: 'sep2025' },
            
            // === May 2025 Models ===
            { id: 'deepseek/deepseek-r1-0528:free', name: 'DeepSeek R1 0528', version: 'R1-0528', category: 'may2025' },
            { id: 'google/gemma-3n-4b:free', name: 'Gemma 3n 4B', version: '3n-4B', category: 'may2025' },
            
            // === March 2025 Models ===
            { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1 24B', version: '24B-free', category: 'mar2025' },
            { id: 'google/gemma-3-4b-it:free', name: 'Gemma 3 4B', version: '4B-free', category: 'mar2025' },
            { id: 'google/gemma-3-12b-it:free', name: 'Gemma 3 12B', version: '12B-free', category: 'mar2025' },
            { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B', version: '27B-free', category: 'mar2025' },
            
            // === Original Models ===
            { id: 'qwen/qwen3-4b:free', name: 'Qwen3 4B', version: '4B-free', category: 'qwen' },
            { id: 'qwen/qwen3-14b:free', name: 'Qwen3 14B', version: '14B-free', category: 'qwen' },
            { id: 'qwen/qwen3-32b:free', name: 'Qwen3 32B', version: '32B-free', category: 'qwen' },
            { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B', version: '72B-free', category: 'qwen' },
            
            { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', version: 'R1-free', category: 'deepseek' },
            { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3', version: 'V3-free', category: 'deepseek' },
            
            { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', version: '2.0-free', category: 'google' },
            
            { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 3B', version: '3B-free', category: 'meta' },
            { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', version: '70B-free', category: 'meta' },
            
            { id: 'mistralai/mistral-nemo:free', name: 'Mistral Nemo', version: 'Nemo-free', category: 'mistral' },
            
            { id: 'nvidia/llama-3.1-nemotron-70b-instruct:free', name: 'Nemotron 70B', version: '70B-free', category: 'nvidia' },
            
            { id: 'thudm/glm-4-9b:free', name: 'GLM 4 9B', version: '9B-free', category: 'thudm' },
            { id: 'thudm/glm-z1-32b:free', name: 'GLM Z1 32B', version: '32B-free', category: 'thudm' },
            
            { id: 'microsoft/phi-3-mini-128k-instruct:free', name: 'Phi-3 Mini', version: 'mini-free', category: 'microsoft' },
            { id: 'microsoft/phi-3-medium-128k-instruct:free', name: 'Phi-3 Medium', version: 'medium-free', category: 'microsoft' },
            
            { id: 'openchat/openchat-7b:free', name: 'OpenChat 7B', version: '7B-free', category: 'other' }
        ]
    },
    
    // ========== HUGGINGFACE ==========
    huggingface: {
        name: 'HuggingFace',
        requiresKey: true,
        keyEnv: 'HUGGINGFACE_API_KEY',
        models: [
            { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B', version: '3.1-8B' },
            { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B', version: '7B-v0.3' },
            { id: 'microsoft/Phi-3-mini-4k-instruct', name: 'Phi-3 Mini', version: 'mini-4k' },
            { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', version: '2.5-72B' }
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
            { id: 'en-US-JennyNeural', name: 'Jenny (EN Female)', lang: 'en' },
            { id: 'en-US-GuyNeural', name: 'Guy (EN Male)', lang: 'en' },
            { id: 'en-US-AriaNeural', name: 'Aria (EN Female)', lang: 'en' },
            { id: 'ja-JP-NanamiNeural', name: 'Nanami (JP Female)', lang: 'ja' },
            { id: 'ko-KR-SunHiNeural', name: 'SunHi (KR Female)', lang: 'ko' },
            { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao (CN Female)', lang: 'zh' }
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
    },
    groq_tts: {
        name: 'Groq TTS (Orpheus)',
        requiresKey: true,
        keyEnv: 'GROQ_API_KEY',
        voices: [
            { id: 'canopylabs/orpheus-v1-english', name: 'Orpheus English', lang: 'en' },
            { id: 'canopylabs/orpheus-arabic-saudi', name: 'Orpheus Arabic', lang: 'ar' }
        ]
    }
};

// ==================== DEFAULT SETTINGS ====================
const DEFAULT_SETTINGS = {
    aiProvider: 'pollinations_free',
    aiModel: 'openai',
    ttsProvider: 'edge',
    ttsVoice: 'id-ID-GadisNeural',
    mode: 'voice',
    systemPrompt: MASTER_SYSTEM_PROMPT
};

// ==================== CLIENT & STORAGE ====================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
    ]
});

const guildSettings = new Map();
const voiceConnections = new Map();
const audioPlayers = new Map();

// ==================== CONVERSATION MEMORY SYSTEM ====================
// Structure: { messages: [], lastActivity: Date, messageCount: number }
const conversations = new Map();

function getConversation(guildId, userId) {
    const key = `${guildId}-${userId}`;
    const now = Date.now();
    
    if (conversations.has(key)) {
        const conv = conversations.get(key);
        const timeSinceLastActivity = now - conv.lastActivity;
        
        // Reset if timeout (1 hour) OR too many messages (30+)
        if (timeSinceLastActivity > CONFIG.conversationTimeout) {
            console.log(`🔄 Conversation reset for ${key} (timeout)`);
            conversations.delete(key);
        } else if (conv.messageCount >= CONFIG.maxConversationMessages) {
            // Soft reset - keep last 10 messages for context continuity
            console.log(`🔄 Conversation soft reset for ${key} (max messages)`);
            conv.messages = conv.messages.slice(-10);
            conv.messageCount = 10;
        }
    }
    
    if (!conversations.has(key)) {
        conversations.set(key, {
            messages: [],
            lastActivity: now,
            messageCount: 0,
            createdAt: now
        });
    }
    
    return conversations.get(key);
}

function addToConversation(guildId, userId, role, content) {
    const conv = getConversation(guildId, userId);
    conv.messages.push({ role, content });
    conv.lastActivity = Date.now();
    conv.messageCount++;
    
    // Keep max 30 messages in memory
    if (conv.messages.length > 30) {
        conv.messages = conv.messages.slice(-30);
    }
    
    return conv;
}

function clearConversation(guildId, userId) {
    const key = `${guildId}-${userId}`;
    conversations.delete(key);
}

function getConversationInfo(guildId, userId) {
    const key = `${guildId}-${userId}`;
    if (!conversations.has(key)) return null;
    
    const conv = conversations.get(key);
    const age = Date.now() - conv.createdAt;
    const remaining = CONFIG.conversationTimeout - (Date.now() - conv.lastActivity);
    
    return {
        messageCount: conv.messageCount,
        ageMinutes: Math.floor(age / 60000),
        remainingMinutes: Math.max(0, Math.floor(remaining / 60000)),
        messagesUntilReset: CONFIG.maxConversationMessages - conv.messageCount
    };
}

// Cleanup old conversations periodically
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    conversations.forEach((conv, key) => {
        if (now - conv.lastActivity > CONFIG.conversationTimeout) {
            conversations.delete(key);
            cleaned++;
        }
    });
    if (cleaned > 0) console.log(`🧹 Cleaned ${cleaned} expired conversations`);
}, 10 * 60 * 1000); // Every 10 minutes

// ==================== UTILITIES ====================
function removeEmojisForTTS(text) {
    return text
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
        .replace(/[\u{2600}-\u{27BF}]/gu, '')
        .replace(/[\u{1F000}-\u{1F02F}]/gu, '')
        .replace(/[\u{1F0A0}-\u{1F0FF}]/gu, '')
        .replace(/[\u{1F100}-\u{1F64F}]/gu, '')
        .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
        .replace(/[\u{1F900}-\u{1FAFF}]/gu, '')
        .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
        .replace(/:[a-zA-Z0-9_]+:/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function loadSettings() {
    try {
        if (fs.existsSync(CONFIG.dataPath)) {
            const data = JSON.parse(fs.readFileSync(CONFIG.dataPath, 'utf8'));
            Object.entries(data).forEach(([id, s]) => guildSettings.set(id, { ...DEFAULT_SETTINGS, ...s }));
            console.log(`📂 Loaded ${guildSettings.size} guild settings`);
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

function isAdmin(userId) { return CONFIG.adminIds.includes(userId); }

function getModelInfo(provider, modelId) {
    const p = AI_PROVIDERS[provider];
    if (!p) return { name: modelId, version: '?' };
    return p.models.find(m => m.id === modelId) || { name: modelId, version: '?' };
}

// Split long messages for Discord (max 2000 chars)
function splitMessage(text, maxLength = 1900) {
    if (text.length <= maxLength) return [text];
    
    const parts = [];
    let remaining = text;
    
    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            parts.push(remaining);
            break;
        }
        
        // Find a good breaking point
        let splitIndex = remaining.lastIndexOf('\n', maxLength);
        if (splitIndex === -1 || splitIndex < maxLength / 2) {
            splitIndex = remaining.lastIndexOf('. ', maxLength);
        }
        if (splitIndex === -1 || splitIndex < maxLength / 2) {
            splitIndex = remaining.lastIndexOf(' ', maxLength);
        }
        if (splitIndex === -1) {
            splitIndex = maxLength;
        }
        
        parts.push(remaining.slice(0, splitIndex + 1));
        remaining = remaining.slice(splitIndex + 1);
    }
    
    return parts;
}

// ==================== HTTP ====================
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

// ==================== AI PROVIDERS ====================
async function callAI(guildId, userId, userMessage, isVoiceMode = false) {
    const s = getSettings(guildId);
    const { aiProvider, aiModel, systemPrompt } = s;
    const start = Date.now();
    
    // Get conversation history
    const conv = getConversation(guildId, userId);
    const history = conv.messages;
    
    // Modify system prompt for voice mode
    let finalSystemPrompt = systemPrompt;
    if (isVoiceMode) {
        finalSystemPrompt += '\n\n[MODE: Voice Response - Jawab dengan ringkas, 2-4 kalimat saja]';
    }
    
    try {
        let response;
        switch (aiProvider) {
            case 'groq': response = await callGroq(aiModel, userMessage, history, finalSystemPrompt); break;
            case 'pollinations_free': response = await callPollinationsFree(aiModel, userMessage, history, finalSystemPrompt); break;
            case 'pollinations_api': response = await callPollinationsAPI(aiModel, userMessage, history, finalSystemPrompt); break;
            case 'openrouter': response = await callOpenRouter(aiModel, userMessage, history, finalSystemPrompt); break;
            case 'huggingface': response = await callHuggingFace(aiModel, userMessage, history, finalSystemPrompt); break;
            default: response = await callPollinationsFree('openai', userMessage, history, finalSystemPrompt);
        }
        
        // Add to conversation memory
        addToConversation(guildId, userId, 'user', userMessage);
        addToConversation(guildId, userId, 'assistant', response);
        
        const info = getModelInfo(aiProvider, aiModel);
        return {
            text: response,
            provider: AI_PROVIDERS[aiProvider]?.name || aiProvider,
            model: info.name,
            version: info.version,
            latency: Date.now() - start
        };
    } catch (error) {
        console.error(`AI Error (${aiProvider}):`, error.message);
        if (aiProvider !== 'pollinations_free') {
            console.log('Fallback to Pollinations Free...');
            const fallback = await callPollinationsFree('openai', userMessage, history, finalSystemPrompt);
            addToConversation(guildId, userId, 'user', userMessage);
            addToConversation(guildId, userId, 'assistant', fallback);
            return {
                text: fallback,
                provider: 'Pollinations Free (Fallback)',
                model: 'OpenAI GPT',
                version: 'GPT-4.1-nano',
                latency: Date.now() - start
            };
        }
        throw error;
    }
}

async function callGroq(model, message, history, systemPrompt) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not set');
    
    const modelInfo = AI_PROVIDERS.groq.models.find(m => m.id === model);
    if (modelInfo && ['guard', 'tts', 'stt'].includes(modelInfo.category)) {
        throw new Error(`Model ${model} is not a chat model`);
    }
    
    const messages = [
        { role: 'system', content: systemPrompt }, 
        ...history.slice(-20), 
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
    if (result.error) throw new Error(result.error.message);
    return result.choices[0].message.content;
}

async function callPollinationsFree(model, message, history, systemPrompt) {
    let prompt = systemPrompt + '\n\n';
    history.slice(-12).forEach(m => prompt += m.role === 'user' ? `User: ${m.content}\n` : `Assistant: ${m.content}\n`);
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
                } else reject(new Error(`HTTP ${res.statusCode}`));
            });
        }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
    });
}

async function callPollinationsAPI(model, message, history, systemPrompt) {
    const apiKey = process.env.POLLINATIONS_API_KEY;
    if (!apiKey) throw new Error('POLLINATIONS_API_KEY not set');
    
    const messages = [
        { role: 'system', content: systemPrompt }, 
        ...history.slice(-20), 
        { role: 'user', content: message }
    ];
    
    const { data, statusCode } = await httpRequest({
        hostname: 'gen.pollinations.ai',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    }, JSON.stringify({ model, messages, max_tokens: 2000, temperature: 0.7, stream: false }));
    
    if (statusCode !== 200) throw new Error(`HTTP ${statusCode}`);
    const result = JSON.parse(data);
    if (result.error) throw new Error(result.error.message);
    return result.choices[0].message.content;
}

async function callOpenRouter(model, message, history, systemPrompt) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');
    
    const messages = [
        { role: 'system', content: systemPrompt }, 
        ...history.slice(-20), 
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
    }, JSON.stringify({ model, messages, max_tokens: 2000, temperature: 0.7, stream: false }));
    
    if (statusCode === 401) throw new Error('Invalid API key');
    if (statusCode === 402) throw new Error('Insufficient credits');
    if (statusCode === 429) throw new Error('Rate limited');
    if (statusCode !== 200) {
        try {
            const result = JSON.parse(data);
            throw new Error(result.error?.message || `HTTP ${statusCode}`);
        } catch {
            throw new Error(`HTTP ${statusCode}`);
        }
    }
    
    const result = JSON.parse(data);
    if (result.error) throw new Error(result.error.message);
    return result.choices[0].message.content;
}

async function callHuggingFace(model, message, history, systemPrompt) {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) throw new Error('HUGGINGFACE_API_KEY not set');
    
    let prompt = systemPrompt + '\n\n';
    history.slice(-10).forEach(m => prompt += m.role === 'user' ? `User: ${m.content}\n` : `Assistant: ${m.content}\n`);
    prompt += `User: ${message}\nAssistant:`;
    
    const { data } = await httpRequest({
        hostname: 'api-inference.huggingface.co',
        path: `/models/${model}`,
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    }, JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 1000 } }));
    
    const result = JSON.parse(data);
    if (result.error) throw new Error(result.error);
    const text = Array.isArray(result) ? result[0].generated_text : result.generated_text;
    return text.split('Assistant:').pop().trim();
}

// ==================== TTS ====================
async function generateTTS(guildId, text) {
    const s = getSettings(guildId);
    const clean = removeEmojisForTTS(text);
    if (!clean || clean.length < 2) return null;
    
    if (!fs.existsSync('./temp')) fs.mkdirSync('./temp', { recursive: true });
    const output = `./temp/tts_${Date.now()}.mp3`;
    
    try {
        switch (s.ttsProvider) {
            case 'edge': return await genEdgeTTS(clean, s.ttsVoice, output);
            case 'pollinations': return await genPollinationsTTS(clean, s.ttsVoice, output);
            case 'elevenlabs': return await genElevenLabsTTS(clean, s.ttsVoice, output);
            case 'groq_tts': return await genGroqTTS(clean, s.ttsVoice, output);
            default: return await genEdgeTTS(clean, 'id-ID-GadisNeural', output);
        }
    } catch (e) {
        console.error(`TTS Error:`, e.message);
        if (s.ttsProvider !== 'edge') return await genEdgeTTS(clean, 'id-ID-GadisNeural', output);
        throw e;
    }
}

function genEdgeTTS(text, voice, output) {
    const safe = text.replace(/"/g, "'").replace(/`/g, "'").replace(/\$/g, '').slice(0, 500);
    return new Promise((resolve, reject) => {
        exec(`edge-tts --voice "${voice}" --text "${safe}" --write-media "${output}"`, { timeout: 30000 }, 
            err => err ? reject(err) : resolve(output));
    });
}

function genPollinationsTTS(text, voice, output) {
    const encoded = encodeURIComponent(text.slice(0, 500));
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(output);
        https.get(`https://text.pollinations.ai/${encoded}?model=openai-audio&voice=${voice}`, res => {
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(output); });
        }).on('error', reject);
    });
}

async function genElevenLabsTTS(text, voiceId, output) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');
    
    const response = await httpRequestBinary({
        hostname: 'api.elevenlabs.io',
        path: `/v1/text-to-speech/${voiceId}`,
        method: 'POST',
        headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': apiKey }
    }, JSON.stringify({ text: text.slice(0, 500), model_id: 'eleven_multilingual_v2' }));
    
    fs.writeFileSync(output, response);
    return output;
}

async function genGroqTTS(text, model, output) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not set');
    console.log(`Groq TTS requested with model: ${model}`);
    return genEdgeTTS(text, 'en-US-AriaNeural', output);
}

// ==================== VOICE FUNCTIONS ====================
async function joinUserVoiceChannel(member, guild) {
    const vc = member?.voice?.channel;
    if (!vc) return { success: false, error: 'User not in voice channel' };
    
    try {
        // Check if already connected to this channel
        const existingConn = getVoiceConnection(guild.id);
        if (existingConn && existingConn.joinConfig.channelId === vc.id) {
            return { success: true, channel: vc, alreadyConnected: true };
        }
        
        // Destroy existing connection if in different channel
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
        
        return { success: true, channel: vc };
    } catch (e) {
        console.error('Voice join error:', e);
        return { success: false, error: e.message };
    }
}

async function leaveVoiceChannel(guild) {
    const conn = voiceConnections.get(guild.id) || getVoiceConnection(guild.id);
    if (!conn) return false;
    
    conn.destroy();
    voiceConnections.delete(guild.id);
    audioPlayers.delete(guild.id);
    return true;
}

async function playTTSInVoice(guildId, text) {
    const player = audioPlayers.get(guildId);
    if (!player) return false;
    
    try {
        const audio = await generateTTS(guildId, text);
        if (!audio) return false;
        
        const resource = createAudioResource(audio);
        player.play(resource);
        
        player.once(AudioPlayerStatus.Idle, () => {
            try { fs.unlinkSync(audio); } catch(e) {}
        });
        
        return true;
    } catch (e) {
        console.error('TTS playback error:', e.message);
        return false;
    }
}

// ==================== EMBEDS & MENUS (for settings only) ====================
function createSettingsEmbed(guildId) {
    const s = getSettings(guildId);
    const ai = AI_PROVIDERS[s.aiProvider];
    const tts = TTS_PROVIDERS[s.ttsProvider];
    const m = getModelInfo(s.aiProvider, s.aiModel);
    const totalModels = Object.values(AI_PROVIDERS).reduce((acc, p) => acc + p.models.length, 0);
    
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Aria Settings')
        .setDescription(`Total **${totalModels}** models • Memory: 1 jam / 30 pesan`)
        .addFields(
            { name: '🧠 AI Provider', value: `**${ai?.name}**\n${m.name} (${m.version})`, inline: true },
            { name: '🔊 TTS Provider', value: `**${tts?.name}**\n${s.ttsVoice}`, inline: true },
            { name: '📝 Mode', value: s.mode === 'voice' ? '🔊 Voice + Text' : '📝 Text Only', inline: true }
        )
        .setFooter({ text: 'Gunakan menu di bawah untuk mengubah settings' })
        .setTimestamp();
}

function createAIProviderMenu(guildId) {
    const s = getSettings(guildId);
    const opts = Object.entries(AI_PROVIDERS).map(([k, p]) => {
        const available = !p.requiresKey || process.env[p.keyEnv];
        const chatModels = p.models.filter(m => !['guard', 'tts', 'stt'].includes(m.category)).length;
        return {
            label: p.name.slice(0, 25), 
            value: k, 
            description: `${chatModels} chat models`,
            default: k === s.aiProvider,
            emoji: available ? '🟢' : '🔴'
        };
    });
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_ai').setPlaceholder('🧠 Select AI Provider').addOptions(opts)
    );
}

function createAIModelMenu(guildId) {
    const s = getSettings(guildId);
    const p = AI_PROVIDERS[s.aiProvider];
    if (!p) return null;
    
    const chatModels = p.models.filter(m => !['guard', 'tts', 'stt'].includes(m.category));
    const opts = chatModels.slice(0, 25).map(m => ({
        label: m.name.slice(0, 25), 
        description: `${m.version}${m.category ? ` • ${m.category}` : ''}`.slice(0, 50), 
        value: m.id, 
        default: m.id === s.aiModel
    }));
    
    if (opts.length === 0) return null;
    
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_model').setPlaceholder('🤖 Select Model').addOptions(opts)
    );
}

function createTTSProviderMenu(guildId) {
    const s = getSettings(guildId);
    const opts = Object.entries(TTS_PROVIDERS).map(([k, p]) => ({
        label: p.name, 
        value: k, 
        description: `${p.voices.length} voices`,
        default: k === s.ttsProvider,
        emoji: (!p.requiresKey || process.env[p.keyEnv]) ? '🟢' : '🔴'
    }));
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_tts').setPlaceholder('🔊 Select TTS Provider').addOptions(opts)
    );
}

function createTTSVoiceMenu(guildId) {
    const s = getSettings(guildId);
    const p = TTS_PROVIDERS[s.ttsProvider];
    if (!p) return null;
    const opts = p.voices.slice(0, 25).map(v => ({ 
        label: v.name, 
        description: `Language: ${v.lang}`,
        value: v.id, 
        default: v.id === s.ttsVoice 
    }));
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_voice').setPlaceholder('🎤 Select Voice').addOptions(opts)
    );
}

function createModeButtons(guildId) {
    const s = getSettings(guildId);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mode_text').setLabel('📝 Text Only').setStyle(s.mode === 'text' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('mode_voice').setLabel('🔊 Voice + Text').setStyle(s.mode === 'voice' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
    );
}

// ==================== MAIN AI HANDLER ====================
async function handleAIMessage(msg, query) {
    const guildId = msg.guild.id;
    const userId = msg.author.id;
    const s = getSettings(guildId);
    
    // Check if user is in voice channel and auto-join
    const isVoiceMode = s.mode === 'voice';
    let inVoice = false;
    
    if (isVoiceMode && msg.member?.voice?.channel) {
        const result = await joinUserVoiceChannel(msg.member, msg.guild);
        if (result.success) {
            inVoice = true;
            if (!result.alreadyConnected) {
                // Don't notify, just join silently
            }
        }
    }
    
    // Show typing indicator
    await msg.channel.sendTyping();
    
    try {
        const response = await callAI(guildId, userId, query, inVoice);
        
        // Format response as plain text with model info
        const modelInfo = `*${response.model} • ${response.latency}ms*`;
        const fullResponse = `${response.text}\n\n-# ${modelInfo}`;
        
        // Split if too long
        const parts = splitMessage(fullResponse);
        
        for (let i = 0; i < parts.length; i++) {
            if (i === 0) {
                await msg.reply(parts[i]);
            } else {
                await msg.channel.send(parts[i]);
            }
        }
        
        // Play TTS if in voice
        if (inVoice) {
            await playTTSInVoice(guildId, response.text);
        }
        
    } catch (e) {
        console.error('AI Error:', e);
        await msg.reply(`Maaf, ada error: ${e.message}`);
    }
}

// ==================== COMMAND HANDLERS ====================
async function showSettings(msg) {
    if (!isAdmin(msg.author.id)) {
        return msg.reply('❌ Hanya admin yang bisa akses settings');
    }
    
    const guildId = msg.guild.id;
    const comps = [
        createAIProviderMenu(guildId), 
        createAIModelMenu(guildId), 
        createTTSProviderMenu(guildId), 
        createTTSVoiceMenu(guildId), 
        createModeButtons(guildId)
    ].filter(Boolean);
    
    await msg.reply({ embeds: [createSettingsEmbed(guildId)], components: comps });
}

async function showHelp(msg) {
    const helpText = `**🤖 Aria AI Bot - Bantuan**

**Chat dengan AI:**
• \`.ai <pertanyaan>\` - Tanya apa saja
• \`@Aria <pertanyaan>\` - Mention langsung

**Voice:**
• \`.join\` - Gabung ke voice channel kamu
• \`.leave\` - Keluar dari voice
• Bot otomatis join saat kamu di voice (mode voice)

**Lainnya:**
• \`.memory\` - Cek status memori percakapan
• \`.clear\` - Hapus memori percakapan
• \`.status\` - Lihat provider yang aktif
• \`.settings\` - Pengaturan (admin only)

**Tips:**
• Bot mengingat 30 pesan terakhir atau 1 jam
• Di voice mode, jawaban lebih singkat & dibacakan`;
    
    await msg.reply(helpText);
}

async function showStatus(msg) {
    let text = '**📊 Status Provider**\n\n**AI:**\n';
    Object.entries(AI_PROVIDERS).forEach(([k, p]) => {
        const ok = !p.requiresKey || process.env[p.keyEnv];
        const chatModels = p.models.filter(m => !['guard', 'tts', 'stt'].includes(m.category)).length;
        text += `${ok ? '🟢' : '🔴'} ${p.name} (${chatModels} model)\n`;
    });
    text += '\n**TTS:**\n';
    Object.entries(TTS_PROVIDERS).forEach(([k, p]) => {
        const ok = !p.requiresKey || process.env[p.keyEnv];
        text += `${ok ? '🟢' : '🔴'} ${p.name} (${p.voices.length} voice)\n`;
    });
    
    await msg.reply(text);
}

async function showMemoryStatus(msg) {
    const info = getConversationInfo(msg.guild.id, msg.author.id);
    
    if (!info) {
        return msg.reply('📭 Belum ada percakapan aktif dengan kamu.');
    }
    
    const text = `**🧠 Status Memori Percakapan**

📝 Pesan tersimpan: **${info.messageCount}** / ${CONFIG.maxConversationMessages}
⏱️ Usia percakapan: **${info.ageMinutes}** menit
⏳ Reset otomatis dalam: **${info.remainingMinutes}** menit
📊 Pesan sampai soft-reset: **${info.messagesUntilReset}**

_Gunakan \`.clear\` untuk reset manual_`;
    
    await msg.reply(text);
}

// ==================== INTERACTION HANDLER ====================
client.on('interactionCreate', async (int) => {
    if (!int.isStringSelectMenu() && !int.isButton()) return;
    if (!isAdmin(int.user.id)) return int.reply({ content: '❌ Admin only', ephemeral: true });
    
    const guildId = int.guild.id;
    
    try {
        if (int.customId === 'sel_ai') {
            const p = AI_PROVIDERS[int.values[0]];
            if (!p) return int.reply({ content: '❌ Invalid provider', ephemeral: true });
            if (p.requiresKey && !process.env[p.keyEnv]) return int.reply({ content: `❌ ${p.keyEnv} not configured`, ephemeral: true });
            
            updateSettings(guildId, 'aiProvider', int.values[0]);
            const chatModels = p.models.filter(m => !['guard', 'tts', 'stt'].includes(m.category));
            if (chatModels.length > 0) {
                updateSettings(guildId, 'aiModel', chatModels[0].id);
            }
        } else if (int.customId === 'sel_model') {
            updateSettings(guildId, 'aiModel', int.values[0]);
        } else if (int.customId === 'sel_tts') {
            const p = TTS_PROVIDERS[int.values[0]];
            if (!p) return int.reply({ content: '❌ Invalid TTS provider', ephemeral: true });
            if (p.requiresKey && !process.env[p.keyEnv]) return int.reply({ content: `❌ ${p.keyEnv} not configured`, ephemeral: true });
            updateSettings(guildId, 'ttsProvider', int.values[0]);
            updateSettings(guildId, 'ttsVoice', p.voices[0].id);
        } else if (int.customId === 'sel_voice') {
            updateSettings(guildId, 'ttsVoice', int.values[0]);
        } else if (int.customId === 'mode_text') {
            updateSettings(guildId, 'mode', 'text');
        } else if (int.customId === 'mode_voice') {
            updateSettings(guildId, 'mode', 'voice');
        }
        
        const comps = [
            createAIProviderMenu(guildId), 
            createAIModelMenu(guildId), 
            createTTSProviderMenu(guildId), 
            createTTSVoiceMenu(guildId), 
            createModeButtons(guildId)
        ].filter(Boolean);
        
        await int.update({ embeds: [createSettingsEmbed(guildId)], components: comps });
    } catch (e) { 
        console.error('Interaction error:', e); 
        try {
            await int.reply({ content: `❌ Error: ${e.message}`, ephemeral: true });
        } catch {}
    }
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (msg) => {
    // Ignore bots
    if (msg.author.bot) return;
    
    // Check if mentioned
    const isMentioned = msg.mentions.has(client.user);
    
    // Get content without mention
    let content = msg.content;
    if (isMentioned) {
        content = content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
    }
    
    // Handle mention as AI query
    if (isMentioned && content) {
        return handleAIMessage(msg, content);
    }
    
    // Handle prefix commands
    if (!content.startsWith(CONFIG.prefix)) return;
    
    const args = content.slice(CONFIG.prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    
    try {
        switch (cmd) {
            // Main AI command
            case 'ai':
            case 'ask':
            case 'chat':
            case 'tanya':
                const query = args.join(' ');
                if (!query) return msg.reply('❓ Contoh: `.ai apa itu javascript?`');
                await handleAIMessage(msg, query);
                break;
            
            // Voice commands
            case 'join':
            case 'j':
                const joinResult = await joinUserVoiceChannel(msg.member, msg.guild);
                if (joinResult.success) {
                    if (joinResult.alreadyConnected) {
                        await msg.reply(`✅ Sudah ada di **${joinResult.channel.name}**`);
                    } else {
                        await msg.reply(`🔊 Bergabung ke **${joinResult.channel.name}**`);
                    }
                } else {
                    await msg.reply(`❌ Gagal: ${joinResult.error}`);
                }
                break;
            
            case 'leave':
            case 'dc':
            case 'disconnect':
                const left = await leaveVoiceChannel(msg.guild);
                await msg.reply(left ? '👋 Keluar dari voice channel' : '❌ Tidak ada di voice channel');
                break;
            
            // Settings & info
            case 'settings':
            case 'config':
            case 'setup':
                await showSettings(msg);
                break;
            
            case 'status':
            case 'provider':
            case 'providers':
                await showStatus(msg);
                break;
            
            case 'memory':
            case 'mem':
            case 'ingatan':
                await showMemoryStatus(msg);
                break;
            
            case 'clear':
            case 'reset':
            case 'forget':
            case 'lupa':
                clearConversation(msg.guild.id, msg.author.id);
                await msg.reply('🗑️ Memori percakapan dihapus. Kita mulai dari awal ya!');
                break;
            
            case 'help':
            case 'h':
            case 'bantuan':
                await showHelp(msg);
                break;
            
            case 'ping':
                const latency = Date.now() - msg.createdTimestamp;
                await msg.reply(`🏓 Pong! Latency: ${latency}ms | API: ${client.ws.ping}ms`);
                break;
        }
    } catch (e) { 
        console.error('Command error:', e); 
        await msg.reply(`❌ Error: ${e.message}`);
    }
});

// ==================== READY ====================
client.once('ready', () => {
    console.log('\n' + '='.repeat(50));
    console.log(`🤖 ${client.user.tag} is online!`);
    console.log(`📡 Serving ${client.guilds.cache.size} servers`);
    console.log(`📦 Version 2.6 - Plain Text + Memory`);
    console.log(`🎯 Prefix: ${CONFIG.prefix} | Mention: @${client.user.username}`);
    console.log('='.repeat(50) + '\n');
    
    console.log('🧠 AI Providers:');
    Object.entries(AI_PROVIDERS).forEach(([k, p]) => {
        const ok = !p.requiresKey || process.env[p.keyEnv];
        const chatModels = p.models.filter(m => !['guard', 'tts', 'stt'].includes(m.category)).length;
        console.log(`  ${ok ? '🟢' : '🔴'} ${p.name} (${chatModels} chat / ${p.models.length} total)`);
    });
    
    console.log('\n🔊 TTS Providers:');
    Object.entries(TTS_PROVIDERS).forEach(([k, p]) => {
        const ok = !p.requiresKey || process.env[p.keyEnv];
        console.log(`  ${ok ? '🟢' : '🔴'} ${p.name} (${p.voices.length} voices)`);
    });
    
    const totalModels = Object.values(AI_PROVIDERS).reduce((acc, p) => acc + p.models.length, 0);
    console.log(`\n📊 Total: ${totalModels} models available`);
    console.log(`⏱️ Memory: ${CONFIG.conversationTimeout/60000} min / ${CONFIG.maxConversationMessages} messages\n`);
    
    client.user.setActivity(`.ai | @${client.user.username}`, { type: ActivityType.Listening });
    loadSettings();
});

// ==================== HEALTH CHECK SERVER ====================
createServer((req, res) => {
    const status = {
        status: 'ok',
        bot: client.user?.tag,
        version: '2.6',
        uptime: process.uptime(),
        guilds: client.guilds.cache.size,
        conversations: conversations.size,
        providers: {
            ai: Object.keys(AI_PROVIDERS).length,
            tts: Object.keys(TTS_PROVIDERS).length
        },
        models: Object.values(AI_PROVIDERS).reduce((acc, p) => acc + p.models.length, 0)
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
}).listen(process.env.PORT || 3000, () => console.log('🌐 Health check server ready\n'));

// ==================== ERROR HANDLING ====================
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

// ==================== START BOT ====================
if (!CONFIG.token) { 
    console.error('❌ DISCORD_TOKEN environment variable not set!'); 
    process.exit(1); 
}

client.login(CONFIG.token);
