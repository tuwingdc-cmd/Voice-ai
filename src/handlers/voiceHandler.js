const { EndBehaviorType, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { generateResponse, transcribeAudio } = require('../services/groqAI');
const { textToSpeech } = require('../services/tts');
const { pcmToWav, cleanupFile, generateTempPath } = require('../utils/audioUtils');
const logger = require('../utils/logger');
const fs = require('fs');

// Map untuk track recording state
const recordingUsers = new Map();

function setupVoiceHandler(client, connection, guildId) {
    const receiver = connection.receiver;
    
    // Listen for when someone starts speaking
    receiver.speaking.on('start', (userId) => {
        // Prevent multiple recordings for same user
        if (recordingUsers.has(userId)) return;
        
        logger.debug(`User ${userId} started speaking`);
        recordingUsers.set(userId, true);
        
        // Create audio stream
        const audioStream = receiver.subscribe(userId, {
            end: {
                behavior: EndBehaviorType.AfterSilence,
                duration: 1500, // 1.5 seconds of silence
            },
        });
        
        const chunks = [];
        
        audioStream.on('data', (chunk) => {
            chunks.push(chunk);
        });
        
        audioStream.on('end', async () => {
            recordingUsers.delete(userId);
            
            // Ignore very short audio (probably noise)
            if (chunks.length < 10) {
                logger.debug('Audio too short, ignoring');
                return;
            }
            
            await processVoiceInput(client, guildId, userId, Buffer.concat(chunks));
        });
        
        audioStream.on('error', (error) => {
            logger.error('Audio stream error:', error);
            recordingUsers.delete(userId);
        });
    });
    
    logger.info(`Voice handler setup for guild ${guildId}`);
}

async function processVoiceInput(client, guildId, oderId, audioBuffer) {
    const pcmPath = generateTempPath('voice', 'pcm');
    let wavPath = null;
    let speechPath = null;
    
    try {
        // Save PCM audio
        fs.writeFileSync(pcmPath, audioBuffer);
        
        // Convert to WAV
        wavPath = await pcmToWav(pcmPath);
        
        // Transcribe audio
        logger.debug('Transcribing audio...');
        const transcription = await transcribeAudio(wavPath);
        
        if (!transcription || transcription.trim().length < 2) {
            logger.debug('Empty transcription, ignoring');
            return;
        }
        
        logger.info(`Transcription: ${transcription}`);
        
        // Get conversation history
        const historyKey = `${guildId}-${userId}`;
        const history = client.conversations.get(historyKey) || [];
        
        // Generate AI response
        const aiResponse = await generateResponse(transcription, history);
        logger.info(`AI Response: ${aiResponse}`);
        
        // Update history
        history.push(
            { role: 'user', content: transcription },
            { role: 'assistant', content: aiResponse }
        );
        client.conversations.set(historyKey, history.slice(-10));
        
        // Generate speech
        speechPath = await textToSpeech(aiResponse);
        
        // Play response
        let player = client.audioPlayers.get(guildId);
        if (!player) {
            player = createAudioPlayer();
            client.audioPlayers.set(guildId, player);
            
            const connection = client.voiceConnections.get(guildId);
            if (connection) {
                connection.subscribe(player);
            }
        }
        
        const resource = createAudioResource(speechPath);
        player.play(resource);
        
        // Cleanup after playing
        player.once(AudioPlayerStatus.Idle, () => {
            cleanupFile(speechPath);
        });
        
    } catch (error) {
        logger.error('Voice processing error:', error);
    } finally {
        // Cleanup temp files
        cleanupFile(pcmPath);
        if (wavPath) cleanupFile(wavPath);
    }
}

module.exports = { setupVoiceHandler };
