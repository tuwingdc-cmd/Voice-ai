// src/modules/alarm-scheduler.js

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

class AlarmScheduler {
    constructor(client, generateTTS, playTTSInVoice, joinUserVoiceChannel) {
        this.client = client;
        this.generateTTS = generateTTS;
        this.playTTSInVoice = playTTSInVoice;
        this.joinUserVoiceChannel = joinUserVoiceChannel;
        
        this.alarms = new Map();
        this.scheduledJobs = new Map();
        this.dbPath = './data/alarms.json';
        
        this.loadAlarms();
    }

    loadAlarms() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const data = fs.readFileSync(this.dbPath, 'utf-8');
                const alarmsData = JSON.parse(data);
                
                alarmsData.forEach(alarm => {
                    this.alarms.set(alarm.id, alarm);
                    this.scheduleAlarm(alarm);
                });
                
                console.log(`Loaded ${this.alarms.size} alarms`);
            }
        } catch (error) {
            console.error('Failed to load alarms:', error.message);
        }
    }

    saveAlarms() {
        try {
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            const alarmsData = Array.from(this.alarms.values());
            fs.writeFileSync(this.dbPath, JSON.stringify(alarmsData, null, 2));
        } catch (error) {
            console.error('Failed to save alarms:', error.message);
        }
    }

    createAlarm(userId, guildId, channelId, cronExpression, message, voiceChannelId = null, options = {}) {
        const alarmId = `${userId}-${Date.now()}`;
        
        const alarm = {
            id: alarmId,
            userId,
            guildId,
            channelId,
            voiceChannelId,
            cronExpression,
            message,
            options: {
                repeat: options.repeat !== false, // default true
                tts: options.tts !== false, // default true
                mention: options.mention !== false, // default true
                customSound: options.customSound || null
            },
            createdAt: Date.now(),
            lastTriggered: null,
            triggerCount: 0,
            active: true
        };
        
        this.alarms.set(alarmId, alarm);
        this.scheduleAlarm(alarm);
        this.saveAlarms();
        
        return alarm;
    }

    scheduleAlarm(alarm) {
        if (!alarm.active) return;
        
        try {
            const job = cron.schedule(alarm.cronExpression, async () => {
                await this.triggerAlarm(alarm.id);
            }, {
                timezone: 'Asia/Jakarta'
            });
            
            this.scheduledJobs.set(alarm.id, job);
            console.log(`Scheduled alarm ${alarm.id}: ${alarm.cronExpression}`);
            
        } catch (error) {
            console.error(`Failed to schedule alarm ${alarm.id}:`, error.message);
        }
    }

    async triggerAlarm(alarmId) {
        const alarm = this.alarms.get(alarmId);
        if (!alarm) return;
        
        console.log(`Triggering alarm ${alarmId}`);
        
        try {
            // Update alarm stats
            alarm.lastTriggered = Date.now();
            alarm.triggerCount++;
            this.saveAlarms();
            
            const guild = this.client.guilds.cache.get(alarm.guildId);
            if (!guild) {
                console.error(`Guild ${alarm.guildId} not found`);
                return;
            }
            
            const textChannel = guild.channels.cache.get(alarm.channelId);
            
            // Text notification
            if (textChannel) {
                const mention = alarm.options.mention ? `<@${alarm.userId}>` : '';
                const emoji = this.getAlarmEmoji(alarm.message);
                
                await textChannel.send(`${emoji} ${mention} **ALARM!**\n${alarm.message}`);
            }
            
            // Voice notification
            if (alarm.voiceChannelId && alarm.options.tts) {
                await this.triggerVoiceAlarm(alarm, guild);
            }
            
            // Disable if not repeating
            if (!alarm.options.repeat) {
                this.deleteAlarm(alarmId);
            }
            
        } catch (error) {
            console.error(`Error triggering alarm ${alarmId}:`, error.message);
        }
    }

    async triggerVoiceAlarm(alarm, guild) {
        try {
            // Get user member
            const member = await guild.members.fetch(alarm.userId);
            if (!member) return;
            
            // Check if user in voice channel
            const userVoiceChannel = member.voice.channel;
            const targetVoiceChannel = guild.channels.cache.get(alarm.voiceChannelId) || userVoiceChannel;
            
            if (!targetVoiceChannel) {
                console.log(`User ${alarm.userId} not in voice channel`);
                return;
            }
            
            // Join voice channel
            const joinResult = await this.joinUserVoiceChannel(member, guild);
            if (!joinResult.success) {
                console.error('Failed to join voice:', joinResult.error);
                return;
            }
            
            // Generate TTS message
            const ttsMessage = alarm.options.customSound || 
                              `Alarm! ${alarm.message}. Bangun, bangun, bangun! Saatnya sahur!`;
            
            const ttsFile = await this.generateTTS(ttsMessage, 'id-ID-GadisNeural');
            
            // Play TTS
            await this.playTTSInVoice(alarm.guildId, ttsFile);
            
            console.log(`Voice alarm played for ${alarm.userId}`);
            
        } catch (error) {
            console.error('Voice alarm error:', error.message);
        }
    }

    deleteAlarm(alarmId) {
        const job = this.scheduledJobs.get(alarmId);
        if (job) {
            job.stop();
            this.scheduledJobs.delete(alarmId);
        }
        
        this.alarms.delete(alarmId);
        this.saveAlarms();
        
        console.log(`Deleted alarm ${alarmId}`);
    }

    getAlarmEmoji(message) {
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.includes('sahur') || lowerMessage.includes('subuh')) return '🌙';
        if (lowerMessage.includes('sholat') || lowerMessage.includes('salat')) return '🕌';
        if (lowerMessage.includes('meeting')) return '💼';
        if (lowerMessage.includes('makan')) return '🍽️';
        if (lowerMessage.includes('olahraga')) return '🏃';
        if (lowerMessage.includes('tidur')) return '😴';
        
        return '⏰';
    }

    getUserAlarms(userId) {
        return Array.from(this.alarms.values())
            .filter(alarm => alarm.userId === userId && alarm.active);
    }

    getGuildAlarms(guildId) {
        return Array.from(this.alarms.values())
            .filter(alarm => alarm.guildId === guildId && alarm.active);
    }

    parseTimeExpression(expression, timezone = 'Asia/Jakarta') {
        // Parse natural language time expressions
        // Examples: "setiap hari jam 4 pagi", "senin-jumat jam 7", "3:30 AM"
        
        const now = new Date();
        
        // Pattern: "jam XX:XX" or "XX:XX"
        const timeMatch = expression.match(/(\d{1,2}):(\d{2})\s*(am|pm|pagi|siang|sore|malam)?/i);
        if (timeMatch) {
            let hour = parseInt(timeMatch[1]);
            const minute = parseInt(timeMatch[2]);
            const period = timeMatch[3]?.toLowerCase();
            
            if (period === 'pm' || period === 'sore' || period === 'malam') {
                if (hour < 12) hour += 12;
            } else if (period === 'am' || period === 'pagi') {
                if (hour === 12) hour = 0;
            }
            
            // Daily alarm
            if (expression.includes('setiap hari') || expression.includes('every day')) {
                return `${minute} ${hour} * * *`;
            }
            
            // Weekdays
            if (expression.includes('senin-jumat') || expression.includes('weekdays')) {
                return `${minute} ${hour} * * 1-5`;
            }
            
            // Weekend
            if (expression.includes('weekend') || expression.includes('sabtu-minggu')) {
                return `${minute} ${hour} * * 0,6`;
            }
            
            // Specific day
            const days = {
                'senin': 1, 'monday': 1,
                'selasa': 2, 'tuesday': 2,
                'rabu': 3, 'wednesday': 3,
                'kamis': 4, 'thursday': 4,
                'jumat': 5, 'friday': 5,
                'sabtu': 6, 'saturday': 6,
                'minggu': 0, 'sunday': 0
            };
            
            for (const [dayName, dayNum] of Object.entries(days)) {
                if (expression.toLowerCase().includes(dayName)) {
                    return `${minute} ${hour} * * ${dayNum}`;
                }
            }
            
            // Default: daily
            return `${minute} ${hour} * * *`;
        }
        
        return null;
    }

    validateCronExpression(expression) {
        try {
            cron.validate(expression);
            return true;
        } catch (error) {
            return false;
        }
    }

    formatNextRun(cronExpression) {
        try {
            const interval = cron.validate(cronExpression);
            // This is a simplified version, actual implementation would need a cron parser
            return 'Soon'; // Placeholder
        } catch {
            return 'Invalid';
        }
    }
}

module.exports = AlarmScheduler;
