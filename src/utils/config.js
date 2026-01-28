require('dotenv').config();

const config = {
    // Discord
    discordToken: process.env.DISCORD_TOKEN,
    prefix: process.env.BOT_PREFIX || '!',
    botName: process.env.BOT_NAME || 'Aria',
    
    // Groq AI - UPDATE MODEL DI SINI
    groqApiKey: process.env.GROQ_API_KEY,
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',  // ✅ UPDATED!
    
    // TTS
    ttsVoice: process.env.TTS_VOICE || 'id-ID-GadisNeural',
    
    // Paths
    tempDir: './temp',
    
    // AI Settings
    maxTokens: 300,
    temperature: 0.7,
};

// Validate required config
const required = ['discordToken', 'groqApiKey'];
for (const key of required) {
    if (!config[key]) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
}

module.exports = config;
