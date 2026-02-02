const fetch = require('node-fetch');

const MINIMAX_VOICES = [
    { id: process.env.MINIMAX_VOICE_ID, name: '🎙️ My Cloned Voice', lang: 'multi' },
    { id: 'male-qn-qingse', name: '🇨🇳 Qingse (Male)', lang: 'zh' },
    { id: 'female-shaonv', name: '🇨🇳 Shaonv (Female)', lang: 'zh' },
    { id: 'presenter_male', name: '🇺🇸 Presenter (Male)', lang: 'en' },
    { id: 'presenter_female', name: '🇺🇸 Presenter (Female)', lang: 'en' },
];

async function generateMiniMaxTTS(text, options = {}) {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey || apiKey.length < 20) {
        throw new Error('MiniMax API key not configured');
    }

    const voiceId = options.voiceId || process.env.MINIMAX_VOICE_ID;
    const model = options.turbo ? 'speech-02-turbo' : 'speech-02-hd';
    
    console.log(`🎤 MiniMax TTS: model=${model}, voice=${voiceId?.substring(0, 25)}...`);

    const response = await fetch('https://api.minimaxi.chat/v1/t2a_v2', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: model,
            text: text.slice(0, 5000),
            stream: false,
            voice_setting: {
                voice_id: voiceId,
                speed: options.speed || 1.0,
                vol: options.volume || 1.0,
                pitch: options.pitch || 0
            },
            audio_setting: {
                sample_rate: 32000,
                bitrate: 128000,
                format: 'mp3'
            }
        }),
        timeout: 60000
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MiniMax API: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    if (result.base_resp?.status_code !== 0) {
        throw new Error(`MiniMax: ${result.base_resp?.status_msg}`);
    }

    const audioHex = result.data?.audio;
    if (!audioHex) {
        throw new Error('No audio data in response');
    }

    const audioBuffer = Buffer.from(audioHex, 'hex');
    console.log(`✅ MiniMax TTS: ${audioBuffer.length} bytes`);
    return audioBuffer;
}

function isMiniMaxVoice(voiceId) {
    if (!voiceId) return false;
    if (voiceId.startsWith('moss_audio_') || voiceId.startsWith('clone_')) return true;
    return MINIMAX_VOICES.some(v => v.id === voiceId);
}

module.exports = { generateMiniMaxTTS, isMiniMaxVoice, MINIMAX_VOICES };
