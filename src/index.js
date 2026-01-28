require('dotenv').config();
const { startBot } = require('./bot');
const { createServer } = require('http');
const logger = require('./utils/logger');
const { checkVoiceDependencies } = require('./utils/voice');

// Check voice dependencies sebelum start
logger.info('Checking voice dependencies...');
checkVoiceDependencies();

// Simple HTTP server untuk Render health check
const server = createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            bot: 'Discord Voice AI Bot'
        }));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Discord Voice AI Bot is running!');
    }
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    logger.info(`🌐 Health check server running on port ${PORT}`);
});

// Start Discord Bot
startBot().catch(error => {
    logger.error('Failed to start bot:', error);
    process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        process.exit(0);
    });
});
