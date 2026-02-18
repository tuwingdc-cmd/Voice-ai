// src/core/botHandlers.js

// ============================================================
//         BOT HANDLERS & COMMAND LOGIC
// ============================================================

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const fetch = require('node-fetch');
const FormData = require('form-data');
const prism = require('prism-media');

const {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    getVoiceConnection,
    StreamType,
    EndBehaviorType
} = require('@discordjs/voice');

const { BOT_CONFIG, AI_PROVIDERS, EDGE_TTS_VOICES, ELEVENLABS_VOICES, SYSTEM_PROMPT } = require('./botConfig');

const {
    // Storage Maps
    guildSettings,
    voiceConnections,
    audioPlayers,
    ttsQueues,
    conversations,
    voiceRecordings,
    voiceAISessions,
    processingUsers,
    
    // Constants
    DEFAULT_SETTINGS,
    SUPPORTED_FILE_EXTENSIONS,
    
    // Basic Utilities
    ensureTempDir,
    cleanupFile,
    splitMessage,
    isAdmin,
    checkRateLimit,
    httpRequest,
    
    // Settings Management
    getSettings,
    updateSettings,
    
    // Conversation Memory
    getConversation,
    addToConversation,
    clearConversation,
    
    // URL & File Detection
    detectURLs,
    shouldAutoFetch,
    isMediaFile,
    isShortener,
    shouldSearch,
    
    // TTS
    generateTTS,
    
    // File Reading
    readFile,
    
    // Web Scraping
    fetchURLClean,
    readGitHubFile,
    
    // Search
    performSearch,
    
    // Reasoning
    parseThinkingResponse,
    buildContextPrompt,
    
    // Audio
    createWavHeader
} = require('./botUtils');

// ============================================================
//         AI PROVIDER CALLS
// ============================================================

async function callGemini(model, message, history, systemPrompt, useGrounding = false) {
    const apiKey = BOT_CONFIG.geminiApiKey;
    if (!apiKey) throw new Error('No Gemini API key');

    const contents = [];
    history.slice(-20).forEach(m => {
        contents.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        });
    });
    contents.push({ role: 'user', parts: [{ text: message }] });

    const requestBody = {
        contents: contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { 
            temperature: 0.7, 
            topP: 0.95, 
            topK: 40, 
            maxOutputTokens: 8192
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
    };

    if (useGrounding) {
        requestBody.tools = [{ googleSearch: {} }];
    }

    const { data, statusCode } = await httpRequest({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify(requestBody));

    if (statusCode !== 200) {
        const result = JSON.parse(data);
        throw new Error(result.error?.message || `HTTP ${statusCode}`);
    }

    const result = JSON.parse(data);
    if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
        return {
            text: result.candidates[0].content.parts[0].text,
            grounded: !!result.candidates[0]?.groundingMetadata
        };
    }
    throw new Error('No response from Gemini');
}

async function callGroq(model, message, history, systemPrompt) {
    const apiKey = BOT_CONFIG.groqApiKey;
    if (!apiKey) throw new Error('No Groq API key');

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-30).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
    ];

    const { data, statusCode } = await httpRequest({
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${apiKey}`, 
            'Content-Type': 'application/json' 
        }
    }, JSON.stringify({ 
        model, 
        messages, 
        max_completion_tokens: 8000, 
        temperature: 0.7 
    }));

    if (statusCode !== 200) {
        const result = JSON.parse(data);
        throw new Error(result.error?.message || `HTTP ${statusCode}`);
    }

    const result = JSON.parse(data);
    return result.choices[0].message.content;
}

async function callOpenRouter(model, message, history, systemPrompt) {
    const apiKey = BOT_CONFIG.openrouterApiKey;
    if (!apiKey) throw new Error('No OpenRouter API key');

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-30).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
    ];

    const { data, statusCode } = await httpRequest({
        hostname: 'openrouter.ai',
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://discord.com',
            'X-Title': 'Discord AI Bot'
        }
    }, JSON.stringify({ 
        model, 
        messages, 
        max_tokens: 2000, 
        temperature: 0.7 
    }));

    if (statusCode !== 200) {
        const result = JSON.parse(data);
        throw new Error(result.error?.message || `HTTP ${statusCode}`);
    }

    const result = JSON.parse(data);
    return result.choices[0].message.content;
}

async function callPollinationsFree(model, message, history, systemPrompt) {
    let prompt = systemPrompt + '\n\n';
    history.slice(-10).forEach(m => {
        prompt += m.role === 'user' ? `User: ${m.content}\n` : `Assistant: ${m.content}\n`;
    });
    prompt += `User: ${message}\nAssistant:`;

    const encoded = encodeURIComponent(prompt.slice(0, 4000));
    const seed = Math.floor(Math.random() * 1000000);

    return new Promise((resolve, reject) => {
        const https = require('https');
        https.get(`https://text.pollinations.ai/${encoded}?model=${model}&seed=${seed}`, { timeout: 60000 }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode === 200 && data.trim()) {
                    let r = data.trim();
                    if (r.startsWith('Assistant:')) r = r.slice(10).trim();
                    resolve(r);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
        }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
    });
}

async function callPollinationsAPI(model, message, history, systemPrompt) {
    const apiKey = BOT_CONFIG.pollinationsApiKey;
    if (!apiKey) throw new Error('No Pollinations API key');

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
    ];

    const { data, statusCode } = await httpRequest({
        hostname: 'gen.pollinations.ai',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    }, JSON.stringify({ 
        model, 
        messages, 
        max_tokens: 2000, 
        temperature: 0.7 
    }));

    if (statusCode !== 200) {
        throw new Error(`HTTP ${statusCode}`);
    }

    const result = JSON.parse(data);
    if (result.choices?.[0]?.message?.content) {
        return result.choices[0].message.content;
    }
    throw new Error('No response from Pollinations API');
}

async function callHuggingFace(model, message, history, systemPrompt) {
    const apiKey = BOT_CONFIG.huggingfaceApiKey;
    if (!apiKey) throw new Error('No HuggingFace API key');

    let prompt = systemPrompt + '\n\n';
    history.slice(-10).forEach(m => {
        prompt += m.role === 'user' ? `User: ${m.content}\n` : `Assistant: ${m.content}\n`;
    });
    prompt += `User: ${message}\nAssistant:`;

    const { data, statusCode } = await httpRequest({
        hostname: 'api-inference.huggingface.co',
        path: `/models/${model}`,
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${apiKey}`, 
            'Content-Type': 'application/json' 
        }
    }, JSON.stringify({ 
        inputs: prompt, 
        parameters: { 
            max_new_tokens: 1000, 
            temperature: 0.7, 
            return_full_text: false 
        } 
    }));

    if (statusCode !== 200) {
        const result = JSON.parse(data);
        throw new Error(result.error || `HTTP ${statusCode}`);
    }

    const result = JSON.parse(data);
    if (result.error) throw new Error(result.error);
    const text = Array.isArray(result) ? result[0].generated_text : result.generated_text;
    return text.split('Assistant:').pop().trim();
}

// ============================================================
//         MAIN AI CALL
// ============================================================

async function callAI(guildId, userId, userMessage, isVoiceMode = false) {
    const s = getSettings(guildId);
    const { aiProvider, aiModel, searchEnabled, searchProvider, geminiGrounding } = s;
    const start = Date.now();

    const conv = getConversation(guildId, userId);
    const history = conv.messages;

    let searchContext = '';
    let searchData = null;
    let useGeminiGrounding = false;

    const needsSearch = searchEnabled && shouldSearch(userMessage);

    if (aiProvider === 'gemini' && geminiGrounding && needsSearch) {
        useGeminiGrounding = true;
    } else if (needsSearch) {
        searchData = await performSearch(userMessage, searchProvider);
        if (searchData && searchData.urls && searchData.urls.length > 0) {
            const contents = [];
            for (const url of searchData.urls.slice(0, 3)) {
                try {
                    const result = await fetchURLClean(url);
                    if (result && result.content) {
                        contents.push({ url, content: result.content.slice(0, 3000) });
                    }
                } catch (e) {
                    console.error('Failed to fetch search result URL:', e.message);
                }
            }
            
            if (contents.length > 0) {
                searchContext = '\n\n[SEARCH RESULTS]\n';
                contents.forEach((c, i) => {
                    searchContext += `\nSource ${i + 1}: ${c.url}\n${c.content}\n`;
                });
                searchContext += '\nUse the above search results to provide an accurate answer.';
            }
        }
    }

    let finalSystemPrompt = SYSTEM_PROMPT + searchContext;
    if (isVoiceMode) {
        finalSystemPrompt += '\n[MODE SUARA: Jawab singkat 2-4 kalimat]';
    }

    try {
        let response, grounded = false;

        switch (aiProvider) {
            case 'gemini':
                const geminiResult = await callGemini(aiModel, userMessage, history, finalSystemPrompt, useGeminiGrounding);
                response = geminiResult.text;
                grounded = geminiResult.grounded;
                break;
            case 'groq':
                response = await callGroq(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'openrouter':
                response = await callOpenRouter(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'huggingface':
                response = await callHuggingFace(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'pollinations_free':
                response = await callPollinationsFree(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'pollinations_api':
                response = await callPollinationsAPI(aiModel, userMessage, history, finalSystemPrompt);
                break;
            default:
                response = await callPollinationsFree('openai', userMessage, history, finalSystemPrompt);
        }

        addToConversation(guildId, userId, 'user', userMessage);
        addToConversation(guildId, userId, 'assistant', response);

        const modelInfo = AI_PROVIDERS[aiProvider]?.models.find(m => m.id === aiModel) || { name: aiModel };

        return {
            text: response,
            provider: AI_PROVIDERS[aiProvider]?.name || aiProvider,
            model: modelInfo.name,
            latency: Date.now() - start,
            searched: !!searchData || grounded,
            searchSource: searchData?.source || (grounded ? 'gemini-grounding' : null)
        };

    } catch (error) {
        console.error(`AI Error (${aiProvider}):`, error.message);

        if (aiProvider !== 'pollinations_free') {
            console.log('Fallback to Pollinations Free...');
            try {
                const fallback = await callPollinationsFree('openai', userMessage, history, finalSystemPrompt);
                addToConversation(guildId, userId, 'user', userMessage);
                addToConversation(guildId, userId, 'assistant', fallback);
                return {
                    text: fallback,
                    provider: 'Pollinations (Fallback)',
                    model: 'OpenAI GPT',
                    latency: Date.now() - start,
                    searched: !!searchData
                };
            } catch (e) {
                throw new Error('All providers failed');
            }
        }
        throw error;
    }
}

// ============================================================
//         IMAGE ANALYSIS
// ============================================================

async function analyzeImage(imageUrl, prompt = '') {
    const apiKey = BOT_CONFIG.geminiApiKey;
    if (!apiKey) throw new Error('No Gemini API key for image analysis');
    
    const imageResponse = await fetch(imageUrl);
    const buffer = await imageResponse.buffer();
    const base64 = buffer.toString('base64');
    
    const requestBody = {
        contents: [{
            parts: [
                {
                    inline_data: {
                        mime_type: imageResponse.headers.get('content-type') || 'image/jpeg',
                        data: base64
                    }
                },
                {
                    text: prompt || 'Jelaskan gambar ini dalam Bahasa Indonesia dengan detail.'
                }
            ]
        }],
        generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 2048
        }
    };
    
    const { data, statusCode } = await httpRequest({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify(requestBody));
    
    if (statusCode !== 200) {
        const result = JSON.parse(data);
        throw new Error(result.error?.message || `HTTP ${statusCode}`);
    }
    
    const result = JSON.parse(data);
    if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
        return result.candidates[0].content.parts[0].text;
    }
    throw new Error('No response from Gemini Vision');
}

// ============================================================
//         VOICE FUNCTIONS
// ============================================================

async function joinUserVoiceChannel(member, guild) {
    const vc = member?.voice?.channel;
    if (!vc) return { success: false, error: 'Masuk voice channel dulu' };

    try {
        const existingConn = getVoiceConnection(guild.id);
        if (existingConn && existingConn.joinConfig.channelId === vc.id) {
            return { success: true, channel: vc, alreadyConnected: true };
        }

        if (existingConn) {
            existingConn.destroy();
            voiceConnections.delete(guild.id);
            audioPlayers.delete(guild.id);
        }

        const conn = joinVoiceChannel({
            channelId: vc.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false
        });

        await entersState(conn, VoiceConnectionStatus.Ready, 30000);

        const player = createAudioPlayer();
        conn.subscribe(player);

        voiceConnections.set(guild.id, conn);
        audioPlayers.set(guild.id, player);
        ttsQueues.set(guild.id, { queue: [], playing: false, currentFile: null });

        player.on(AudioPlayerStatus.Idle, () => processNextInQueue(guild.id));
        player.on('error', (err) => {
            console.error('Audio player error:', err.message);
            processNextInQueue(guild.id);
        });

        const session = voiceAISessions.get(guild.id);
        if (session?.enabled) {
            setupVoiceReceiver(conn, guild.id, session.textChannel);
        }

        return { success: true, channel: vc };

    } catch (e) {
        console.error('Voice join error:', e.message);
        return { success: false, error: e.message };
    }
}

async function leaveVoiceChannel(guild) {
    const guildId = guild.id || guild;
    
    disableVoiceAI(guildId);
    
    const conn = voiceConnections.get(guildId) || getVoiceConnection(guildId);

    const queueData = ttsQueues.get(guildId);
    if (queueData) {
        if (queueData.currentFile) cleanupFile(queueData.currentFile);
        queueData.queue.forEach(item => cleanupFile(item.file));
    }

    if (!conn) return false;

    conn.destroy();
    voiceConnections.delete(guildId);
    audioPlayers.delete(guildId);
    ttsQueues.delete(guildId);
    return true;
}

function processNextInQueue(guildId) {
    const queueData = ttsQueues.get(guildId);
    if (!queueData) return;

    if (queueData.currentFile) {
        cleanupFile(queueData.currentFile);
        queueData.currentFile = null;
    }

    if (queueData.queue.length === 0) {
        queueData.playing = false;
        return;
    }

    const player = audioPlayers.get(guildId);
    if (!player) return;

    const next = queueData.queue.shift();
    queueData.currentFile = next.file;
    queueData.playing = true;

    try {
        const resource = createAudioResource(next.file, { inputType: StreamType.Arbitrary });
        player.play(resource);
    } catch (e) {
        console.error('Audio resource error:', e.message);
        cleanupFile(next.file);
        processNextInQueue(guildId);
    }
}

async function playTTSInVoice(guildId, filePath) {
    let queueData = ttsQueues.get(guildId);
    if (!queueData) {
        queueData = { queue: [], playing: false, currentFile: null };
        ttsQueues.set(guildId, queueData);
    }

    queueData.queue.push({ file: filePath });

    if (!queueData.playing) processNextInQueue(guildId);
    return true;
}

// ============================================================
//         VOICE AI FUNCTIONS
// ============================================================

async function transcribeWithGroq(audioFilePath) {
    const apiKey = BOT_CONFIG.groqApiKey;
    if (!apiKey) throw new Error('No Groq API key for transcription');
    
    if (!fs.existsSync(audioFilePath)) {
        throw new Error('Audio file not found');
    }
    
    const fileSize = fs.statSync(audioFilePath).size;
    console.log(`Sending to Whisper: ${audioFilePath} (${fileSize} bytes)`);
    
    if (fileSize < 1000) {
        throw new Error('Audio file too small');
    }
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioFilePath));
    formData.append('model', BOT_CONFIG.voiceAI.whisperModel);
    formData.append('response_format', 'verbose_json');
    
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`
        },
        body: formData
    });
    
    if (!response.ok) {
        const error = await response.text();
        console.error('Whisper error:', error);
        throw new Error(`Whisper API error: ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`Whisper result:`, JSON.stringify(result).slice(0, 200));
    
    return result.text || '';
}

function setupVoiceReceiver(connection, guildId, textChannel) {
    const receiver = connection.receiver;
    
    receiver.speaking.on('start', (userId) => {
        const session = voiceAISessions.get(guildId);
        if (!session?.enabled) return;
        if (processingUsers.has(userId)) return;
        
        startRecording(connection, userId, guildId, textChannel);
    });
}

function startRecording(connection, userId, guildId, textChannel) {
    if (voiceRecordings.has(userId)) return;
    
    const session = voiceAISessions.get(guildId);
    if (session?.isSpeaking) return;
    
    const receiver = connection.receiver;
    
    const opusStream = receiver.subscribe(userId, {
        end: {
            behavior: EndBehaviorType.AfterSilence,
            duration: 2000
        }
    });
    
    const opusDecoder = new prism.opus.Decoder({
        frameSize: 960,
        channels: 2,
        rate: 48000
    });
    
    const chunks = [];
    const startTime = Date.now();
    
    const recordingData = {
        chunks,
        startTime,
        stream: opusStream,
        decoder: opusDecoder,
        timeout: null
    };
    
    voiceRecordings.set(userId, recordingData);
    
    console.log(`Started recording user ${userId}`);
    
    const handleError = (err, source) => {
        if (err.message === 'stream.push() after EOF') return;
        if (err.message.includes('compressed data')) return;
        console.error(`${source} error user ${userId}:`, err.message);
        cleanupRecording(userId);
    };

    opusStream.on('error', (err) => handleError(err, 'Audio stream'));
    opusDecoder.on('error', (err) => handleError(err, 'Opus decoder'));
    
    opusStream.pipe(opusDecoder);
    
    opusDecoder.on('data', (chunk) => {
        if (Date.now() - startTime < BOT_CONFIG.voiceAI.maxRecordingDuration) {
            chunks.push(chunk);
        }
    });
    
    opusDecoder.on('end', async () => {
        cleanupRecording(userId);
        
        const duration = Date.now() - startTime;
        if (duration < BOT_CONFIG.voiceAI.minAudioLength || chunks.length === 0) {
            return;
        }
        
        const pcmBuffer = Buffer.concat(chunks);
        await processVoiceInput(userId, guildId, pcmBuffer, textChannel);
    });
    
    recordingData.timeout = setTimeout(() => {
        if (voiceRecordings.has(userId)) {
            console.log(`Recording timeout user ${userId}`);
            cleanupRecording(userId);
        }
    }, BOT_CONFIG.voiceAI.maxRecordingDuration + 1000);
}

function cleanupRecording(userId) {
    const recording = voiceRecordings.get(userId);
    if (!recording) return;
    
    if (recording.timeout) clearTimeout(recording.timeout);
    
    try { recording.stream.destroy(); } catch {}
    try { recording.decoder.destroy(); } catch {}
    
    voiceRecordings.delete(userId);
}

async function processVoiceInput(userId, guildId, audioBuffer, textChannel) {
    if (processingUsers.has(userId)) return;
    
    const session = voiceAISessions.get(guildId);
    if (session?.isSpeaking) return;
    
    processingUsers.add(userId);
    
    const tempFile = path.join(BOT_CONFIG.tempPath, `voice_${userId}_${Date.now()}.ogg`);
    
    try {
        await convertOpusToOgg(audioBuffer, tempFile);
        
        const fileStats = fs.statSync(tempFile);
        if (fileStats.size < 1000) return;
        
        const transcription = await transcribeWithGroq(tempFile);
        
        if (!transcription || transcription.trim().length < 3) return;
        
        console.log(`[${userId}]: "${transcription}"`);
        
        const text = transcription.toLowerCase().trim();
        
        const skipPhrases = [
            'hmm', 'uhh', 'ehh', 'ahh', 'umm',
            'hm', 'uh', 'eh', 'ah', 'um',
            'terima kasih', 'thank you', 'thanks',
            'oke', 'okay', 'ok',
            'yes', 'no', 'ya', 'tidak'
        ];
        
        if (skipPhrases.includes(text) || text.length < 5) {
            console.log(`Skipped filler: "${text}"`);
            return;
        }
        
        if (textChannel) {
            textChannel.send(`Voice: ${transcription}`).catch(() => {});
        }
        
        if (session) {
            session.isSpeaking = true;
            session.speakingStartedAt = Date.now();
        }
        
        console.log(`Processing: "${transcription}"`);
        const response = await callAI(guildId, userId, transcription, true);
        console.log(`AI responded (${response.latency}ms)`);
        
        if (textChannel) {
            const info = `${response.model} - ${response.latency}ms`;
            textChannel.send(`${response.text}\n\n-# ${info}`).catch(() => {});
        }
        
        const s = getSettings(guildId);
        const voice = isAdmin(userId) ? (s.ttsVoiceElevenlabs || s.ttsVoice) : s.ttsVoice;
        const ttsFile = await generateTTS(response.text, voice, userId);
        await playTTSInVoice(guildId, ttsFile);
        
        console.log(`Voice response complete!`);
        
        setTimeout(() => {
            const session = voiceAISessions.get(guildId);
            if (session) {
                session.isSpeaking = false;
                console.log(`Ready to listen again`);
            }
        }, 3000);
        
    } catch (error) {
        console.error('Voice error:', error.message);
    } finally {
        cleanupFile(tempFile);
        processingUsers.delete(userId);
    }
}

async function convertOpusToOgg(opusBuffer, outputPath) {
    return new Promise((resolve, reject) => {
        try {
            console.log(`Raw audio size: ${opusBuffer.length} bytes`);
            
            const tempPcm = outputPath.replace('.ogg', '.pcm');
            fs.writeFileSync(tempPcm, opusBuffer);
            
            const ffmpegCmd = `ffmpeg -y -f s16le -ar 48000 -ac 2 -i "${tempPcm}" -ar 16000 -ac 1 -f wav "${outputPath}" 2>/dev/null`;
            
            exec(ffmpegCmd, { timeout: 15000 }, (error) => {
                cleanupFile(tempPcm);
                
                if (error || !fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
                    console.log('FFmpeg failed, creating WAV manually');
                    
                    const wavHeader = createWavHeader(opusBuffer.length, 48000, 2, 16);
                    const wavFile = Buffer.concat([wavHeader, opusBuffer]);
                    fs.writeFileSync(outputPath, wavFile);
                }
                
                const finalSize = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
                console.log(`Audio converted: ${finalSize} bytes`);
                
                resolve(outputPath);
            });
            
        } catch (err) {
            console.error('Conversion error:', err.message);
            fs.writeFileSync(outputPath, opusBuffer);
            resolve(outputPath);
        }
    });
}

function enableVoiceAI(guildId, textChannel = null) {
    voiceAISessions.set(guildId, {
        enabled: true,
        textChannel: textChannel,
        startedAt: Date.now(),
        isSpeaking: false
    });
    
    const conn = voiceConnections.get(guildId);
    if (conn) {
        setupVoiceReceiver(conn, guildId, textChannel);
    }
}

function disableVoiceAI(guildId) {
    voiceAISessions.delete(guildId);
    
    for (const [userId, recording] of voiceRecordings) {
        if (recording.stream) recording.stream.destroy();
        if (recording.timeout) clearTimeout(recording.timeout);
    }
    voiceRecordings.clear();
}

function isVoiceAIEnabled(guildId) {
    return voiceAISessions.get(guildId)?.enabled || false;
}

// ============================================================
//         SETTINGS UI BUILDERS
// ============================================================

function createSettingsEmbed(guildId) {
    const s = getSettings(guildId);
    const ai = AI_PROVIDERS[s.aiProvider];
    const model = ai?.models.find(m => m.id === s.aiModel) || { name: s.aiModel };
    
    const edgeVoice = EDGE_TTS_VOICES.find(v => v.id === s.ttsVoice);
    const elevenVoice = ELEVENLABS_VOICES.find(v => v.id === s.ttsVoiceElevenlabs) || { name: 'MiniMax Clone' };

    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Toing Settings')
        .addFields(
            { name: 'AI Provider', value: `${ai?.name || s.aiProvider}\n${model.name}`, inline: true },
            { name: 'TTS (Public)', value: edgeVoice?.name || s.ttsVoice, inline: true },
            { name: 'TTS (Admin)', value: elevenVoice?.name || 'Default', inline: true },
        )
        .setFooter({ text: 'v3.0.0' })
        .setTimestamp();
}

function createProviderMenu(guildId) {
    const s = getSettings(guildId);
    const opts = Object.entries(AI_PROVIDERS).map(([k, p]) => ({
        label: p.name, 
        value: k, 
        default: k === s.aiProvider
    }));
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('sel_ai')
            .setPlaceholder('AI Provider')
            .addOptions(opts)
    );
}

function createModelMenu(guildId) {
    const s = getSettings(guildId);
    const p = AI_PROVIDERS[s.aiProvider];
    if (!p) return null;

    const opts = p.models.slice(0, 25).map(m => ({
        label: m.name.slice(0, 25), 
        value: m.id, 
        default: m.id === s.aiModel
    }));

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('sel_model')
            .setPlaceholder('Model')
            .addOptions(opts)
    );
}

function createVoiceMenu(guildId) {
    const s = getSettings(guildId);
    
    const opts = EDGE_TTS_VOICES.slice(0, 25).map(v => ({
        label: v.name.slice(0, 25),
        value: v.id,
        default: v.id === s.ttsVoice
    }));
    
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('sel_voice')
            .setPlaceholder('Voice (Public - Edge-TTS)')
            .addOptions(opts)
    );
}

function createElevenlabsVoiceMenu(guildId) {
    const s = getSettings(guildId);
    const voices = ELEVENLABS_VOICES;
    
    if (!voices || voices.length === 0) return null;
    
    const opts = voices.slice(0, 25).map(v => ({
        label: v.name.slice(0, 25), 
        value: v.id,
        description: v.lang === 'id' ? 'Indonesia' : 'English',
        default: v.id === (s.ttsVoiceElevenlabs || 'gmnazjXOFoOcWA59sd5m')
    }));
    
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('sel_voice_elevenlabs')
            .setPlaceholder('Pilih Suara (Admin Only)')
            .addOptions(opts)
    );
}

function createModeButtons(guildId) {
    const s = getSettings(guildId);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('search_toggle')
            .setLabel(s.searchEnabled ? 'Search ON' : 'Search OFF')
            .setStyle(s.searchEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('grounding_toggle')
            .setLabel(s.geminiGrounding ? 'Grounding ON' : 'Grounding OFF')
            .setStyle(s.geminiGrounding ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
}

// ============================================================
//         COMMAND HANDLERS
// ============================================================

async function handleAI(msg, query) {
    const rateCheck = checkRateLimit(msg.author.id);
    if (!rateCheck.allowed) {
        return msg.reply(`Wait ${rateCheck.waitTime}s`);
    }

    let inVoice = false;
    if (msg.member?.voice?.channel) {
        const result = await joinUserVoiceChannel(msg.member, msg.guild);
        if (result.success) inVoice = true;
    }

    await msg.channel.sendTyping();

    try {
        const response = await callAI(msg.guild.id, msg.author.id, query, inVoice);

        const searchIcon = response.searched ? ' [search]' : '';
        const info = `${response.model} - ${response.latency}ms${searchIcon}`;
        const fullResponse = `${response.text}\n\n-# ${info}`;

        const parts = splitMessage(fullResponse);
        for (let i = 0; i < parts.length; i++) {
            if (i === 0) await msg.reply(parts[i]);
            else await msg.channel.send(parts[i]);
        }

        if (inVoice) {
            try {
                const s = getSettings(msg.guild.id);
                const voice = isAdmin(msg.author.id) 
                    ? (s.ttsVoiceElevenlabs || 'gmnazjXOFoOcWA59sd5m') 
                    : (s.ttsVoice || 'id-ID-GadisNeural');
                
                const ttsFile = await generateTTS(response.text, voice, msg.author.id);
                
                if (ttsFile) {
                    await playTTSInVoice(msg.guild.id, ttsFile);
                }
            } catch (e) {
                console.error('TTS error:', e.message);
            }
        }

    } catch (e) {
        console.error('AI Error:', e);
        await msg.reply(`Error: ${e.message}`);
    }
}

async function handleSpeak(msg, text) {
    if (!text) return msg.reply('Usage: .speak <text>');

    const player = audioPlayers.get(msg.guild.id);
    if (!player) return msg.reply('Join voice channel first (.join)');

    const status = await msg.reply('Generating...');

    try {
        const s = getSettings(msg.guild.id);
        const voice = isAdmin(msg.author.id) ? (s.ttsVoiceElevenlabs || s.ttsVoice) : s.ttsVoice;
        const ttsFile = await generateTTS(text, voice, msg.author.id);
        if (ttsFile) {
            await playTTSInVoice(msg.guild.id, ttsFile);
            await status.edit('Playing...');
        } else {
            await status.edit('TTS failed');
        }
    } catch (e) {
        await status.edit(`Error: ${e.message}`);
    }
}

async function handleFileReadWithQuery(msg, attachment, query = '') {
    if (attachment.size > BOT_CONFIG.maxFileSize) {
        return msg.reply(`File too large! Max: ${(BOT_CONFIG.maxFileSize / 1024 / 1024).toFixed(1)} MB`);
    }
    
    const statusMsg = await msg.reply(`Reading ${attachment.name}...`);
    
    try {
        const content = await readFile(attachment);
        
        if (!content || content.trim().length < 10) {
            return statusMsg.edit('File empty or cannot be read');
        }
        
        await statusMsg.edit(`Analyzing ${attachment.name}...`);
        
        const ext = path.extname(attachment.name || '').toLowerCase();
        const isCode = ['.js', '.ts', '.py', '.java', '.c', '.cpp', '.go', '.rs', '.rb', '.php'].includes(ext);
        const isData = ['.json', '.yaml', '.yml', '.xml', '.csv'].includes(ext);
        const isDoc = ['.pdf', '.docx', '.doc', '.txt', '.md'].includes(ext);
        
        let analysisPrompt = '';
        
        if (query) {
            analysisPrompt = `Based on file "${attachment.name}", answer:\n\n[USER REQUEST]\n${query}\n\n`;
        } else if (isCode) {
            analysisPrompt = `Analyze code in "${attachment.name}":\n1. Main function\n2. Patterns used\n3. Improvements\n\n`;
        } else if (isData) {
            analysisPrompt = `Analyze data in "${attachment.name}":\n1. Structure\n2. Key info\n3. Summary\n\n`;
        } else if (isDoc) {
            analysisPrompt = `Analyze document "${attachment.name}":\n1. Summary\n2. Key points\n3. Conclusions\n\n`;
        } else {
            analysisPrompt = `Analyze file "${attachment.name}":\n\n`;
        }
        
        const maxContent = 50000;
        analysisPrompt += `[FILE CONTENT]\n${content.slice(0, maxContent)}`;

        if (content.length > maxContent) {
            analysisPrompt += `\n\n[Note: File truncated, total ${content.length} chars]`;
        }
        
        const response = await callAI(msg.guild.id, msg.author.id, analysisPrompt, false);
        
        let finalMsg = `${attachment.name}\n\n${response.text}`;
        finalMsg += `\n\n-# ${response.model} - ${response.latency}ms`;
        
        if (content.length > 1000000) {
            finalMsg += ` - File truncated`;
        }
        
        const parts = splitMessage(finalMsg);
        await statusMsg.edit(parts[0]);
        
        for (let i = 1; i < parts.length; i++) {
            await msg.channel.send(parts[i]);
        }
        
    } catch (error) {
        console.error('File read error:', error);
        await statusMsg.edit(`Failed to read file: ${error.message}`);
    }
}

async function handleImageAnalysisWithQuery(msg, image, query = '') {
    if (image.size > BOT_CONFIG.maxImageSize) {
        return msg.reply(`Image too large! Max: ${(BOT_CONFIG.maxImageSize / 1024 / 1024).toFixed(1)} MB`);
    }
    
    const statusMsg = await msg.reply(`Analyzing image...`);
    
    try {
        const prompt = query || 'Jelaskan gambar ini secara detail dalam Bahasa Indonesia.';
        
        const analysis = await analyzeImage(image.url, prompt);
        
        let finalMsg = `Image Analysis\n\n${analysis}`;
        finalMsg += `\n\n-# Gemini Vision - ${Date.now() - msg.createdTimestamp}ms`;
        
        const parts = splitMessage(finalMsg);
        await statusMsg.edit(parts[0]);
        
        for (let i = 1; i < parts.length; i++) {
            await msg.channel.send(parts[i]);
        }
        
    } catch (error) {
        console.error('Image analysis error:', error);
        await statusMsg.edit(`Failed to analyze image: ${error.message}`);
    }
}

async function handleURLAnalysis(msg, urls, query = '') {
    const statusMsg = await msg.reply(`Analyzing ${urls.length} URL(s)...`);
    const startTime = Date.now();
    
    try {
        const contents = [];
        const failedUrls = [];
        
        await statusMsg.edit(`[1/3] Fetching content from ${urls.length} sources...`);
        
        for (const url of urls.slice(0, 3)) {
            try {
                const hostname = new URL(url).hostname;
                console.log(`Processing URL: ${hostname}`);
                
                let result;
                if (url.includes('github.com') && url.includes('/blob/')) {
                    const content = await readGitHubFile(url);
                    result = { type: 'github-file', content };
                } else {
                    result = await fetchURLClean(url);
                }
                
                if (result && result.content && result.content.length > 100) {
                    contents.push({
                        url,
                        hostname,
                        type: result.type || 'webpage',
                        title: result.title || hostname,
                        content: result.content
                    });
                }
            } catch (e) {
                console.error(`Failed to fetch ${url}:`, e.message);
                failedUrls.push({ url, error: e.message });
            }
        }
        
        if (contents.length === 0) {
            let errorMsg = 'Failed to read all URLs\n\n';
            if (failedUrls.length > 0) {
                errorMsg += 'Errors:\n';
                failedUrls.forEach(f => {
                    errorMsg += `- ${new URL(f.url).hostname}: ${f.error}\n`;
                });
            }
            return statusMsg.edit(errorMsg);
        }
        
        await statusMsg.edit(`[2/3] Analyzing ${contents.length} sources with AI...`);
        
        const timestamp = new Date().toLocaleDateString('id-ID', { 
            dateStyle: 'full', 
            timeZone: 'Asia/Jakarta' 
        });
        
        let analysisPrompt = `[CURRENT DATE: ${timestamp}]\n\n`;
        
        if (query) {
            analysisPrompt += `[USER REQUEST]\n"${query}"\n\n`;
        } else {
            analysisPrompt += `[TASK]\nAnalyze all sources comprehensively.\n\n`;
        }
        
        analysisPrompt += `[SOURCES - ${contents.length} items]\n\n`;
        
        contents.forEach((content, index) => {
            const preview = content.content.slice(0, 6000);
            analysisPrompt += `SOURCE #${index + 1}: ${content.title}\n`;
            analysisPrompt += `URL: ${content.url}\n`;
            analysisPrompt += `Platform: ${content.type}\n\n`;
            analysisPrompt += `[CONTENT]\n${preview}\n`;
            analysisPrompt += `${content.content.length > 6000 ? '...(truncated)' : ''}\n\n`;
        });
        
        const response = await callAI(msg.guild.id, msg.author.id, analysisPrompt, false);
        
        await statusMsg.edit(`[3/3] Formatting results...`);
        
        const { thinking, answer } = parseThinkingResponse(response.text);
        
        let finalMsg = answer || response.text;
        
        finalMsg += '\n\n---\n';
        finalMsg += `Sources (${contents.length}):\n`;
        
        contents.forEach((c, i) => {
            finalMsg += `${i + 1}. ${c.title.slice(0, 60)} (${c.url})\n`;
        });
        
        if (failedUrls.length > 0) {
            finalMsg += `\n${failedUrls.length} URL(s) failed:\n`;
            failedUrls.forEach(f => {
                finalMsg += `- ${new URL(f.url).hostname}: ${f.error}\n`;
            });
        }
        
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
        finalMsg += `\n-# ${response.model} - ${response.latency}ms AI - ${processingTime}s total`;
        
        const parts = splitMessage(finalMsg, 1900);
        await statusMsg.edit(parts[0]);
        
        for (let i = 1; i < parts.length; i++) {
            await msg.channel.send(parts[i]);
        }
        
        console.log(`URL Analysis completed in ${processingTime}s`);
        
    } catch (error) {
        console.error('URL Analysis error:', error);
        await statusMsg.edit(`Error during analysis:\n${error.message}`);
    }
}

async function handleSearchCommand(msg, query) {
    if (!query) {
        return msg.reply(`Usage: .search <query>\n\nExample:\n- .search berita teknologi hari ini\n- .search harga bitcoin terkini`);
    }
    
    const statusMsg = await msg.reply('Searching...');
    
    try {
        const searchResults = await performSearch(query);
        
        if (!searchResults) {
            return statusMsg.edit('Search not available. Set SERPER_API_KEY or TAVILY_API_KEY.');
        }
        
        if (!searchResults.urls?.length && !searchResults.facts?.length && !searchResults.answer) {
            return statusMsg.edit('No search results found.');
        }
        
        const contents = [];
        if (searchResults.urls && searchResults.urls.length > 0) {
            await statusMsg.edit(`Reading ${searchResults.urls.length} sources...`);
            
            for (const url of searchResults.urls.slice(0, 3)) {
                try {
                    const result = await fetchURLClean(url, { maxLength: 4000, timeout: 10000 });
                    if (result && result.content) {
                        contents.push({ url, content: result.content });
                    }
                } catch (e) {
                    console.error('Search URL fetch failed:', e.message);
                }
            }
        }
        
        await statusMsg.edit('Generating answer...');
        
        let contextPrompt = `Answer the user's question based on internet search results.

[CURRENT DATE: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full', timeZone: 'Asia/Jakarta' })}]

[USER QUESTION]
${query}

[SEARCH RESULTS]
`;
        
        if (searchResults.answer) {
            contextPrompt += `\nDirect Answer: ${searchResults.answer}\n`;
        }
        
        if (searchResults.facts && searchResults.facts.length > 0) {
            contextPrompt += `\nFacts:\n${searchResults.facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`;
        }
        
        if (contents.length > 0) {
            contextPrompt += `\n[DETAILED SOURCES]\n`;
            contents.forEach((c, i) => {
                contextPrompt += `\nSource ${i + 1} (${new URL(c.url).hostname}):\n${c.content.slice(0, 3000)}\n`;
            });
        }
        
        const response = await callAI(msg.guild.id, msg.author.id, contextPrompt, false);
        
        let finalMsg = response.text;
        
        if (searchResults.urls && searchResults.urls.length > 0) {
            finalMsg += '\n\nSources:\n';
            finalMsg += searchResults.urls.slice(0, 3).map(url => {
                try {
                    return `- ${new URL(url).hostname}`;
                } catch {
                    return `- ${url.slice(0, 50)}`;
                }
            }).join('\n');
        }
        
        finalMsg += `\n\n-# ${response.model} - ${response.latency}ms - ${searchResults.source}`;
        
        const parts = splitMessage(finalMsg);
        await statusMsg.edit(parts[0]);
        
        for (let i = 1; i < parts.length; i++) {
            await msg.channel.send(parts[i]);
        }
        
    } catch (error) {
        console.error('Search error:', error);
        await statusMsg.edit(`Error: ${error.message}`);
    }
}

async function handleReadCommand(msg, args) {
    if (args.length > 0 && args[0].match(/^https?:\/\//)) {
        return await handleURLAnalysis(msg, [args[0]], args.slice(1).join(' '));
    }
    
    if (msg.attachments.size > 0) {
        const attachment = msg.attachments.first();
        return await handleFileReadWithQuery(msg, attachment, args.join(' '));
    }
    
    if (msg.reference) {
        try {
            const repliedMsg = await msg.channel.messages.fetch(msg.reference.messageId);
            if (repliedMsg.attachments.size > 0) {
                const attachment = repliedMsg.attachments.first();
                return await handleFileReadWithQuery(msg, attachment, args.join(' '));
            }
        } catch {
            // Ignore fetch error
        }
    }
    
    await msg.reply(`How to use .read:

File Upload:
.read + upload file
.read explain this code + upload file

URL:
.read https://example.com/article
.read https://github.com/user/repo/blob/main/file.js explain

Reply:
Reply to message with attachment + type .read

Supported formats:
- Documents: PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx)
- Code: JS, Python, Java, C++, Go, Rust, etc
- Data: JSON, YAML, XML, CSV
- Text: TXT, MD, LOG, etc`);
}

async function handleAnalyzeCommand(msg, args) {
    if (msg.attachments.size === 0) {
        if (msg.reference) {
            try {
                const repliedMsg = await msg.channel.messages.fetch(msg.reference.messageId);
                if (repliedMsg.attachments.size > 0) {
                    const attachment = repliedMsg.attachments.first();
                    const images = [attachment].filter(a => a.contentType?.startsWith('image/'));
                    if (images.length > 0) {
                        return await handleImageAnalysisWithQuery(msg, images[0], args.join(' '));
                    } else {
                        return await handleFileReadWithQuery(msg, attachment, args.join(' '));
                    }
                }
            } catch {
                // Ignore
            }
        }
        
        return msg.reply(`How to use .analyze:

Image:
.analyze + upload image
.analyze what is in this image? + upload image

File:
.analyze + upload file
.analyze any bugs in this code? + upload file

Reply:
Reply to message with image/file + type .analyze`);
    }
    
    const attachment = msg.attachments.first();
    const images = msg.attachments.filter(a => a.contentType?.startsWith('image/'));
    
    if (images.size > 0) {
        return await handleImageAnalysisWithQuery(msg, images.first(), args.join(' '));
    } else {
        return await handleFileReadWithQuery(msg, attachment, args.join(' '));
    }
}

async function handleStatusCommand(msg, client, startTime, manager) {
    const settings = getSettings(msg.guild.id);
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    
    const formatUptime = (seconds) => {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        
        const parts = [];
        if (d > 0) parts.push(`${d}d`);
        if (h > 0) parts.push(`${h}h`);
        if (m > 0) parts.push(`${m}m`);
        if (s > 0 || parts.length === 0) parts.push(`${s}s`);
        return parts.join(' ');
    };
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Toing AI Bot Status')
        .setDescription('v3.0.0')
        .addFields(
            { name: 'Uptime', value: formatUptime(uptime), inline: true },
            { name: 'Servers', value: `${client.guilds.cache.size}`, inline: true },
            { name: 'Conversations', value: `${conversations.size}`, inline: true },
            {
                name: 'Current Settings',
                value: `AI: ${AI_PROVIDERS[settings.aiProvider]?.name || settings.aiProvider}\nModel: ${settings.aiModel}\nSearch: ${settings.searchEnabled ? 'ON' : 'OFF'}\nGrounding: ${settings.geminiGrounding ? 'ON' : 'OFF'}`,
                inline: false
            },
            {
                name: 'Features',
                value: [
                    `AI Chat: ON`,
                    `Voice AI: ${isVoiceAIEnabled(msg.guild.id) ? 'ON' : 'OFF'}`,
                    `TTS Public: Edge-TTS ON`,
                    `TTS Admin: ${BOT_CONFIG.puterTTS?.enabled ? 'Puter.js ON' : 'Edge-TTS'}`,
                    `Web Search: ${BOT_CONFIG.serperApiKey || BOT_CONFIG.tavilyApiKey ? 'ON' : 'OFF'}`,
                    `Image Analysis: ${BOT_CONFIG.geminiApiKey ? 'ON' : 'OFF'}`
                ].join('\n'),
                inline: true
            },
            {
                name: 'Connections',
                value: [
                    `Redis: ${manager?.connected ? 'ON' : 'OFF'}`,
                    `Voice: ${voiceConnections.size} active`,
                    `WebSocket: ${client.ws.ping}ms`
                ].join('\n'),
                inline: true
            }
        )
        .setTimestamp();
    
    await msg.reply({ embeds: [embed] });
}

async function handleHelpCommand(msg) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Toing AI Bot')
        .setDescription('AI Assistant with multiple capabilities')
        .addFields(
            {
                name: 'Chat AI',
                value: [
                    '.ai <question> - Ask AI',
                    '@Toing <question> - Mention bot',
                    '.clear - Clear conversation memory'
                ].join('\n'),
                inline: false
            },
            {
                name: 'Search',
                value: [
                    '.search <query> - Search internet',
                    'Auto search for real-time questions'
                ].join('\n'),
                inline: false
            },
            {
                name: 'File & Documents',
                value: [
                    '.read + upload file',
                    '.read <url> - Read from URL',
                    '.analyze + upload - Deep analysis',
                    '',
                    'Supported: PDF, Word, Excel, PowerPoint, Code, JSON, YAML, CSV, TXT, MD'
                ].join('\n'),
                inline: false
            },
            {
                name: 'Images',
                value: [
                    '@Toing + upload image',
                    '.analyze + upload image',
                    'Can identify objects, read text, etc'
                ].join('\n'),
                inline: false
            },
            {
                name: 'URL & Web',
                value: [
                    '.url <link> - Read webpage',
                    '@Toing <url> - Auto analyze URL',
                    'Support: GitHub, StackOverflow, articles, docs'
                ].join('\n'),
                inline: false
            },
            {
                name: 'Podcast Mode',
                value: [
                    '.voiceai on - Start podcast (Bot listens & responds)',
                    '.voiceai off - Stop podcast',
                    '.voiceai status - Check status',
                    '',
                    'Voice Commands:',
                    '.speak <text> - Bot speaks (TTS)',
                    '.join / .leave - Control voice channel',
                    '.stop - Stop audio'
                ].join('\n'),
                inline: false
            },
            {
                name: 'Admin Commands',
async function handleHelpCommand(msg) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🤖 Toing AI Bot - Complete Guide')
        .setDescription('Asisten AI dengan berbagai kemampuan canggih')
        .addFields(
            {
                name: '💬 Chat AI',
                value: [
                    '`.ai <pertanyaan>` - Tanya AI',
                    '`@Toing <pertanyaan>` - Mention bot',
                    '`.clear` - Hapus memory'
                ].join('\n'),
                inline: false
            },
            {
                name: '🔍 Search & Info',
                value: [
                    '`.search <query>` - Cari di internet',
                    '`.weather <city>` - Cuaca real-time',
                    '`.forecast <city>` - Prakiraan 5 hari'
                ].join('\n'),
                inline: false
            },
            {
                name: '📄 File & URL',
                value: [
                    '`.read` + upload file',
                    '`.read <url>` - Baca website',
                    '`.analyze` + upload - Analisis detail'
                ].join('\n'),
                inline: false
            },
            {
                name: '🎥 YouTube',
                value: [
                    '`.youtube <url>` - Analisis video',
                    'Auto extract transcript',
                    'Summary + timestamps'
                ].join('\n'),
                inline: false
            },
            {
                name: '💻 Code Execution',
                value: [
                    '`.run <language>`',
                    '```python',
                    'print("Hello")',
                    '```',
                    '`.languages` - List bahasa'
                ].join('\n'),
                inline: false
            },
            {
                name: '📥 Social Media Downloader',
                value: [
                    '`.download <url>` - Download tanpa watermark',
                    'Support: TikTok, Instagram, Twitter/X, Facebook'
                ].join('\n'),
                inline: false
            },
            {
                name: '⏰ Alarm & Reminders',
                value: [
                    '`.alarm set "jam 4 pagi" "Sahur!"` - Set alarm',
                    '`.alarm list` - List alarms',
                    '`.alarm delete <id>` - Hapus alarm',
                    'Bot bisa masuk voice untuk bangunin!'
                ].join('\n'),
                inline: false
            },
            {
                name: '🎙️ Voice AI (Podcast Mode)',
                value: [
                    '`.voiceai on` - Aktivasi mode podcast',
                    'Bot akan dengar & jawab otomatis',
                    '`.voiceai off` - Matikan'
                ].join('\n'),
                inline: false
            },
            {
                name: '🔊 Voice Commands',
                value: [
                    '`.speak <text>` - TTS',
                    '`.join` / `.leave` - Voice channel',
                    '`.stop` - Stop audio'
                ].join('\n'),
                inline: false
            },
            {
                name: '💾 Database',
                value: [
                    '`.remember <key> <value>` - Simpan preferensi',
                    '`.recall` - Lihat preferensi tersimpan'
                ].join('\n'),
                inline: false
            },
            {
                name: '🚀 DevOps (Admin)',
                value: [
                    '`.render list/status/deploy/logs`',
                    '`.github repos/fork/create`',
                    '`.settings` - Bot settings',
                    '`.manage` - API Manager'
                ].join('\n'),
                inline: false
            },
            {
                name: 'ℹ️ Info',
                value: [
                    '`.ping` - Latency',
                    '`.status` - Bot status',
                    '`.model` - AI models',
                    '`.help` - Bantuan ini'
                ].join('\n'),
                inline: false
            }
        )
        .setFooter({ text: 'Toing AI Bot v3.5.0 - Complete Edition + Advanced Skills' })
        .setTimestamp();
    
    await msg.reply({ embeds: [embed] });
            }
async function handleModelInfoCommand(msg) {
    const settings = getSettings(msg.guild.id);
    const currentProvider = AI_PROVIDERS[settings.aiProvider];
    
    let description = `Current: ${currentProvider?.name || settings.aiProvider} - ${settings.aiModel}\n\n`;
    
    description += 'Available Providers:\n';
    
    for (const [key, provider] of Object.entries(AI_PROVIDERS)) {
        const modelCount = provider.models?.length || 0;
        const isActive = key === settings.aiProvider ? ' [active]' : '';
        description += `- ${provider.name}${isActive} (${modelCount} models)\n`;
    }
    
    description += '\nUse .settings to change provider/model';
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('AI Models')
        .setDescription(description)
        .setTimestamp();
    
    await msg.reply({ embeds: [embed] });
}

// ============================================================
//         EXPORTS
// ============================================================

module.exports = {
    // AI Providers
    callGemini,
    callGroq,
    callOpenRouter,
    callPollinationsFree,
    callPollinationsAPI,
    callHuggingFace,
    callAI,
    
    // Image Analysis
    analyzeImage,
    
    // Voice Functions
    joinUserVoiceChannel,
    leaveVoiceChannel,
    processNextInQueue,
    playTTSInVoice,
    
    // Voice AI
    transcribeWithGroq,
    setupVoiceReceiver,
    startRecording,
    cleanupRecording,
    processVoiceInput,
    convertOpusToOgg,
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
};
