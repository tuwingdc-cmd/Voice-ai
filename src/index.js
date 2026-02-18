// src/index.js

// ============================================================
//         DISCORD AI BOT v3.0 - MAIN ENTRY POINT
// ============================================================

const { createServer } = require('http');
const {
    Client,
    GatewayIntentBits,
    Partials,
    ActivityType,
    Events
} = require('discord.js');

const { getVoiceConnection } = require('@discordjs/voice');

// ============================================================
//         IMPORT MODULES
// ============================================================

const { BOT_CONFIG, AI_PROVIDERS } = require('./core/botConfig');

const {
    // Storage Maps
    guildSettings,
    voiceConnections,
    audioPlayers,
    ttsQueues,
    conversations,
    
    // Constants
    SUPPORTED_FILE_EXTENSIONS,
    
    // Basic Utilities
    ensureTempDir,
    cleanupFile,
    splitMessage,
    isAdmin,
    checkRateLimit,
    
    // Settings Management
    getSettings,
    updateSettings,
    
    // Conversation Memory
    clearConversation,
    cleanupOldConversations,
    
    // URL & File Detection
    detectURLs,
    shouldAutoFetch,
    isMediaFile,
    isShortener
} = require('./core/botUtils');

const {
    // Voice Functions
    joinUserVoiceChannel,
    leaveVoiceChannel,
    playTTSInVoice,
    
    // Voice AI
    enableVoiceAI,
    disableVoiceAI,
    isVoiceAIEnabled,
    
    // Settings UI
    createSettingsEmbed,
    createProviderMenu,
    createModelMenu,
    createVoiceMenu,
    createElevenlabsVoiceMenu,
    createModeButtons,
    
    // Command Handlers
    handleAI,
    handleSpeak,
    handleFileReadWithQuery,
    handleImageAnalysisWithQuery,
    handleURLAnalysis,
    handleSearchCommand,
    handleReadCommand,
    handleAnalyzeCommand,
    handleStatusCommand,
    handleHelpCommand,
    handleModelInfoCommand
} = require('./core/botHandlers');

// ============================================================
//         EXTERNAL MODULES (existing)
// ============================================================

const DynamicManager = require('./modules/dynamicManager');
const RenderAPI = require('./modules/renderAPI');
const GitHubAPI = require('./modules/githubAPI');
const WebhookServer = require('./modules/webhookServer');
const renderCommands = require('./commands/renderCommands');
const githubCommands = require('./commands/githubCommands');

// ============================================================
//         INITIALIZATION
// ============================================================

const startTime = Date.now();
const manager = new DynamicManager(process.env.REDIS_URL, BOT_CONFIG.adminIds);

let renderAPI = null;
let githubAPI = null;
let webhookHandler = null;

if (BOT_CONFIG.renderApiKey && BOT_CONFIG.renderOwnerId) {
    renderAPI = new RenderAPI(BOT_CONFIG.renderApiKey, BOT_CONFIG.renderOwnerId);
    console.log('Render API initialized');
}

if (BOT_CONFIG.githubToken) {
    githubAPI = new GitHubAPI(BOT_CONFIG.githubToken);
    console.log('GitHub API initialized');
}

// ============================================================
//         HEALTH SERVER
// ============================================================

const healthServer = createServer(async (req, res) => {
    let body = '';
    
    if (req.method === 'POST') {
        for await (const chunk of req) {
            body += chunk;
        }
    }
    
    if (req.url.startsWith('/webhook/') && req.method === 'POST') {
        if (webhookHandler) {
            await webhookHandler.handleRequest(req, res, body);
        } else {
            res.writeHead(503);
            res.end('Webhook handler not ready');
        }
        return;
    }
    
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
            imageAnalysis: true,
            renderAPI: !!BOT_CONFIG.renderApiKey,
            githubAPI: !!BOT_CONFIG.githubToken,
            webhooks: !!BOT_CONFIG.webhookSecret
        }
    };
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
});

healthServer.listen(process.env.PORT || 3000, () => {
    console.log('Health server ready');
});

// ============================================================
//         DISCORD CLIENT
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
    presence: { 
        status: 'online', 
        activities: [{ name: '.help | AI Assistant', type: ActivityType.Listening }] 
    }
});

// ============================================================
//         CLEANUP INTERVAL
// ============================================================

setInterval(() => {
    cleanupOldConversations();
}, 300000);

// ============================================================
//         INTERACTION HANDLER
// ============================================================

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.customId?.startsWith('dm_')) {
        return manager.handleInteraction(interaction);
    }

    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

    if (!isAdmin(interaction.user.id)) {
        return interaction.reply({ content: 'Admin only', ephemeral: true });
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
                return interaction.reply({ content: 'Admin only', ephemeral: true });
            }
            updateSettings(guildId, 'ttsVoiceElevenlabs', interaction.values[0]);
        } else if (interaction.customId === 'search_toggle') {
            const s = getSettings(guildId);
            updateSettings(guildId, 'searchEnabled', !s.searchEnabled);
        } else if (interaction.customId === 'grounding_toggle') {
            const s = getSettings(guildId);
            updateSettings(guildId, 'geminiGrounding', !s.geminiGrounding);
        }

        const comps = [
            createProviderMenu(guildId),
            createModelMenu(guildId),
            createVoiceMenu(guildId),
            createModeButtons(guildId)
        ].filter(Boolean);
        
        await interaction.update({ 
            embeds: [createSettingsEmbed(guildId)], 
            components: comps 
        });

    } catch (e) {
        interaction.reply({ content: `Error: ${e.message}`, ephemeral: true }).catch(() => {});
    }
});

// ============================================================
//         MESSAGE HANDLER
// ============================================================

client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    const content = msg.content.trim();
    const urls = detectURLs(content);
    const hasMention = msg.mentions.has(client.user);
    const hasCommand = content.startsWith(BOT_CONFIG.prefix);
    const hasAttachments = msg.attachments.size > 0;
    const path = require('path');
    
    // ========== AUTO FILE/IMAGE DETECTION ==========
    if (hasMention && hasAttachments) {
        const query = content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
        
        const images = msg.attachments.filter(a => 
            a.contentType && a.contentType.startsWith('image/')
        );
        
        if (images.size > 0) {
            return await handleImageAnalysisWithQuery(msg, images.first(), query);
        }
        
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
    
    // ========== PURE MENTION ==========
    if (hasMention && !hasCommand) {
        const query = content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
        
        if (!query) {
            return msg.reply('Hai! Aku Toing, asisten AI-mu!\n\nTips:\n- Mention aku + pertanyaan\n- Upload file/gambar + mention\n- Kirim URL + pertanyaan\n- Ketik .help untuk bantuan lengkap');
        }
        
        return await handleAI(msg, query);
    }

    // ========== COMMAND HANDLER ==========
    if (!hasCommand) return;

    const args = content.slice(BOT_CONFIG.prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    try {
        switch (cmd) {
            // AI Commands
            case 'ai':
            case 'ask':
            case 'chat':
            case 'tanya':
            case 'a':
                if (!args.join(' ')) {
                    return msg.reply('Usage: .ai <question>\n\nExample:\n- .ai jelaskan quantum computing\n- .ai bagaimana cara belajar programming?');
                }
                await handleAI(msg, args.join(' '));
                break;

            // Search Command
            case 'search':
            case 'cari':
            case 's':
            case 'google':
                await handleSearchCommand(msg, args.join(' '));
                break;

            // File & URL Commands
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
                    return msg.reply('Usage: .url <link>\n\nExample:\n- .url https://example.com/article\n- .url https://github.com/user/repo jelaskan kodenya');
                }
                await handleURLAnalysis(msg, [args[0]], args.slice(1).join(' '));
                break;

            // Voice Commands
            case 'join':
            case 'j':
            case 'masuk':
                const jr = await joinUserVoiceChannel(msg.member, msg.guild);
                await msg.reply(jr.success 
                    ? (jr.alreadyConnected ? `Already in ${jr.channel.name}` : `Joined ${jr.channel.name}`) 
                    : `Error: ${jr.error}`);
                break;

            case 'leave':
            case 'dc':
            case 'disconnect':
            case 'keluar':
                await msg.reply(await leaveVoiceChannel(msg.guild) ? 'Left voice channel' : 'Not in voice channel');
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
                    if (queueData) queueData.queue = [];
                    await msg.reply('Audio stopped');
                } else {
                    await msg.reply('Nothing playing');
                }
                break;

            // Voice AI Commands
            case 'voiceai':
            case 'vai':
            case 'podcast':
                if (!isAdmin(msg.author.id)) return msg.reply('Admin only');
                
                const voiceSubCmd = args[0]?.toLowerCase();
                
                if (voiceSubCmd === 'on' || voiceSubCmd === 'start') {
                    const vjr = await joinUserVoiceChannel(msg.member, msg.guild);
                    if (!vjr.success) return msg.reply(`Error: ${vjr.error}`);
                    
                    enableVoiceAI(msg.guild.id, msg.channel);
                    await msg.reply(`Podcast Mode Activated!\n\nChannel: ${vjr.channel.name}\nMode: Natural Conversation\n\nLangsung bicara saja, aku akan mendengar dan menjawab!`);
                        
                } else if (voiceSubCmd === 'off' || voiceSubCmd === 'stop') {
                    disableVoiceAI(msg.guild.id);
                    await msg.reply('Voice AI disabled');
                    
                } else if (voiceSubCmd === 'status') {
                    const enabled = isVoiceAIEnabled(msg.guild.id);
                    
                    if (enabled) {
                        await msg.reply(`Voice AI Status\n\nStatus: Active`);
                    } else {
                        await msg.reply(`Voice AI Status\n\nStatus: Inactive\n\nUse .voiceai on to activate.`);
                    }
                    
                } else {
                    await msg.reply(`Voice AI Commands\n\n.voiceai on - Activate podcast mode\n.voiceai off - Disable voice AI\n.voiceai status - Check status\n\nHow to use:\n1. Join voice channel\n2. Type .voiceai on\n3. Speak naturally\n4. Bot will respond via voice!`);
                }
                break;
                
            case 'listen':
            case 'dengar':
                if (!isAdmin(msg.author.id)) return msg.reply('Admin only');
                
                const ljr = await joinUserVoiceChannel(msg.member, msg.guild);
                if (!ljr.success) return msg.reply(`Error: ${ljr.error}`);
                
                enableVoiceAI(msg.guild.id, msg.channel);
                await msg.reply(`Listening in ${ljr.channel.name}...`);
                break;

            // Render Commands
            case 'render':
            case 'rnd':
                if (!renderAPI) {
                    return msg.reply('Render API not configured.\n\nAdd RENDER_API_KEY and RENDER_OWNER_ID to environment variables.');
                }
                if (!isAdmin(msg.author.id)) {
                    return msg.reply('Admin only');
                }
                await renderCommands.handle(msg, args, renderAPI);
                break;

            // GitHub Commands
            case 'github':
            case 'gh':
            case 'git':
                if (!githubAPI) {
                    return msg.reply('GitHub API not configured.\n\nAdd GITHUB_TOKEN to environment variables.');
                }
                if (!isAdmin(msg.author.id)) {
                    return msg.reply('Admin only');
                }
                await githubCommands.handle(msg, args, githubAPI);
                break;
            
            // Settings Commands
            case 'settings':
            case 'config':
            case 'set':
            case 'pengaturan':
                if (!isAdmin(msg.author.id)) return msg.reply('Admin only');
                
                const comps = [
                    createProviderMenu(msg.guild.id),
                    createModelMenu(msg.guild.id),
                    createVoiceMenu(msg.guild.id)
                ];
                
                if (isAdmin(msg.author.id) && BOT_CONFIG.minimax?.apiKey) {
                    comps.push(createElevenlabsVoiceMenu(msg.guild.id));
                }
                
                comps.push(createModeButtons(msg.guild.id));
                
                const finalComps = comps.filter(Boolean).slice(0, 5);
                await msg.reply({ 
                    embeds: [createSettingsEmbed(msg.guild.id)], 
                    components: finalComps 
                });
                break;

            case 'clear':
            case 'reset':
            case 'forget':
            case 'lupa':
            case 'hapus':
                clearConversation(msg.guild.id, msg.author.id);
                await msg.reply('Conversation memory cleared!');
                break;

            // API Manager Commands
            case 'manage':
            case 'apimanager':
            case 'manager':
            case 'api':
                if (!isAdmin(msg.author.id)) return msg.reply('Admin only');
                await manager.showMainMenu(msg);
                break;

            case 'listapi':
            case 'apis':
                if (!isAdmin(msg.author.id)) return msg.reply('Admin only');
                await manager.quickListApi(msg);
                break;

            case 'syncmodels':
                if (!isAdmin(msg.author.id)) return msg.reply('Admin only');
                await manager.quickSyncModels(msg, args[0]);
                break;

            // Info Commands
            case 'status':
            case 'stats':
            case 'info':
                await handleStatusCommand(msg, client, startTime, manager);
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
                await msg.reply(`Pong!\n\nLatency: ${latency}ms\nWebSocket: ${wsLatency}ms\nStatus: ${latency < 200 ? 'Excellent' : latency < 500 ? 'Good' : 'Slow'}`);
                break;

            case 'model':
            case 'models':
                await handleModelInfoCommand(msg);
                break;

            default:
                break;
        }
    } catch (e) {
        console.error('Command error:', e);
        msg.reply(`Error: ${e.message}`).catch(() => {});
    }
});

// ============================================================
//         BOT READY EVENT
// ============================================================

client.once(Events.ClientReady, () => {
    console.log('='.repeat(50));
    console.log(`${client.user.tag} is ONLINE!`);
    console.log(`Serving ${client.guilds.cache.size} servers`);
    console.log('v3.0.0 Complete Edition');
    console.log('='.repeat(50));
    
    console.log('Active Features:');
    console.log(`   AI Chat: ON`);
    console.log(`   Voice AI: ON`);
    console.log(`   Render API: ${renderAPI ? 'ON' : 'OFF'}`);
    console.log(`   GitHub API: ${githubAPI ? 'ON' : 'OFF'}`);
    console.log(`   Webhooks: ${BOT_CONFIG.webhookSecret ? 'ON' : 'OFF'}`);
    console.log('='.repeat(50));
    
    if (BOT_CONFIG.webhookSecret || BOT_CONFIG.notificationChannelId) {
        webhookHandler = new WebhookServer(client, {
            webhookSecret: BOT_CONFIG.webhookSecret,
            notificationChannelId: BOT_CONFIG.notificationChannelId,
            adminIds: BOT_CONFIG.adminIds
        });
        console.log('Webhook handler initialized');
    }
    
    client.user.setPresence({
        status: 'online',
        activities: [{ name: '.help | AI + DevOps', type: ActivityType.Listening }]
    });
    
    ensureTempDir();
});

// ============================================================
//         ERROR HANDLERS
// ============================================================

client.on(Events.Error, e => console.error('Client Error:', e.message));
client.on(Events.Warn, w => console.warn('Warning:', w));

process.on('unhandledRejection', e => console.error('Unhandled:', e));
process.on('uncaughtException', e => console.error('Uncaught:', e));

process.on('SIGTERM', () => { 
    voiceConnections.forEach(c => c.destroy()); 
    client.destroy(); 
    process.exit(0); 
});

process.on('SIGINT', () => { 
    voiceConnections.forEach(c => c.destroy()); 
    client.destroy(); 
    process.exit(0); 
});

// ============================================================
//         LOGIN
// ============================================================

if (!BOT_CONFIG.token) { 
    console.error('DISCORD_TOKEN not set!'); 
    process.exit(1); 
}

console.log('Token:', BOT_CONFIG.token.slice(0,10) + '***');
console.log('Connecting...');

client.login(BOT_CONFIG.token).then(() => {
    console.log('Login successful!');
}).catch(err => {
    console.error('LOGIN FAILED:', err.message);
    if (err.message.includes('TOKEN_INVALID')) {
        console.error('Token invalid! Reset di Developer Portal');
    }
    if (err.message.includes('DISALLOWED_INTENTS')) {
        console.error('Enable MESSAGE CONTENT INTENT di Developer Portal!');
    }
    process.exit(1);
});
