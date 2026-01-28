const { 
    Client, 
    GatewayIntentBits, 
    Collection,
    ActivityType 
} = require('discord.js');
const { handleMessage } = require('./handlers/messageHandler');
const { setupVoiceHandler } = require('./handlers/voiceHandler');
const logger = require('./utils/logger');
const config = require('./utils/config');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

// Store untuk connections dan conversations
client.voiceConnections = new Collection();
client.conversations = new Collection();
client.audioPlayers = new Collection();

async function startBot() {
    // Event: Bot ready
    client.once('ready', () => {
        logger.info(`✅ Bot logged in as ${client.user.tag}`);
        logger.info(`📡 Serving ${client.guilds.cache.size} servers`);
        
        // Set bot activity
        client.user.setActivity(`${config.prefix}help | Voice AI`, { 
            type: ActivityType.Listening 
        });
    });

    // Event: Message received
    client.on('messageCreate', async (message) => {
        await handleMessage(client, message);
    });

    // Event: Voice state update (untuk detect user join/leave)
    client.on('voiceStateUpdate', (oldState, newState) => {
        // Auto-leave jika sendirian di voice channel
        const connection = client.voiceConnections.get(newState.guild.id);
        if (connection) {
            const channel = newState.guild.channels.cache.get(connection.joinConfig.channelId);
            if (channel && channel.members.size === 1) {
                logger.info('Channel empty, leaving...');
                connection.destroy();
                client.voiceConnections.delete(newState.guild.id);
            }
        }
    });

    // Event: Error handling
    client.on('error', (error) => {
        logger.error('Discord client error:', error);
    });

    // Login
    await client.login(config.discordToken);
    
    return client;
}

module.exports = { startBot, client };
