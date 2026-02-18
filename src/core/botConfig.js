// src/core/botConfig.js

// ============================================================
//         BOT CONFIGURATION & CONSTANTS
// ============================================================

const BOT_CONFIG = {
    token: process.env.DISCORD_TOKEN,
    prefix: '.',
    adminIds: (process.env.ADMIN_IDS || '').split(',').filter(Boolean),
    
    // Puter TTS Settings
    puterTTS: {
        apiUrl: 'https://puter-tts-api.onrender.com',
        voiceId: 'gmnazjXOFoOcWA59sd5m',
        enabled: false
    },
    
    // File & Storage Settings
    tempPath: './temp',
    maxFileSize: 10 * 1024 * 1024,
    maxImageSize: 5 * 1024 * 1024,
    
    // API Keys
    tavilyApiKey: process.env.TAVILY_API_KEY,
    serperApiKey: process.env.SERPER_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    groqApiKey: process.env.GROQ_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
    pollinationsApiKey: process.env.POLLINATIONS_API_KEY,

    // DevOps Integration
    renderApiKey: process.env.RENDER_API_KEY,
    renderOwnerId: process.env.RENDER_OWNER_ID,
    githubToken: process.env.GITHUB_TOKEN,
    webhookSecret: process.env.WEBHOOK_SECRET,
    notificationChannelId: process.env.NOTIFICATION_CHANNEL_ID,

    // Rate Limiting & Timeouts
    maxConversationMessages: 100,
    maxConversationAge: 7200000,
    rateLimitWindow: 60000,
    rateLimitMax: 30,
    voiceInactivityTimeout: 300000,

    // Voice AI Settings
    voiceAI: {
        enabled: true,
        whisperModel: 'whisper-large-v3-turbo',
        maxRecordingDuration: 30000,
        silenceDuration: 2000,
        minAudioLength: 500,
        supportedLanguages: ['id', 'en']
    },

    // MiniMax Settings (Admin Only)
    minimax: {
        apiKey: process.env.MINIMAX_API_KEY,
        defaultVoiceId: process.env.MINIMAX_VOICE_ID,
        adminOnly: true
    }
};

// ============================================================
//         POLLINATIONS MODELS (SHARED)
// ============================================================

const POLLINATIONS_MODELS = [
    // OpenAI Models
    { id: 'openai', name: 'OpenAI GPT', version: 'GPT-5.2' },
    { id: 'openai-fast', name: 'OpenAI Fast', version: 'GPT-5.2-fast' },
    { id: 'openai-large', name: 'OpenAI Large', version: 'GPT-5.3-Codex' },
    { id: 'openai-reasoning', name: 'OpenAI Reasoning', version: 'o4-mini' },
    { id: 'openai-audio', name: 'OpenAI Audio', version: 'GPT-4o-audio' },
    
    // Claude Models
    { id: 'claude', name: 'Claude', version: 'Claude-3.5' },
    { id: 'claude-fast', name: 'Claude Fast', version: 'Claude-fast' },
    { id: 'claude-large', name: 'Claude Large', version: 'Claude-large' },
    { id: 'claude-haiku', name: 'Claude Haiku', version: 'Haiku-4' },
    { id: 'claude-sonnet', name: 'Claude Sonnet', version: 'Sonnet-4' },
    { id: 'claude-opus', name: 'Claude Opus', version: 'Opus-4.6' },
    
    // Gemini Models
    { id: 'gemini', name: 'Gemini', version: 'Gemini-3-Flash' },
    { id: 'gemini-fast', name: 'Gemini Fast', version: 'Gemini-3-Flash' },
    { id: 'gemini-large', name: 'Gemini Large', version: 'Gemini-3-Pro' },
    { id: 'gemini-search', name: 'Gemini Search', version: 'Gemini-search' },
    { id: 'gemini-legacy', name: 'Gemini Legacy', version: 'Gemini-2.5-Pro' },
    { id: 'gemini-thinking', name: 'Gemini Deep Think', version: 'Deep-Think' },
    
    // DeepSeek Models
    { id: 'deepseek', name: 'DeepSeek', version: 'V3' },
    { id: 'deepseek-v3', name: 'DeepSeek V3', version: 'V3.2' },
    { id: 'deepseek-r1', name: 'DeepSeek R1', version: 'R1' },
    { id: 'deepseek-reasoning', name: 'DeepSeek Reasoning', version: 'R1-Reasoner' },
    
    // Qwen Models
    { id: 'qwen', name: 'Qwen', version: 'Qwen3-32B' },
    { id: 'qwen-coder', name: 'Qwen Coder', version: 'Qwen3-Coder' },
    
    // Llama Models
    { id: 'llama', name: 'Llama', version: 'Llama-3.3-70B' },
    { id: 'llama-4', name: 'Llama 4', version: 'Llama-4-Scout' },
    { id: 'llamalight', name: 'Llama Light', version: 'Llama-70B' },
    
    // Mistral Models
    { id: 'mistral', name: 'Mistral', version: 'Mistral-Small-3.1' },
    { id: 'mistral-small', name: 'Mistral Small', version: 'Mistral-3.2-24B' },
    { id: 'mistral-large', name: 'Mistral Large', version: 'Mistral-Large-123B' },
    
    // Perplexity Models
    { id: 'perplexity-fast', name: 'Perplexity Fast', version: 'Sonar' },
    { id: 'perplexity-reasoning', name: 'Perplexity Reasoning', version: 'Sonar-Pro' },
    
    // Chinese AI Models
    { id: 'kimi', name: 'Kimi', version: 'Kimi-K2' },
    { id: 'kimi-large', name: 'Kimi Large', version: 'Kimi-large' },
    { id: 'kimi-reasoning', name: 'Kimi Reasoning', version: 'Kimi-reasoning' },
    { id: 'glm', name: 'GLM', version: 'GLM-4.5-Air' },
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

// ============================================================
//         AI PROVIDERS & MODELS
// ============================================================

const AI_PROVIDERS = {
    gemini: {
        name: 'Google Gemini',
        models: [
            // GEMINI 3 - MODEL TERBARU
            { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', version: '3.0-pro' },
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', version: '3.0-flash' },
            { id: 'gemini-3-pro', name: 'Gemini 3 Pro', version: '3-pro' },
            { id: 'gemini-3-flash', name: 'Gemini 3 Flash', version: '3-flash' },
            
            // GEMINI 2.5
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', version: '2.5-pro' },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', version: '2.5-flash' },
            { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', version: '2.5-lite' },
            
            // GEMINI 2.0
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', version: '2.0-flash' },
            
            // GEMINI LATEST
            { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', version: 'latest' },
            { id: 'gemini-pro-latest', name: 'Gemini Pro Latest', version: 'latest' },
            
            // GEMMA
            { id: 'gemma-3-27b-it', name: 'Gemma 3 27B', version: '27B' },
            { id: 'gemma-3-12b-it', name: 'Gemma 3 12B', version: '12B' },
            { id: 'gemma-3-4b-it', name: 'Gemma 3 4B', version: '4B' },
            
            // SPECIAL
            { id: 'deep-research-pro-preview-12-2025', name: 'Deep Research Pro', version: 'research' }
        ]
    },

    groq: {
        name: 'Groq',
        models: [
            // LLAMA
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', version: 'v3.3' },
            { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', version: 'v3.1' },
            { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick', version: '17B-128E' },
            { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', version: '17B-16E' },
            
            // GPT-OSS
            { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', version: '120B' },
            { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', version: '20B' },
            
            // MIXTRAL
            { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', version: '8x7B' },
            
            // GEMMA
            { id: 'gemma2-9b-it', name: 'Gemma 2 9B', version: '9B' },
            
            // QWEN
            { id: 'qwen/qwen3-32b', name: 'Qwen 3 32B', version: '32B' },
            
            // KIMI
            { id: 'moonshotai/kimi-k2-instruct-0905', name: 'Kimi K2', version: 'K2' },
            
            // LLAMA TOOL USE
            { id: 'llama-3-groq-70b-tool-use', name: 'Llama 3 70B Tool', version: '70B-tool' },
            { id: 'llama-3-groq-8b-tool-use', name: 'Llama 3 8B Tool', version: '8B-tool' }
        ]
    },

    openrouter: {
        name: 'OpenRouter',
        models: [
            // TRINITY
            { id: 'arcee-ai/trinity-large-preview:free', name: 'Trinity Large Preview (free)', version: 'Large-400B' },
            
            // STEP 3.5
            { id: 'stepfun/step-3.5-flash:free', name: 'Step 3.5 Flash (free)', version: '3.5-Flash' },
            
            // SOLAR
            { id: 'upstage/solar-pro-3:free', name: 'Solar Pro 3 (free)', version: 'Pro-3' },
            
            // LIQUID
            { id: 'liquid/lfm-2.5-1.2b-thinking:free', name: 'LFM2.5-1.2B-Thinking (free)', version: '1.2B' },
            { id: 'liquid/lfm-2.5-1.2b-instruct:free', name: 'LFM2.5-1.2B-Instruct (free)', version: '1.2B' },
            
            // MOLMO
            { id: 'allenai/molmo-2-8b:free', name: 'Molmo2 8B (free)', version: '8B' },
            
            // DEEPSEEK
            { id: 'tngtech/deepseek-r1t-chimera:free', name: 'R1T Chimera (free)', version: 'R1T' },
            { id: 'tngtech/deepseek-r1t2-chimera:free', name: 'DeepSeek R1T2 Chimera (free)', version: 'R1T2' },
            { id: 'deepseek/deepseek-r1-0528:free', name: 'R1 0528 (free)', version: '0528' },
            
            // GLM
            { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air (free)', version: '4.5-Air' },
            
            // UNCENSORED
            { id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free', name: 'Uncensored (free)', version: '24B' },
            
            // GEMMA
            { id: 'google/gemma-3n-e2b-it:free', name: 'Gemma 3n 2B (free)', version: '3n-2B' },
            
            // MISTRAL
            { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1 24B (free)', version: '24B' },
            
            // GEMINI
            { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (free)', version: '2.0-flash' },
            
            // LLAMA
            { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)', version: '70B' },
            { id: 'meta-llama/llama-3.1-405b-instruct:free', name: 'Llama 3.1 405B (free)', version: '405B' },
            
            // QWEN
            { id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder (free)', version: 'Coder' },
            
            // KIMI
            { id: 'moonshotai/kimi-k2:free', name: 'Kimi K2 (free)', version: 'K2' },
            
            // GPT-OSS
            { id: 'openai/gpt-oss-120b:free', name: 'GPT OSS 120B (free)', version: '120B' },
            
            // HERMES
            { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 405B (free)', version: '405B' },
            
            // NVIDIA NEMOTRON
            { id: 'nvidia/nemotron-nano-9b-v2:free', name: 'Nemotron Nano 9B (free)', version: '9B-v2' }
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

// ============================================================
//         VOICE & TTS CONFIGURATIONS
// ============================================================

const EDGE_TTS_VOICES = [
    // Indonesia 
    { id: 'id-ID-ArdiNeural', name: 'Ardi (Pria)', lang: 'id' },
    { id: 'id-ID-GadisNeural', name: 'Gadis (Wanita)', lang: 'id' },
    // English US
    { id: 'en-US-JennyNeural', name: 'Jenny (Female)', lang: 'en' },
    { id: 'en-US-GuyNeural', name: 'Guy (Male)', lang: 'en' },
    // English UK
    { id: 'en-GB-SoniaNeural', name: 'Sonia (Female)', lang: 'en' },
    { id: 'en-GB-RyanNeural', name: 'Ryan (Male)', lang: 'en' },
    // Japanese
    { id: 'ja-JP-NanamiNeural', name: 'Nanami (Female)', lang: 'ja' },
    { id: 'ja-JP-KeitaNeural', name: 'Keita (Male)', lang: 'ja' },
    // Korean
    { id: 'ko-KR-SunHiNeural', name: 'SunHi (Female)', lang: 'ko' },
    { id: 'ko-KR-InJoonNeural', name: 'InJoon (Male)', lang: 'ko' },
    // Chinese
    { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao (Female)', lang: 'zh' },
    { id: 'zh-CN-YunxiNeural', name: 'Yunxi (Male)', lang: 'zh' }
];

const ELEVENLABS_VOICES = [
    // Indonesian Voices
    { id: 'gmnazjXOFoOcWA59sd5m', name: 'Toing (Default)', lang: 'id' },
    { id: 'plgKUYgnlZ1DCNh54DwJ', name: 'Pria Berwibawa', lang: 'id' },
    { id: 'LcvlyuBGMjj1h4uAtQjo', name: 'Wanita Lembut', lang: 'id' },
    { id: 'gjhfBUoH6DHh0DG1X4u0', name: 'Pria Muda', lang: 'id' },
    { id: 'GrxM8OEUWBzyFR2xP2Qd', name: 'Wanita Pro', lang: 'id' },
    { id: 'RbNgJzKAV7jpYJNtCBpj', name: 'Pria Narator', lang: 'id' },
    { id: 'k5eTzx1VYYlp6BE39Qrj', name: 'Wanita Berita', lang: 'id' },
    { id: 'tX4zpyB6s34no1FgD0Mm', name: 'Pria Santai', lang: 'id' },
    { id: 'ACRfKVNOAnzVitkYerdl', name: 'Wanita Ceria', lang: 'id' },
    { id: 'RWiGLY9uXI70QL540WNd', name: 'Pria Serius', lang: 'id' },
    { id: 'X8n8hOy3e8VLQnHTUcc5', name: 'Wanita Elegan', lang: 'id' },
    { id: 'I7sakys8pBZ1Z5f0UhT9', name: 'Pria Ramah', lang: 'id' },
    // English Voices
    { id: 'KoQQbl9zjAdLgKZjm8Ol', name: 'Male Deep', lang: 'en' },
    { id: '6qL48o1LBmtR94hIYAQh', name: 'Female Soft', lang: 'en' },
    { id: 'FVQMzxJGPUBtfz1Azdoy', name: 'Male Energetic', lang: 'en' },
    { id: 'LG95yZDEHg6fCZdQjLqj', name: 'Female Pro', lang: 'en' }
];

// ============================================================
//         SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `Kamu adalah Toing, asisten AI premium yang elegan, cerdas, dan profesional.

## IDENTITAS
- Nama: aria-bot
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

// ============================================================
//         SEARCH TRIGGERS
// ============================================================

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

// ============================================================
//         EXPORTS
// ============================================================

module.exports = {
    BOT_CONFIG,
    AI_PROVIDERS,
    POLLINATIONS_MODELS,
    EDGE_TTS_VOICES,
    ELEVENLABS_VOICES,
    SYSTEM_PROMPT,
    SEARCH_TRIGGERS
};
