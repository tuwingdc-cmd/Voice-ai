// src/core/botHandlers.js - COMPLETE FIXED VERSION

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
    guildSettings,
    voiceConnections,
    audioPlayers,
    ttsQueues,
    conversations,
    voiceRecordings,
    voiceAISessions,
    processingUsers,
    ensureTempDir,
    cleanupFile,
    splitMessage,
    isAdmin,
    checkRateLimit,
    httpRequest,
    getSettings,
    updateSettings,
    getConversation,
    addToConversation,
    clearConversation,
    shouldSearch,
    generateTTS,
    readFile,
    fetchURLClean,
    readGitHubFile,
    performSearch,
    parseThinkingResponse,
    buildContextPrompt,
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
//         VOICE FUNCTIONS (Simplified - no Voice AI for now)
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

        return { success: true, channel: vc };

    } catch (e) {
        console.error('Voice join error:', e.message);
        return { success: false, error: e.message };
    }
}

async function leaveVoiceChannel(guild) {
    const guildId = guild.id || guild;
    
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

// Voice AI functions (disabled for now)
function enableVoiceAI(guildId, textChannel) {
    console.log('Voice AI not implemented yet');
}

function disableVoiceAI(guildId) {
    console.log('Voice AI not implemented yet');
}

function isVoiceAIEnabled(guildId) {
    return false;
}

// ============================================================
//         SETTINGS UI BUILDERS
// ============================================================

function createSettingsEmbed(guildId) {
    const s = getSettings(guildId);
    const ai = AI_PROVIDERS[s.aiProvider];
    const model = ai?.models.find(m => m.id === s.aiModel) || { name: s.aiModel };
    
    const edgeVoice = EDGE_TTS_VOICES.find(v => v.id === s.ttsVoice);

    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Toing Settings')
        .addFields(
            { name: 'AI Provider', value: `${ai?.name || s.aiProvider}\n${model.name}`, inline: true },
            { name: 'TTS Voice', value: edgeVoice?.name || s.ttsVoice, inline: true }
        )
        .setFooter({ text: 'v3.5.0' })
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
            .setPlaceholder('Voice')
            .addOptions(opts)
    );
}

function createElevenlabsVoiceMenu(guildId) {
    return null; // Disabled for now
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
                const voice = s.ttsVoice || 'id-ID-GadisNeural';
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
        const voice = s.ttsVoice || 'id-ID-GadisNeural';
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
        
        let analysisPrompt = query || (isCode ? 'Analyze this code' : 'Summarize this file');
        analysisPrompt += `\n\nFile: ${attachment.name}\n\n${content.slice(0, 50000)}`;
        
        const response = await callAI(msg.guild.id, msg.author.id, analysisPrompt, false);
        
        let finalMsg = `${attachment.name}\n\n${response.text}`;
        finalMsg += `\n\n-# ${response.model} - ${response.latency}ms`;
        
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
    
    try {
        const contents = [];
        
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
                        content: result.content
                    });
                }
            } catch (e) {
                console.error(`Failed to fetch ${url}:`, e.message);
            }
        }
        
        if (contents.length === 0) {
            return statusMsg.edit('Failed to read URLs');
        }
        
        let analysisPrompt = query || 'Analisis konten dari URL ini';
        analysisPrompt += '\n\nSources:\n';
        
        contents.forEach((c, i) => {
            analysisPrompt += `\nSource ${i + 1} (${c.hostname}):\n${c.content.slice(0, 6000)}\n`;
        });
        
        const response = await callAI(msg.guild.id, msg.author.id, analysisPrompt, false);
        
        let finalMsg = response.text;
        finalMsg += '\n\nSources:\n';
        contents.forEach((c, i) => {
            finalMsg += `${i + 1}. ${c.hostname}\n`;
        });
        
        finalMsg += `\n-# ${response.model} - ${response.latency}ms`;
        
        const parts = splitMessage(finalMsg, 1900);
        await statusMsg.edit(parts[0]);
        
        for (let i = 1; i < parts.length; i++) {
            await msg.channel.send(parts[i]);
        }
        
    } catch (error) {
        console.error('URL Analysis error:', error);
        await statusMsg.edit(`Error: ${error.message}`);
    }
}

async function handleSearchCommand(msg, query) {
    if (!query) {
        return msg.reply('Usage: .search <query>');
    }
    
    const statusMsg = await msg.reply('Searching...');
    
    try {
        const searchResults = await performSearch(query);
        
        if (!searchResults) {
            return statusMsg.edit('Search not available');
        }
        
        const contents = [];
        if (searchResults.urls && searchResults.urls.length > 0) {
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
        
        let contextPrompt = `Answer based on search results:\n\n${query}\n\n`;
        
        if (searchResults.answer) {
            contextPrompt += `Answer: ${searchResults.answer}\n\n`;
        }
        
        if (contents.length > 0) {
            contents.forEach((c, i) => {
                contextPrompt += `Source ${i + 1}:\n${c.content.slice(0, 3000)}\n\n`;
            });
        }
        
        const response = await callAI(msg.guild.id, msg.author.id, contextPrompt, false);
        
        let finalMsg = response.text;
        
        if (searchResults.urls && searchResults.urls.length > 0) {
            finalMsg += '\n\nSources:\n';
            finalMsg += searchResults.urls.slice(0, 3).map(url => `- ${new URL(url).hostname}`).join('\n');
        }
        
        finalMsg += `\n\n-# ${response.model} - ${response.latency}ms`;
        
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
    
    await msg.reply('Usage: .read <url> OR .read + upload file');
}

async function handleAnalyzeCommand(msg, args) {
    if (msg.attachments.size === 0) {
        return msg.reply('Usage: .analyze + upload file/image');
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
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Toing AI Bot Status')
        .setDescription('v3.5.0')
        .addFields(
            { name: 'Uptime', value: `${uptime}s`, inline: true },
            { name: 'Servers', value: `${client.guilds.cache.size}`, inline: true },
            { name: 'AI Provider', value: settings.aiProvider, inline: true }
        )
        .setTimestamp();
    
    await msg.reply({ embeds: [embed] });
}

async function handleHelpCommand(msg) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Toing AI Bot')
        .setDescription('AI Assistant')
        .addFields(
            {
                name: 'Chat AI',
                value: '.ai <question> - Ask AI\n@Toing <question> - Mention\n.clear - Clear memory',
                inline: false
            },
            {
                name: 'Search',
                value: '.search <query> - Search internet',
                inline: false
            },
            {
                name: 'Files & URLs',
                value: '.read + upload OR .read <url>\n.analyze + upload',
                inline: false
            },
            {
                name: 'Voice',
                value: '.join / .leave - Voice channel\n.speak <text> - TTS\n.stop - Stop audio',
                inline: false
            }
        )
        .setFooter({ text: 'Toing v3.5.0' })
        .setTimestamp();
    
    await msg.reply({ embeds: [embed] });
}

async function handleModelInfoCommand(msg) {
    const settings = getSettings(msg.guild.id);
    const currentProvider = AI_PROVIDERS[settings.aiProvider];
    
    let description = `Current: ${currentProvider?.name || settings.aiProvider}\n\nUse .settings to change`;
    
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
    callAI,
    analyzeImage,
    joinUserVoiceChannel,
    leaveVoiceChannel,
    playTTSInVoice,
    enableVoiceAI,
    disableVoiceAI,
    isVoiceAIEnabled,
    createSettingsEmbed,
    createProviderMenu,
    createModelMenu,
    createVoiceMenu,
    createElevenlabsVoiceMenu,
    createModeButtons,
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
