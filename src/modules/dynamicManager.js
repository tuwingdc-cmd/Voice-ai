// ============================================================
//         DYNAMIC API & MODEL MANAGER v2.3
//         Full Embed UI + Multi Provider Sync
//         Synced with index.js v2.18.0 models
// ============================================================

const Redis = require('ioredis');
const https = require('https');
const {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

class DynamicManager {
    constructor(redisUrl, adminIds = []) {
        this.adminIds = adminIds;
        this.redis = null;
        this.connected = false;
        
        if (redisUrl) {
            try {
                this.redis = new Redis(redisUrl, {
                    maxRetriesPerRequest: 3,
                    lazyConnect: true,
                    retryDelayOnFailover: 100
                });
                
                this.redis.on('connect', () => {
                    console.log('✅ Redis connected');
                    this.connected = true;
                });
                
                this.redis.on('error', (err) => {
                    console.error('❌ Redis error:', err.message);
                    this.connected = false;
                });
                
                this.redis.on('close', () => {
                    console.warn('⚠️ Redis connection closed');
                    this.connected = false;
                });
                
                this.redis.connect().catch((err) => {
                    console.warn('⚠️ Redis connection failed, using ENV fallback:', err.message);
                    this.connected = false;
                });
            } catch (err) {
                console.warn('⚠️ Redis initialization failed:', err.message);
                this.connected = false;
            }
        } else {
            console.warn('⚠️ No REDIS_URL provided, using ENV fallback');
        }
    }

    // ==================== POLLINATIONS MODELS (SHARED) ====================
    
    getPollinationsModels() {
        return [
            // OpenAI Models
            { id: 'openai', name: 'OpenAI GPT' },
            { id: 'openai-fast', name: 'OpenAI Fast' },
            { id: 'openai-large', name: 'OpenAI Large' },
            { id: 'openai-reasoning', name: 'OpenAI Reasoning (o3-mini)' },
            { id: 'openai-audio', name: 'OpenAI Audio (GPT-4o-audio)' },
            // Claude Models
            { id: 'claude', name: 'Claude' },
            { id: 'claude-fast', name: 'Claude Fast' },
            { id: 'claude-large', name: 'Claude Large' },
            { id: 'claude-haiku', name: 'Claude Haiku' },
            { id: 'claude-sonnet', name: 'Claude Sonnet' },
            { id: 'claude-opus', name: 'Claude Opus' },
            // Gemini Models
            { id: 'gemini', name: 'Gemini' },
            { id: 'gemini-fast', name: 'Gemini Fast' },
            { id: 'gemini-large', name: 'Gemini Large' },
            { id: 'gemini-search', name: 'Gemini Search' },
            { id: 'gemini-legacy', name: 'Gemini Legacy' },
            { id: 'gemini-thinking', name: 'Gemini Thinking' },
            // DeepSeek Models
            { id: 'deepseek', name: 'DeepSeek' },
            { id: 'deepseek-v3', name: 'DeepSeek V3' },
            { id: 'deepseek-r1', name: 'DeepSeek R1' },
            { id: 'deepseek-reasoning', name: 'DeepSeek Reasoning' },
            // Qwen Models
            { id: 'qwen', name: 'Qwen' },
            { id: 'qwen-coder', name: 'Qwen Coder' },
            // Llama Models
            { id: 'llama', name: 'Llama' },
            { id: 'llamalight', name: 'Llama Light (70B)' },
            // Mistral Models
            { id: 'mistral', name: 'Mistral' },
            { id: 'mistral-small', name: 'Mistral Small' },
            { id: 'mistral-large', name: 'Mistral Large' },
            // Perplexity Models
            { id: 'perplexity-fast', name: 'Perplexity Fast' },
            { id: 'perplexity-reasoning', name: 'Perplexity Reasoning' },
            // Chinese AI Models
            { id: 'kimi', name: 'Kimi' },
            { id: 'kimi-large', name: 'Kimi Large' },
            { id: 'kimi-reasoning', name: 'Kimi Reasoning' },
            { id: 'glm', name: 'GLM' },
            { id: 'minimax', name: 'MiniMax' },
            // Grok Models
            { id: 'grok', name: 'Grok' },
            { id: 'grok-fast', name: 'Grok Fast' },
            // Amazon Nova
            { id: 'nova-fast', name: 'Nova Fast (Amazon)' },
            // Microsoft Phi
            { id: 'phi', name: 'Phi (Microsoft)' },
            // Search/Tool Models
            { id: 'searchgpt', name: 'SearchGPT' },
            // Creative/Art Models
            { id: 'midijourney', name: 'Midijourney' },
            { id: 'unity', name: 'Unity' },
            { id: 'rtist', name: 'Rtist' },
            // Special/Character Models
            { id: 'evil', name: 'Evil Mode (Uncensored)' },
            { id: 'p1', name: 'P1' },
            { id: 'hormoz', name: 'Hormoz' },
            { id: 'sur', name: 'Sur' },
            { id: 'bidara', name: 'Bidara' },
            // Education/Utility Models
            { id: 'chickytutor', name: 'ChickyTutor (Education)' },
            { id: 'nomnom', name: 'NomNom (Food)' }
        ];
    }

    // ==================== PROVIDER CONFIGS ====================
    
    getProviders() {
        const pollinationsModels = this.getPollinationsModels();
        
        return {
            gemini: {
                name: 'Google Gemini',
                icon: '🔵',
                keyPrefix: 'AIza',
                syncable: true,
                requiresKey: true,
                defaultModels: [
                    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
                    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
                    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
                    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
                    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
                    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
                    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
                    { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash Preview' },
                    { id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro Preview' }
                ]
            },
            groq: {
                name: 'Groq',
                icon: '🟠',
                keyPrefix: 'gsk_',
                syncable: true,
                requiresKey: true,
                defaultModels: [
                    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile' },
                    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
                    { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B' },
                    { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B' },
                    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
                    { id: 'gemma2-9b-it', name: 'Gemma 2 9B' },
                    { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick' },
                    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout' },
                    { id: 'moonshotai/kimi-k2-instruct-0905', name: 'Kimi K2' },
                    { id: 'qwen/qwen-3-32b', name: 'Qwen 3 32B' },
                    { id: 'llama-3-groq-70b-tool-use', name: 'Llama 3 70B Tool' },
                    { id: 'llama-3-groq-8b-tool-use', name: 'Llama 3 8B Tool' }
                ]
            },
            openrouter: {
                name: 'OpenRouter',
                icon: '🟣',
                keyPrefix: 'sk-or-',
                syncable: true,
                requiresKey: true,
                defaultModels: [
                    { id: 'arcee-ai/trinity-large-preview:free', name: 'Trinity Large Preview (free)' },
                    { id: 'upstage/solar-pro-3:free', name: 'Solar Pro 3 (free)' },
                    { id: 'liquid/lfm-2.5-1.2b-thinking:free', name: 'LFM2.5-1.2B-Thinking (free)' },
                    { id: 'liquid/lfm-2.5-1.2b-instruct:free', name: 'LFM2.5-1.2B-Instruct (free)' },
                    { id: 'allenai/molmo-2-8b:free', name: 'Molmo2 8B (free)' },
                    { id: 'tngtech/deepseek-r1t-chimera:free', name: 'R1T Chimera (free)' },
                    { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air (free)' },
                    { id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free', name: 'Uncensored (free)' },
                    { id: 'google/gemma-3n-e2b-it:free', name: 'Gemma 3n 2B (free)' },
                    { id: 'tngtech/deepseek-r1t2-chimera:free', name: 'DeepSeek R1T2 Chimera (free)' },
                    { id: 'deepseek/deepseek-r1-0528:free', name: 'R1 0528 (free)' },
                    { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1 24B (free)' },
                    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (free)' },
                    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)' },
                    { id: 'meta-llama/llama-3.1-405b-instruct:free', name: 'Llama 3.1 405B (free)' },
                    { id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder (free)' },
                    { id: 'moonshotai/kimi-k2:free', name: 'Kimi K2 (free)' },
                    { id: 'openai/gpt-oss-120b:free', name: 'GPT OSS 120B (free)' },
                    { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 405B (free)' }
                ]
            },
            pollinations_free: {
                name: 'Pollinations (Free)',
                icon: '🌸',
                keyPrefix: '',
                syncable: true,
                requiresKey: false,
                defaultModels: pollinationsModels
            },
            pollinations_api: {
                name: 'Pollinations (API)',
                icon: '🌺',
                keyPrefix: '',
                syncable: true,
                requiresKey: true,
                defaultModels: pollinationsModels
            },
            huggingface: {
                name: 'HuggingFace',
                icon: '🟡',
                keyPrefix: 'hf_',
                syncable: true,
                requiresKey: true,
                defaultModels: [
                    { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B' },
                    { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B' },
                    { id: 'HuggingFaceH4/zephyr-7b-beta', name: 'Zephyr 7B' },
                    { id: 'mistralai/Mistral-7B-Instruct-v0.1', name: 'Mistral 7B' },
                    { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B' },
                    { id: 'google/flan-t5-large', name: 'Flan T5 Large' },
                    { id: 'EleutherAI/gpt-j-6B', name: 'GPT-J 6B' },
                    { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B' },
                    { id: 'google/gemma-2-27b-it', name: 'Gemma 2 27B' }
                ]
            },
            elevenlabs: {
                name: 'ElevenLabs',
                icon: '🎙️',
                keyPrefix: '',
                syncable: false,
                requiresKey: true,
                defaultModels: []
            },
            tavily: {
                name: 'Tavily Search',
                icon: '🔍',
                keyPrefix: 'tvly-',
                syncable: false,
                requiresKey: true,
                defaultModels: []
            },
            serper: {
                name: 'Serper Search',
                icon: '🔎',
                keyPrefix: '',
                syncable: false,
                requiresKey: true,
                defaultModels: []
            }
        };
    }

    // ==================== HELPERS ====================
    
    isAdmin(userId) {
        return this.adminIds.includes(userId);
    }
    
    maskKey(key) {
        if (!key || key.length < 10) return '***';
        return key.slice(0, 8) + '...' + key.slice(-4);
    }
    
    async redisGet(key) {
        if (!this.connected || !this.redis) return null;
        try {
            const data = await this.redis.get(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Redis GET error:', e.message);
            return null;
        }
    }
    
    async redisSet(key, value) {
        if (!this.connected || !this.redis) return false;
        try {
            await this.redis.set(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('Redis SET error:', e.message);
            return false;
        }
    }

    // ==================== API KEY MANAGEMENT ====================
    
    async getApiKeys(provider) {
        const keys = await this.redisGet(`api:${provider}`);
        return Array.isArray(keys) ? keys : [];
    }
    
    async getActiveKey(provider, envFallback = null) {
        try {
            const keys = await this.getApiKeys(provider);
            const now = Date.now();
            
            for (const keyData of keys) {
                if (keyData.status === 'active') {
                    return keyData.key;
                }
                if (keyData.status === 'cooldown' && keyData.cooldownUntil && keyData.cooldownUntil < now) {
                    keyData.status = 'active';
                    await this.redisSet(`api:${provider}`, keys);
                    return keyData.key;
                }
            }
            
            const standby = keys.find(k => k.status === 'standby');
            if (standby) {
                standby.status = 'active';
                await this.redisSet(`api:${provider}`, keys);
                return standby.key;
            }
            
            return envFallback;
        } catch (e) {
            console.error('getActiveKey error:', e.message);
            return envFallback;
        }
    }
    
    async addApiKey(provider, key, label = '') {
        try {
            const keys = await this.getApiKeys(provider);
            
            if (keys.some(k => k.key === key)) {
                return { success: false, error: 'Key sudah ada' };
            }
            
            keys.push({
                key,
                label: label || `Key ${keys.length + 1}`,
                status: keys.length === 0 ? 'active' : 'standby',
                addedAt: Date.now()
            });
            
            const saved = await this.redisSet(`api:${provider}`, keys);
            if (!saved) {
                return { success: false, error: 'Failed to save to Redis' };
            }
            
            return { success: true, total: keys.length };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
    
    async removeApiKey(provider, index) {
        try {
            const keys = await this.getApiKeys(provider);
            
            if (index < 0 || index >= keys.length) {
                return { success: false, error: 'Invalid index' };
            }
            
            keys.splice(index, 1);
            
            if (keys.length > 0 && !keys.some(k => k.status === 'active')) {
                keys[0].status = 'active';
            }
            
            await this.redisSet(`api:${provider}`, keys);
            return { success: true, total: keys.length };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
    
    async rotateKey(provider, cooldownMs = 60000) {
        try {
            const keys = await this.getApiKeys(provider);
            
            if (!keys || keys.length < 2) {
                console.warn(`⚠️ Not enough keys to rotate for ${provider}`);
                return false;
            }
            
            const activeIdx = keys.findIndex(k => k.status === 'active');
            if (activeIdx === -1) {
                console.warn(`⚠️ No active key found for ${provider}`);
                return false;
            }
            
            keys[activeIdx].status = 'cooldown';
            keys[activeIdx].cooldownUntil = Date.now() + cooldownMs;
            
            for (let i = 1; i < keys.length; i++) {
                const nextIdx = (activeIdx + i) % keys.length;
                if (keys[nextIdx].status === 'standby') {
                    keys[nextIdx].status = 'active';
                    await this.redisSet(`api:${provider}`, keys);
                    console.log(`✅ Rotated ${provider} from key ${activeIdx + 1} to key ${nextIdx + 1}`);
                    return true;
                }
            }
            
            console.warn(`⚠️ No standby key available for ${provider}`);
            return false;
        } catch (e) {
            console.error('rotateKey error:', e.message);
            return false;
        }
    }
    
    async getPoolStatus() {
        const providers = Object.keys(this.getProviders());
        const status = {};
        
        for (const provider of providers) {
            try {
                const keys = await this.getApiKeys(provider);
                const models = await this.getModels(provider);
                status[provider] = {
                    keys: keys.length,
                    active: keys.filter(k => k.status === 'active').length,
                    models: models.length
                };
            } catch (e) {
                status[provider] = { keys: 0, active: 0, models: 0 };
            }
        }
        return status;
    }

    // ==================== MODEL MANAGEMENT ====================
    
    async getModels(provider) {
        try {
            const models = await this.redisGet(`models:${provider}`);
            if (models && Array.isArray(models) && models.length > 0) {
                return models;
            }
            
            const providerConfig = this.getProviders()[provider];
            return providerConfig?.defaultModels || [];
        } catch (e) {
            const providerConfig = this.getProviders()[provider];
            return providerConfig?.defaultModels || [];
        }
    }
    
    async addModel(provider, id, name) {
        try {
            const models = await this.redisGet(`models:${provider}`) || [];
            
            if (models.some(m => m.id === id)) {
                return { success: false, error: 'Model sudah ada' };
            }
            
            models.push({ id, name, addedAt: Date.now() });
            await this.redisSet(`models:${provider}`, models);
            return { success: true, total: models.length };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
    
    async removeModel(provider, id) {
        try {
            const models = await this.redisGet(`models:${provider}`) || [];
            const idx = models.findIndex(m => m.id === id);
            
            if (idx === -1) return { success: false, error: 'Model tidak ditemukan' };
            
            models.splice(idx, 1);
            await this.redisSet(`models:${provider}`, models);
            return { success: true, total: models.length };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
    
    async syncModels(provider) {
        const providers = this.getProviders();
        const config = providers[provider];
        
        if (!config) return { success: false, error: 'Provider tidak valid' };
        
        if (provider === 'openrouter') {
            return this.syncOpenRouterModels();
        }
        
        if (config.defaultModels?.length > 0) {
            await this.redisSet(`models:${provider}`, config.defaultModels);
            return { success: true, count: config.defaultModels.length };
        }
        
        return { success: false, error: 'Tidak ada models untuk sync' };
    }
    
    async syncOpenRouterModels() {
        return new Promise((resolve) => {
            const req = https.get('https://openrouter.ai/api/v1/models', { timeout: 15000 }, (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', async () => {
                    try {
                        if (res.statusCode !== 200) {
                            resolve({ success: false, error: `HTTP ${res.statusCode}` });
                            return;
                        }
                        
                        const json = JSON.parse(data);
                        if (!json.data || !Array.isArray(json.data)) {
                            resolve({ success: false, error: 'Invalid response format' });
                            return;
                        }
                        
                        const models = json.data
                            .filter(m => m.id && m.id.includes(':free'))
                            .map(m => ({
                                id: m.id,
                                name: m.name || m.id.split('/').pop().replace(':free', ' (free)')
                            }))
                            .slice(0, 50);
                        
                        if (models.length === 0) {
                            resolve({ success: false, error: 'No free models found' });
                            return;
                        }
                        
                        await this.redisSet('models:openrouter', models);
                        resolve({ success: true, count: models.length });
                    } catch (e) {
                        resolve({ success: false, error: e.message });
                    }
                });
            });
            
            req.on('error', (e) => resolve({ success: false, error: e.message }));
            req.on('timeout', () => {
                req.destroy();
                resolve({ success: false, error: 'Timeout' });
            });
        });
    }

    // ==================== EMBED UI ====================
    
    createMainEmbed(status) {
        const providers = this.getProviders();
        let apiList = '';
        let modelList = '';
        
        for (const [key, config] of Object.entries(providers)) {
            const s = status[key] || { keys: 0, models: 0, active: 0 };
            
            if (!config.requiresKey) {
                apiList += `${config.icon} **${config.name}**: 🟢 Free\n`;
            } else {
                const keyIcon = s.keys > 0 ? (s.active > 0 ? '🟢' : '🟡') : '⚫';
                apiList += `${config.icon} **${config.name}**: ${keyIcon} ${s.keys} keys\n`;
            }
            
            if (s.models > 0) {
                modelList += `${config.icon} ${config.name}: ${s.models}\n`;
            }
        }
        
        return new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📦 Dynamic API & Model Manager')
            .setDescription('Kelola API keys dan AI models tanpa restart')
            .addFields(
                { name: '🔑 API Keys', value: apiList || '*Belum ada*', inline: true },
                { name: '🤖 Models', value: modelList || '*Belum ada*', inline: true },
                { name: '📊 Status', value: `Redis: ${this.connected ? '🟢 Connected' : '🔴 Offline (using ENV)'}`, inline: false }
            )
            .setFooter({ text: 'v2.3 • Synced with index.js v2.18.0' })
            .setTimestamp();
    }
    
    createMainMenu() {
        return [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('dm_main_menu')
                    .setPlaceholder('📋 Pilih Menu')
                    .addOptions([
                        { label: '🔑 Kelola API Keys', value: 'api_menu', description: 'Tambah/hapus API keys' },
                        { label: '🤖 Kelola Models', value: 'model_menu', description: 'Tambah/hapus AI models' },
                        { label: '🔄 Sync All Models', value: 'sync_all', description: 'Sync models dari semua provider' },
                        { label: '📊 Pool Status', value: 'pool_status', description: 'Lihat status detail' }
                    ])
            )
        ];
    }
    
    createProviderSelect(type) {
        const providers = this.getProviders();
        const options = Object.entries(providers)
            .filter(([key, config]) => {
                if (type === 'api') {
                    return config.requiresKey;
                }
                return config.syncable;
            })
            .map(([key, config]) => ({
                label: config.name,
                value: key,
                emoji: config.icon
            }));
        
        return [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`dm_select_${type}`)
                    .setPlaceholder(`Pilih Provider`)
                    .addOptions(options.slice(0, 25))
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('dm_back_main').setLabel('⬅️ Kembali').setStyle(ButtonStyle.Secondary)
            )
        ];
    }
    
    async createApiKeyEmbed(provider) {
        const providers = this.getProviders();
        const config = providers[provider];
        
        if (!config) {
            return new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Provider tidak ditemukan')
                .setDescription(`Provider "${provider}" tidak valid`);
        }
        
        if (!config.requiresKey) {
            return new EmbedBuilder()
                .setColor(0x2ECC71)
                .setTitle(`${config.icon} ${config.name}`)
                .setDescription('✅ Provider ini **GRATIS** dan tidak memerlukan API key!')
                .setTimestamp();
        }
        
        const keys = await this.getApiKeys(provider);
        
        let keyList = '';
        if (keys.length > 0) {
            keys.forEach((k, i) => {
                const statusIcon = k.status === 'active' ? '🟢' : (k.status === 'cooldown' ? '🔴' : '🟡');
                keyList += `${i + 1}. ${statusIcon} \`${this.maskKey(k.key)}\` - ${k.label || 'Key ' + (i + 1)}\n`;
            });
        } else {
            keyList = '*Belum ada API key*';
        }
        
        return new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle(`${config.icon} ${config.name} - API Keys`)
            .setDescription(keyList)
            .addFields(
                { name: '📝 Format Key', value: `Prefix: \`${config.keyPrefix || 'any'}\``, inline: true },
                { name: '📊 Total', value: `${keys.length} keys`, inline: true }
            )
            .setFooter({ text: 'Gunakan tombol di bawah untuk mengelola' })
            .setTimestamp();
    }
    
    createApiKeyButtons(provider) {
        const providers = this.getProviders();
        const config = providers[provider];
        
        if (!config?.requiresKey) {
            return [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('dm_back_main').setLabel('⬅️ Kembali').setStyle(ButtonStyle.Secondary)
                )
            ];
        }
        
        return [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`dm_addkey_${provider}`).setLabel('➕ Tambah Key').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`dm_removekey_${provider}`).setLabel('➖ Hapus Key').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`dm_testkey_${provider}`).setLabel('🧪 Test Key').setStyle(ButtonStyle.Primary)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('dm_back_main').setLabel('⬅️ Kembali').setStyle(ButtonStyle.Secondary)
            )
        ];
    }
    
    async createModelEmbed(provider) {
        const providers = this.getProviders();
        const config = providers[provider];
        
        if (!config) {
            return new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Provider tidak ditemukan')
                .setDescription(`Provider "${provider}" tidak valid`);
        }
        
        const models = await this.getModels(provider);
        
        let modelList = '';
        if (models.length > 0) {
            models.slice(0, 15).forEach((m, i) => {
                modelList += `${i + 1}. \`${m.id}\`\n   └ ${m.name}\n`;
            });
            if (models.length > 15) {
                modelList += `\n... dan ${models.length - 15} lainnya`;
            }
        } else {
            modelList = '*Belum ada model - Gunakan Sync*';
        }
        
        return new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle(`${config.icon} ${config.name} - Models`)
            .setDescription(modelList)
            .addFields(
                { name: '📊 Total', value: `${models.length} models`, inline: true },
                { name: '🔄 Syncable', value: config.syncable ? 'Ya' : 'Tidak', inline: true }
            )
            .setFooter({ text: 'Gunakan tombol di bawah untuk mengelola' })
            .setTimestamp();
    }
    
    createModelButtons(provider) {
        const providers = this.getProviders();
        const config = providers[provider];
        
        const buttons = [
            new ButtonBuilder().setCustomId(`dm_addmodel_${provider}`).setLabel('➕ Tambah Model').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`dm_removemodel_${provider}`).setLabel('➖ Hapus Model').setStyle(ButtonStyle.Danger)
        ];
        
        if (config?.syncable) {
            buttons.push(
                new ButtonBuilder().setCustomId(`dm_sync_${provider}`).setLabel('🔄 Sync Models').setStyle(ButtonStyle.Primary)
            );
        }
        
        return [
            new ActionRowBuilder().addComponents(buttons),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`dm_clearmodels_${provider}`).setLabel('🗑️ Clear All').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('dm_back_main').setLabel('⬅️ Kembali').setStyle(ButtonStyle.Secondary)
            )
        ];
    }
    
    createInputModal(type, provider, title) {
        const modal = new ModalBuilder()
            .setCustomId(`dm_modal_${type}_${provider}`)
            .setTitle(title.slice(0, 45));
        
        if (type === 'addkey') {
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('api_key')
                        .setLabel('API Key')
                        .setPlaceholder('Masukkan API key...')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('key_label')
                        .setLabel('Label (opsional)')
                        .setPlaceholder('Contoh: Key Utama, Key Backup')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                )
            );
        } else if (type === 'addmodel') {
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('model_id')
                        .setLabel('Model ID')
                        .setPlaceholder('Contoh: gemini-2.0-flash')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('model_name')
                        .setLabel('Nama Model')
                        .setPlaceholder('Contoh: Gemini 2.0 Flash')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                )
            );
        } else if (type === 'removekey' || type === 'removemodel') {
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('item_number')
                        .setLabel('Nomor yang akan dihapus')
                        .setPlaceholder('Contoh: 1')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(2)
                )
            );
        }
        
        return modal;
    }

    // ==================== MAIN HANDLERS ====================
    
    async showMainMenu(msg) {
        if (!this.isAdmin(msg.author.id)) {
            return msg.reply('❌ Hanya admin yang bisa mengakses');
        }
        
        try {
            const status = await this.getPoolStatus();
            await msg.reply({
                embeds: [this.createMainEmbed(status)],
                components: this.createMainMenu()
            });
        } catch (e) {
            console.error('showMainMenu error:', e);
            await msg.reply('❌ Gagal menampilkan menu');
        }
    }
    
    async handleInteraction(interaction) {
        if (!this.isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ Admin only', ephemeral: true });
        }
        
        const customId = interaction.customId;
        
        try {
            if (interaction.isModalSubmit()) {
                return this.handleModalSubmit(interaction);
            }
            
            if (customId === 'dm_main_menu') {
                const value = interaction.values[0];
                
                if (value === 'api_menu') {
                    await interaction.update({
                        content: '**🔑 Pilih Provider untuk API Key:**',
                        embeds: [],
                        components: this.createProviderSelect('api')
                    });
                }
                else if (value === 'model_menu') {
                    await interaction.update({
                        content: '**🤖 Pilih Provider untuk Models:**',
                        embeds: [],
                        components: this.createProviderSelect('model')
                    });
                }
                else if (value === 'sync_all') {
                    await interaction.deferUpdate();
                    const syncProviders = ['openrouter', 'groq', 'gemini', 'pollinations_free', 'pollinations_api', 'huggingface'];
                    let results = [];
                    for (const p of syncProviders) {
                        const r = await this.syncModels(p);
                        results.push(`${p}: ${r.success ? `✅ ${r.count}` : `❌`}`);
                    }
                    await interaction.followUp({
                        content: `**🔄 Sync Results:**\n${results.join('\n')}`,
                        ephemeral: true
                    });
                }
                else if (value === 'pool_status') {
                    const status = await this.getPoolStatus();
                    let text = '**📊 Detail Pool Status:**\n\n';
                    for (const [p, s] of Object.entries(status)) {
                        if (s.keys > 0 || s.models > 0) {
                            text += `**${p}**: ${s.keys} keys, ${s.models} models\n`;
                        }
                    }
                    await interaction.reply({ content: text || 'Belum ada data', ephemeral: true });
                }
            }
            
            else if (customId === 'dm_select_api') {
                const provider = interaction.values[0];
                await interaction.update({
                    content: null,
                    embeds: [await this.createApiKeyEmbed(provider)],
                    components: this.createApiKeyButtons(provider)
                });
            }
            
            else if (customId === 'dm_select_model') {
                const provider = interaction.values[0];
                await interaction.update({
                    content: null,
                    embeds: [await this.createModelEmbed(provider)],
                    components: this.createModelButtons(provider)
                });
            }
            
            else if (customId === 'dm_back_main') {
                const status = await this.getPoolStatus();
                await interaction.update({
                    content: null,
                    embeds: [this.createMainEmbed(status)],
                    components: this.createMainMenu()
                });
            }
            
            else if (customId.startsWith('dm_addkey_')) {
                const provider = customId.replace('dm_addkey_', '');
                const modal = this.createInputModal('addkey', provider, `Tambah API Key - ${provider}`);
                await interaction.showModal(modal);
            }
            
            else if (customId.startsWith('dm_removekey_')) {
                const provider = customId.replace('dm_removekey_', '');
                const modal = this.createInputModal('removekey', provider, `Hapus API Key - ${provider}`);
                await interaction.showModal(modal);
            }
            
            else if (customId.startsWith('dm_testkey_')) {
                const provider = customId.replace('dm_testkey_', '');
                const key = await this.getActiveKey(provider);
                await interaction.reply({
                    content: key ? `✅ Active key: \`${this.maskKey(key)}\`` : '❌ Tidak ada active key',
                    ephemeral: true
                });
            }
            
            else if (customId.startsWith('dm_addmodel_')) {
                const provider = customId.replace('dm_addmodel_', '');
                const modal = this.createInputModal('addmodel', provider, `Tambah Model - ${provider}`);
                await interaction.showModal(modal);
            }
            
            else if (customId.startsWith('dm_removemodel_')) {
                const provider = customId.replace('dm_removemodel_', '');
                const modal = this.createInputModal('removemodel', provider, `Hapus Model - ${provider}`);
                await interaction.showModal(modal);
            }
            
            else if (customId.startsWith('dm_sync_')) {
                const provider = customId.replace('dm_sync_', '');
                await interaction.deferUpdate();
                const result = await this.syncModels(provider);
                
                await interaction.editReply({
                    embeds: [await this.createModelEmbed(provider)],
                    components: this.createModelButtons(provider)
                });
                await interaction.followUp({
                    content: result.success ? `✅ Synced ${result.count} models` : `❌ ${result.error}`,
                    ephemeral: true
                });
            }
            
            else if (customId.startsWith('dm_clearmodels_')) {
                const provider = customId.replace('dm_clearmodels_', '');
                await this.redisSet(`models:${provider}`, []);
                await interaction.update({
                    embeds: [await this.createModelEmbed(provider)],
                    components: this.createModelButtons(provider)
                });
            }
            
        } catch (e) {
            console.error('DM Interaction Error:', e);
            const reply = { content: `❌ Error: ${e.message}`, ephemeral: true };
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply);
                } else {
                    await interaction.reply(reply);
                }
            } catch (err) {
                console.error('Failed to send error reply:', err.message);
            }
        }
    }
    
    async handleModalSubmit(interaction) {
        try {
            if (!interaction.customId || !interaction.customId.startsWith('dm_modal_')) {
                return interaction.reply({ content: '❌ Invalid modal ID', ephemeral: true });
            }
            
            const parts = interaction.customId.split('_');
            if (parts.length < 4) {
                return interaction.reply({ content: '❌ Malformed modal customId', ephemeral: true });
            }
            
            const type = parts[2];
            const provider = parts.slice(3).join('_');
            
            if (!this.getProviders()[provider]) {
                return interaction.reply({ content: `❌ Provider ${provider} tidak valid`, ephemeral: true });
            }
            
            if (type === 'addkey') {
                const apiKey = interaction.fields.getTextInputValue('api_key');
                const label = interaction.fields.getTextInputValue('key_label') || '';
                
                const result = await this.addApiKey(provider, apiKey, label);
                
                await interaction.update({
                    embeds: [await this.createApiKeyEmbed(provider)],
                    components: this.createApiKeyButtons(provider)
                });
                
                await interaction.followUp({
                    content: result.success ? `✅ API key ditambahkan! Total: ${result.total}` : `❌ ${result.error}`,
                    ephemeral: true
                });
            }
            
            else if (type === 'removekey') {
                const idx = parseInt(interaction.fields.getTextInputValue('item_number')) - 1;
                const result = await this.removeApiKey(provider, idx);
                
                await interaction.update({
                    embeds: [await this.createApiKeyEmbed(provider)],
                    components: this.createApiKeyButtons(provider)
                });
                
                if (!result.success) {
                    await interaction.followUp({ content: `❌ ${result.error}`, ephemeral: true });
                }
            }
            
            else if (type === 'addmodel') {
                const modelId = interaction.fields.getTextInputValue('model_id');
                const modelName = interaction.fields.getTextInputValue('model_name');
                
                const result = await this.addModel(provider, modelId, modelName);
                
                await interaction.update({
                    embeds: [await this.createModelEmbed(provider)],
                    components: this.createModelButtons(provider)
                });
                
                await interaction.followUp({
                    content: result.success ? `✅ Model ditambahkan! Total: ${result.total}` : `❌ ${result.error}`,
                    ephemeral: true
                });
            }
            
            else if (type === 'removemodel') {
                const idx = parseInt(interaction.fields.getTextInputValue('item_number')) - 1;
                const models = await this.getModels(provider);
                
                if (idx >= 0 && idx < models.length) {
                    const result = await this.removeModel(provider, models[idx].id);
                    await interaction.update({
                        embeds: [await this.createModelEmbed(provider)],
                        components: this.createModelButtons(provider)
                    });
                    if (!result.success) {
                        await interaction.followUp({ content: `❌ ${result.error}`, ephemeral: true });
                    }
                } else {
                    await interaction.reply({ content: '❌ Nomor tidak valid', ephemeral: true });
                }
            }
            
        } catch (e) {
            console.error('Modal Submit Error:', e);
            try {
                await interaction.reply({ content: `❌ Error: ${e.message}`, ephemeral: true });
            } catch (err) {
                console.error('Failed to reply modal error:', err.message);
            }
        }
    }

    // ==================== QUICK COMMANDS ====================
    
    async quickAddApi(msg, args) {
        if (!this.isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
        msg.reply('💡 Gunakan `.manage` untuk menambah API key dengan aman via UI');
    }
    
    async quickListApi(msg) {
        if (!this.isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
        const status = await this.getPoolStatus();
        let text = '**🔑 API Key Pools:**\n\n';
        for (const [p, s] of Object.entries(status)) {
            if (s.keys > 0) text += `• **${p}**: ${s.keys} keys (${s.active} active)\n`;
        }
        text += '\n**🌸 Free Providers:**\n• pollinations_free: 🟢 No key needed';
        await msg.reply(text || 'Belum ada API keys');
    }
    
    async quickAddModel(msg, args) {
        if (!this.isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
        msg.reply('💡 Gunakan `.manage` untuk menambah model via UI');
    }
    
    async quickSyncModels(msg, provider) {
        if (!this.isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
        if (!provider) {
            return msg.reply('❓ `.syncmodels <provider>`\nProviders: openrouter, groq, gemini, pollinations_free, pollinations_api, huggingface');
        }
        
        const status = await msg.reply('🔄 Syncing...');
        const result = await this.syncModels(provider.toLowerCase());
        await status.edit(result.success ? `✅ Synced ${result.count} models` : `❌ ${result.error}`);
    }
}

module.exports = DynamicManager;
