const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const config = require('../utils/config');
const logger = require('../utils/logger');

const execAsync = promisify(exec);

// Pastikan folder temp ada
function ensureTempDir() {
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    return tempDir;
}

/**
 * Convert text to speech using Edge TTS
 */
async function textToSpeech(text, voice = config.ttsVoice) {
    const tempDir = ensureTempDir();
    const outputPath = path.join(tempDir, `speech_${Date.now()}.mp3`);
    
    try {
        // Sanitize text - hapus karakter bermasalah
        let sanitizedText = text
            .replace(/"/g, "'")
            .replace(/`/g, "'")
            .replace(/\$/g, '')
            .replace(/\\/g, '')
            .replace(/\n/g, ' ')
            .replace(/[<>]/g, '')
            .trim();
        
        // Limit panjang text
        if (sanitizedText.length > 500) {
            sanitizedText = sanitizedText.slice(0, 497) + '...';
        }
        
        // Skip jika text terlalu pendek
        if (sanitizedText.length < 2) {
            throw new Error('Text too short');
        }
        
        logger.debug(`TTS Input: "${sanitizedText}"`);
        logger.debug(`TTS Voice: ${voice}`);
        logger.debug(`TTS Output: ${outputPath}`);
        
        // Gunakan edge-tts
        const command = `edge-tts --voice "${voice}" --text "${sanitizedText}" --write-media "${outputPath}"`;
        
        const { stdout, stderr } = await execAsync(command, { 
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 10 // 10MB
        });
        
        if (stderr) {
            logger.debug('TTS stderr:', stderr);
        }
        
        // Verify file exists
        if (!fs.existsSync(outputPath)) {
            throw new Error('Audio file was not created');
        }
        
        // Verify file size
        const stats = fs.statSync(outputPath);
        if (stats.size < 1000) {
            throw new Error('Audio file too small, might be corrupted');
        }
        
        logger.info(`TTS Success: ${outputPath} (${stats.size} bytes)`);
        
        return outputPath;
        
    } catch (error) {
        logger.error('TTS Error:', error.message);
        
        // Cleanup failed file
        if (fs.existsSync(outputPath)) {
            try { fs.unlinkSync(outputPath); } catch (e) {}
        }
        
        throw error;
    }
}

/**
 * Cleanup temporary file
 */
function cleanupFile(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            logger.debug(`Cleaned up: ${filePath}`);
        }
    } catch (error) {
        logger.debug('Cleanup error:', error.message);
    }
}

/**
 * Available voices
 */
const VOICES = {
    female: 'id-ID-GadisNeural',
    male: 'id-ID-ArdiNeural'
};

module.exports = {
    textToSpeech,
    cleanupFile,
    VOICES
};
