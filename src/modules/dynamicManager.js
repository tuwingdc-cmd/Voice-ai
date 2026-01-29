// ============================================================
//         DYNAMIC API & MODEL MANAGER v2.0
//         Full Embed UI + Multi Provider Sync
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
        this.pendingApiKey = new Map(); // Untuk collect API key
        
        if (redisUrl) {
            this.redis = new Redis(redisUrl, {
                maxRetriesPerRequest: 3,
                lazyConnect: true
            });
            
            this.redis.on('connect', () => {
                console.log('✅ Redis connected');
                this.connected = true;
            });
            
            this.redis.on('error', (err) => {
                console.error('❌ Redis error:', err.message);
                this.connected = false;
            });
            
            this.redis.connect().catch(() => {});
        }
    }

    // ==================== PROVIDER CONFIGS ====================
    
    getProviders() {
    return {
        gemini: {
            name: 'Google Gemini',
            icon: '🔵',
            keyPrefix: 'AIza',
            syncable: true,
            defaultModels: [
                { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
                { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
                { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
                { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
                { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
                { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' }
            ]
        },
        groq: {
            name: 'Groq',
            icon: '🟠',
            keyPrefix: 'gsk_',
            syncable: true,
            defaultModels: [
                { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
                { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B' },
                { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B' },
                { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
                { id: 'gemma2-9b-it', name: 'Gemma 2 9B' }
            ]
        },
        openrouter: {
            name: 'OpenRouter',
            icon: '🟣',
            keyPrefix: 'sk-or-',
            syncable: true,
            syncUrl: 'https://openrouter.ai/api/v1/models'
        },
        pollinations: {
            name: 'Pollinations',
            icon: '🌸',
            keyPrefix: '',
            syncable: true,
            defaultModels: [
                { id: 'openai', name: 'OpenAI GPT' },
                { id: 'openai-fast', name: 'OpenAI Fast' },
                { id: 'openai-large', name: 'OpenAI Large' },
                { id: 'openai-reasoning', name: 'OpenAI Reasoning' },
                { id: 'claude', name: 'Claude' },
                { id: 'claude-fast', name: 'Claude Fast' },
                { id: 'claude-large', name: 'Claude Large' },
                { id: 'claude-haiku', name: 'Claude Haiku' },
                { id: 'claude-sonnet', name: 'Claude Sonnet' },
                { id: 'gemini', name: 'Gemini' },
                { id: 'gemini-fast', name: 'Gemini Fast' },
                { id: 'gemini-large', name: 'Gemini Large' },
                { id: 'gemini-thinking', name: 'Gemini Thinking' },
                { id: 'deepseek', name: 'DeepSeek' },
                { id: 'deepseek-r1', name: 'DeepSeek R1' },
                { id: 'deepseek-reasoning', name: 'DeepSeek Reasoning' },
                { id: 'qwen', name: 'Qwen' },
                { id: 'qwen-coder', name: 'Qwen Coder' },
                { id: 'llama', name: 'Llama' },
                { id: 'mistral', name: 'Mistral' },
                { id: 'mistral-large', name: 'Mistral Large' },
                { id: 'grok', name: 'Grok' },
                { id: 'kimi', name: 'Kimi' },
                { id: 'searchgpt', name: 'SearchGPT' },
                { id: 'evil', name: 'Evil Mode' }
            ]
        },
        huggingface: {
            name: 'HuggingFace',
            icon: '🟡',
            keyPrefix: 'hf_',
            syncable: false,
            defaultModels: [
                { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B' },
                { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B' },
                { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B' },
                { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B' }
            ]
        },
        elevenlabs: {
            name: 'ElevenLabs',
            icon: '🎙️',
            keyPrefix: '',
            syncable: false,
            defaultModels: []
        },
        tavily: {
            name: 'Tavily Search',
            icon: '🔍',
            keyPrefix: 'tvly-',
            syncable: false,
            defaultModels: []
        },
        serper: {
            name: 'Serper Search',
            icon: '🔎',
            keyPrefix: '',
            syncable: false,
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
        if (!this.connected) return null;
        try {
            const data = await this.redis.get(key);
            return data ? JSON.parse(data) : null;
        } catch (e) { return null; }
    }
    
    async redisSet(key, value) {
        if (!this.connected) return false;
        try {
            await this.redis.set(key, JSON.stringify(value));
            return true;
        } catch (e) { return false; }
    }

    // ==================== API KEY MANAGEMENT ====================
    
    async getApiKeys(provider) {
        return await this.redisGet(`api:${provider}`) || [];
    }
    
    async getActiveKey(provider, envFallback = null) {
        const keys = await this.getApiKeys(provider);
        const now = Date.now();
        
        for (const keyData of keys) {
            if (keyData.status === 'active') return keyData.key;
            if (keyData.status === 'cooldown' && keyData.cooldownUntil < now) {
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
    }
    
    async addApiKey(provider, key, label = '') {
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
        
        await this.redisSet(`api:${provider}`, keys);
        return { success: true, total: keys.length };
    }
    
    async removeApiKey(provider, index) {
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
    }
    
    async rotateKey(provider, cooldownMs = 60000) {
        const keys = await this.getApiKeys(provider);
        if (keys.length < 2) return false;
        
        const activeIdx = keys.findIndex(k => k.status === 'active');
        if (activeIdx === -1) return false;
        
        keys[activeIdx].status = 'cooldown';
        keys[activeIdx].cooldownUntil = Date.now() + cooldownMs;
        
        for (let i = 1; i < keys.length; i++) {
            const nextIdx = (activeIdx + i) % keys.length;
            if (keys[nextIdx].status === 'standby') {
                keys[nextIdx].status = 'active';
                await this.redisSet(`api:${provider}`, keys);
                console.log(`🔄 Rotated ${provider} to key ${nextIdx + 1}`);
                return true;
            }
        }
        return false;
    }
    
    async getPoolStatus() {
        const providers = Object.keys(this.getProviders());
        const status = {};
        
        for (const provider of providers) {
            const keys = await this.getApiKeys(provider);
            const models = await this.getModels(provider);
            status[provider] = {
                keys: keys.length,
                active: keys.filter(k => k.status === 'active').length,
                models: models.length
            };
        }
        return status;
    }

    // ==================== MODEL MANAGEMENT ====================
    
    async getModels(provider) {
        const models = await this.redisGet(`models:${provider}`);
        if (models && models.length > 0) return models;
        
        // Return default models if empty
        const providerConfig = this.getProviders()[provider];
        return providerConfig?.defaultModels || [];
    }
    
    async addModel(provider, id, name) {
        const models = await this.redisGet(`models:${provider}`) || [];
        
        if (models.some(m => m.id === id)) {
            return { success: false, error: 'Model sudah ada' };
        }
        
        models.push({ id, name, addedAt: Date.now() });
        await this.redisSet(`models:${provider}`, models);
        return { success: true, total: models.length };
    }
    
    async removeModel(provider, id) {
        const models = await this.redisGet(`models:${provider}`) || [];
        const idx = models.findIndex(m => m.id === id);
        
        if (idx === -1) return { success: false, error: 'Model tidak ditemukan' };
        
        models.splice(idx, 1);
        await this.redisSet(`models:${provider}`, models);
        return { success: true, total: models.length };
    }
    
    async syncModels(provider) {
    const providers = this.getProviders();
    const config = providers[provider];
    
    if (!config) return { success: false, error: 'Provider tidak valid' };
    
    // OpenRouter - fetch from API
    if (provider === 'openrouter') {
        return this.syncOpenRouterModels();
    }
    
    // Groq - use default models
    if (provider === 'groq') {
        return this.syncGroqModels();
    }
    
    // Pollinations - use default models
    if (provider === 'pollinations') {
        await this.redisSet(`models:${provider}`, config.defaultModels);
        return { success: true, count: config.defaultModels.length };
    }
    
    // Gemini - use default models
    if (provider === 'gemini') {
        await this.redisSet(`models:${provider}`, config.defaultModels);
        return { success: true, count: config.defaultModels.length };
    }
    
    // HuggingFace - use default models
    if (provider === 'huggingface') {
        await this.redisSet(`models:${provider}`, config.defaultModels);
        return { success: true, count: config.defaultModels.length };
    }
    
    // Others - use default if available
    if (config.defaultModels?.length > 0) {
        await this.redisSet(`models:${provider}`, config.defaultModels);
        return { success: true, count: config.defaultModels.length };
    }
    
    return { success: false, error: 'Provider tidak mendukung sync' };
}
    
    async syncOpenRouterModels() {
        return new Promise((resolve) => {
            https.get('https://openrouter.ai/api/v1/models', (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', async () => {
                    try {
                        const json = JSON.parse(data);
                        const models = json.data
                            .filter(m => m.id.includes(':free'))
                            .map(m => ({
                                id: m.id,
                                name: m.name || m.id.split('/').pop().replace(':free', ' (free)')
                            }))
                            .slice(0, 50);
                        
                        await this.redisSet('models:openrouter', models);
                        resolve({ success: true, count: models.length });
                    } catch (e) {
                        resolve({ success: false, error: e.message });
                    }
                });
            }).on('error', (e) => resolve({ success: false, error: e.message }));
        });
    }
    
    async syncGroqModels() {
        const defaultGroqModels = [
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile' },
            { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
            { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B Versatile' },
            { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
            { id: 'gemma2-9b-it', name: 'Gemma 2 9B' }
        ];
        await this.redisSet('models:groq', defaultGroqModels);
        return { success: true, count: defaultGroqModels.length };
    }

    // ==================== EMBED UI ====================
    
    createMainEmbed(status) {
        const providers = this.getProviders();
        let apiList = '';
        let modelList = '';
        
        for (const [key, config] of Object.entries(providers)) {
            const s = status[key] || { keys: 0, models: 0, active: 0 };
            const keyIcon = s.keys > 0 ? (s.active > 0 ? '🟢' : '🟡') : '⚫';
            apiList += `${config.icon} **${config.name}**: ${keyIcon} ${s.keys} keys\n`;
            
            if (s.models > 0) {
                modelList += `${config.icon} ${config.name}: ${s.models} models\n`;
            }
        }
        
        return new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📦 Dynamic API & Model Manager')
            .setDescription('Kelola API keys dan AI models tanpa restart')
            .addFields(
                { name: '🔑 API Keys', value: apiList || '*Belum ada*', inline: true },
                { name: '🤖 Models', value: modelList || '*Belum ada*', inline: true },
                { name: '📊 Status', value: `Redis: ${this.connected ? '🟢 Connected' : '🔴 Offline'}`, inline: false }
            )
            .setFooter({ text: 'v2.0 • Pilih menu di bawah' })
            .setTimestamp();
    }
    
    createMainMenu() {
        return [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('dm_main_menu')
                    .setPlaceholder('📋 Pilih Menu')
                    .addOptions([
                        { label: '🔑 Kelola API Keys', value: 'api_menu', description: 'Tambah/hapus API keys', emoji: '🔑' },
                        { label: '🤖 Kelola Models', value: 'model_menu', description: 'Tambah/hapus AI models', emoji: '🤖' },
                        { label: '🔄 Sync All Models', value: 'sync_all', description: 'Sync models dari semua provider', emoji: '🔄' },
                        { label: '📊 Pool Status', value: 'pool_status', description: 'Lihat status detail', emoji: '📊' }
                    ])
            )
        ];
    }
    
    createProviderSelectEmbed(type) {
        const providers = this.getProviders();
        const title = type === 'api' ? '🔑 Pilih Provider untuk API Key' : '🤖 Pilih Provider untuk Models';
        
        return new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle(title)
            .setDescription('Pilih provider dari dropdown di bawah')
            .setTimestamp();
    }
    
    createProviderSelect(type) {
        const providers = this.getProviders();
        const options = Object.entries(providers)
            .filter(([key, config]) => type === 'api' || config.defaultModels !== undefined || config.syncable)
            .map(([key, config]) => ({
                label: config.name,
                value: `${type}_${key}`,
                emoji: config.icon
            }));
        
        return [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`dm_${type}_provider`)
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
        return [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`dm_add_key_${provider}`).setLabel('➕ Tambah Key').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`dm_remove_key_${provider}`).setLabel('➖ Hapus Key').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`dm_test_key_${provider}`).setLabel('🧪 Test Key').setStyle(ButtonStyle.Primary)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('dm_back_main').setLabel('⬅️ Kembali').setStyle(ButtonStyle.Secondary)
            )
        ];
    }
    
    async createModelEmbed(provider) {
        const providers = this.getProviders();
        const config = providers[provider];
        const models = await this.getModels(provider);
        
        let modelList = '';
        if (models.length > 0) {
            models.slice(0, 15).forEach((m, i) => {
                modelList += `${i + 1}. \`${m.id}\`\n   └ ${m.name}\n`;
            });
            if (models.length > 15) {
                modelList += `\n... dan ${models.length - 15} model lainnya`;
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
            new ButtonBuilder().setCustomId(`dm_add_model_${provider}`).setLabel('➕ Tambah Model').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`dm_remove_model_${provider}`).setLabel('➖ Hapus Model').setStyle(ButtonStyle.Danger)
        ];
        
        if (config.syncable) {
            buttons.push(
                new ButtonBuilder().setCustomId(`dm_sync_${provider}`).setLabel('🔄 Sync Models').setStyle(ButtonStyle.Primary)
            );
        }
        
        return [
            new ActionRowBuilder().addComponents(buttons),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`dm_clear_models_${provider}`).setLabel('🗑️ Clear All').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('dm_back_main').setLabel('⬅️ Kembali').setStyle(ButtonStyle.Secondary)
            )
        ];
    }
    
    createInputModal(type, provider, title) {
        const modal = new ModalBuilder()
            .setCustomId(`dm_modal_${type}_${provider}`)
            .setTitle(title);
        
        if (type === 'add_key') {
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
        } else if (type === 'add_model') {
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
        } else if (type === 'remove_key' || type === 'remove_model') {
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
        
        const status = await this.getPoolStatus();
        await msg.reply({
            embeds: [this.createMainEmbed(status)],
            components: this.createMainMenu()
        });
    }
    
    async handleInteraction(interaction) {
        if (!this.isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ Admin only', ephemeral: true });
        }
        
        const customId = interaction.customId;
        
        try {
            // ===== MODAL SUBMISSIONS =====
            if (interaction.isModalSubmit()) {
                return this.handleModalSubmit(interaction);
            }
            
            // ===== MAIN MENU SELECT =====
            if (customId === 'dm_main_menu') {
                const value = interaction.values[0];
                
                if (value === 'api_menu') {
                    await interaction.update({
                        embeds: [this.createProviderSelectEmbed('api')],
                        components: this.createProviderSelect('api')
                    });
                }
                else if (value === 'model_menu') {
                    await interaction.update({
                        embeds: [this.createProviderSelectEmbed('model')],
                        components: this.createProviderSelect('model')
                    });
                }
                else if (value === 'sync_all') {
                    await interaction.deferUpdate();
                    const providers = ['openrouter', 'groq', 'gemini'];
                    let results = [];
                    for (const p of providers) {
                        const r = await this.syncModels(p);
                        results.push(`${p}: ${r.success ? `✅ ${r.count}` : `❌ ${r.error}`}`);
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
                            text += `**${p}**\n`;
                            text += `├ Keys: ${s.keys} (${s.active} active)\n`;
                            text += `└ Models: ${s.models}\n\n`;
                        }
                    }
                    await interaction.reply({ content: text || 'Belum ada data', ephemeral: true });
                }
            }
            
            // ===== PROVIDER SELECT =====
            else if (customId === 'dm_api_provider') {
                const provider = interaction.values[0].replace('api_', '');
                await interaction.update({
                    embeds: [await this.createApiKeyEmbed(provider)],
                    components: this.createApiKeyButtons(provider)
                });
            }
            
            else if (customId === 'dm_model_provider') {
                const provider = interaction.values[0].replace('model_', '');
                await interaction.update({
                    embeds: [await this.createModelEmbed(provider)],
                    components: this.createModelButtons(provider)
                });
            }
            
            // ===== BACK BUTTON =====
            else if (customId === 'dm_back_main') {
                const status = await this.getPoolStatus();
                await interaction.update({
                    embeds: [this.createMainEmbed(status)],
                    components: this.createMainMenu()
                });
            }
            
            // ===== API KEY BUTTONS =====
            else if (customId.startsWith('dm_add_key_')) {
                const provider = customId.replace('dm_add_key_', '');
                const modal = this.createInputModal('add_key', provider, `Tambah API Key - ${provider}`);
                await interaction.showModal(modal);
            }
            
            else if (customId.startsWith('dm_remove_key_')) {
                const provider = customId.replace('dm_remove_key_', '');
                const modal = this.createInputModal('remove_key', provider, `Hapus API Key - ${provider}`);
                await interaction.showModal(modal);
            }
            
            else if (customId.startsWith('dm_test_key_')) {
                const provider = customId.replace('dm_test_key_', '');
                const key = await this.getActiveKey(provider);
                await interaction.reply({
                    content: key ? `✅ Active key found: \`${this.maskKey(key)}\`` : '❌ Tidak ada active key',
                    ephemeral: true
                });
            }
            
            // ===== MODEL BUTTONS =====
            else if (customId.startsWith('dm_add_model_')) {
                const provider = customId.replace('dm_add_model_', '');
                const modal = this.createInputModal('add_model', provider, `Tambah Model - ${provider}`);
                await interaction.showModal(modal);
            }
            
            else if (customId.startsWith('dm_remove_model_')) {
                const provider = customId.replace('dm_remove_model_', '');
                const modal = this.createInputModal('remove_model', provider, `Hapus Model - ${provider}`);
                await interaction.showModal(modal);
            }
            
            else if (customId.startsWith('dm_sync_')) {
                const provider = customId.replace('dm_sync_', '');
                await interaction.deferUpdate();
                const result = await this.syncModels(provider);
                
                if (result.success) {
                    await interaction.editReply({
                        embeds: [await this.createModelEmbed(provider)],
                        components: this.createModelButtons(provider)
                    });
                    await interaction.followUp({
                        content: `✅ Synced ${result.count} models untuk ${provider}`,
                        ephemeral: true
                    });
                } else {
                    await interaction.followUp({
                        content: `❌ Sync gagal: ${result.error}`,
                        ephemeral: true
                    });
                }
            }
            
            else if (customId.startsWith('dm_clear_models_')) {
                const provider = customId.replace('dm_clear_models_', '');
                await this.redisSet(`models:${provider}`, []);
                await interaction.update({
                    embeds: [await this.createModelEmbed(provider)],
                    components: this.createModelButtons(provider)
                });
                await interaction.followUp({
                    content: `🗑️ Semua models ${provider} dihapus`,
                    ephemeral: true
                });
            }
            
        } catch (e) {
            console.error('DM Interaction Error:', e);
            const reply = { content: `❌ Error: ${e.message}`, ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        }
    }
    
    async handleModalSubmit(interaction) {
        const [, , type, provider] = interaction.customId.split('_');
        
        try {
            if (type === 'add' && interaction.customId.includes('key')) {
                const apiKey = interaction.fields.getTextInputValue('api_key');
                const label = interaction.fields.getTextInputValue('key_label') || '';
                
                const result = await this.addApiKey(provider, apiKey, label);
                
                if (result.success) {
                    await interaction.update({
                        embeds: [await this.createApiKeyEmbed(provider)],
                        components: this.createApiKeyButtons(provider)
                    });
                    await interaction.followUp({
                        content: `✅ API key ditambahkan! Total: ${result.total}`,
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: `❌ ${result.error}`,
                        ephemeral: true
                    });
                }
            }
            
            else if (type === 'remove' && interaction.customId.includes('key')) {
                const idx = parseInt(interaction.fields.getTextInputValue('item_number')) - 1;
                const result = await this.removeApiKey(provider, idx);
                
                if (result.success) {
                    await interaction.update({
                        embeds: [await this.createApiKeyEmbed(provider)],
                        components: this.createApiKeyButtons(provider)
                    });
                } else {
                    await interaction.reply({
                        content: `❌ ${result.error}`,
                        ephemeral: true
                    });
                }
            }
            
            else if (type === 'add' && interaction.customId.includes('model')) {
                const modelId = interaction.fields.getTextInputValue('model_id');
                const modelName = interaction.fields.getTextInputValue('model_name');
                
                const result = await this.addModel(provider, modelId, modelName);
                
                if (result.success) {
                    await interaction.update({
                        embeds: [await this.createModelEmbed(provider)],
                        components: this.createModelButtons(provider)
                    });
                    await interaction.followUp({
                        content: `✅ Model ditambahkan! Total: ${result.total}`,
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: `❌ ${result.error}`,
                        ephemeral: true
                    });
                }
            }
            
            else if (type === 'remove' && interaction.customId.includes('model')) {
                const idx = parseInt(interaction.fields.getTextInputValue('item_number')) - 1;
                const models = await this.getModels(provider);
                
                if (idx >= 0 && idx < models.length) {
                    const result = await this.removeModel(provider, models[idx].id);
                    if (result.success) {
                        await interaction.update({
                            embeds: [await this.createModelEmbed(provider)],
                            components: this.createModelButtons(provider)
                        });
                    } else {
                        await interaction.reply({
                            content: `❌ ${result.error}`,
                            ephemeral: true
                        });
                    }
                } else {
                    await interaction.reply({
                        content: '❌ Nomor tidak valid',
                        ephemeral: true
                    });
                }
            }
            
        } catch (e) {
            console.error('Modal Submit Error:', e);
            await interaction.reply({
                content: `❌ Error: ${e.message}`,
                ephemeral: true
            });
        }
    }

    // ==================== QUICK COMMANDS (Backup) ====================
    
    async quickAddApi(msg, args) {
        if (!this.isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
        msg.reply('💡 Gunakan `.manage` untuk menambah API key dengan aman via modal');
    }
    
    async quickListApi(msg) {
        if (!this.isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
        const status = await this.getPoolStatus();
        let text = '**🔑 API Key Pools:**\n\n';
        for (const [p, s] of Object.entries(status)) {
            if (s.keys > 0) text += `• **${p}**: ${s.keys} keys (${s.active} active)\n`;
        }
        await msg.reply(text || 'Belum ada API keys');
    }
    
    async quickAddModel(msg, args) {
        if (!this.isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
        msg.reply('💡 Gunakan `.manage` untuk menambah model via UI');
    }
    
    async quickSyncModels(msg, provider) {
        if (!this.isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
        if (!provider) return msg.reply('❓ `.syncmodels <provider>`\nProviders: openrouter, groq, gemini');
        
        const status = await msg.reply('🔄 Syncing...');
        const result = await this.syncModels(provider.toLowerCase());
        await status.edit(result.success ? `✅ Synced ${result.count} models` : `❌ ${result.error}`);
    }
}

module.exports = DynamicManager;
