// ============================================================
//         WEBHOOK SERVER - Real-time Notifications
// ============================================================

const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');

class WebhookServer {
    constructor(client, config) {
        this.client = client;
        this.secret = config.webhookSecret || 'default-secret';
        this.notificationChannelId = config.notificationChannelId || null;
        this.adminIds = config.adminIds || [];
    }

    // ========== WEBHOOK HANDLER (untuk existing HTTP server) ==========
    
    async handleRequest(req, res, body) {
        const path = req.url;
        
        try {
            if (path === '/webhook/render') {
                await this.handleRenderWebhook(req, body);
                res.writeHead(200);
                res.end('OK');
                
            } else if (path === '/webhook/github') {
                await this.handleGitHubWebhook(req, body);
                res.writeHead(200);
                res.end('OK');
                
            } else {
                res.writeHead(404);
                res.end('Not Found');
            }
        } catch (error) {
            console.error('Webhook error:', error);
            res.writeHead(500);
            res.end('Internal Error');
        }
    }

    // ========== RENDER WEBHOOKS ==========
    
    async handleRenderWebhook(req, body) {
        const data = JSON.parse(body);
        
        console.log('📥 Render Webhook:', data.type);
        
        const embed = this.createRenderEmbed(data);
        if (embed) {
            await this.sendNotification(embed);
        }
    }

    createRenderEmbed(data) {
        const type = data.type;
        const service = data.service || {};
        const deploy = data.deploy || {};
        
        let embed = new EmbedBuilder().setTimestamp();
        
        switch (type) {
            case 'deploy_started':
                embed
                    .setColor(0x3498DB)
                    .setTitle('🚀 Deploy Started')
                    .setDescription(`Service **${service.name}** is deploying...`)
                    .addFields(
                        { name: 'Service ID', value: `\`${service.id}\``, inline: true },
                        { name: 'Deploy ID', value: `\`${deploy.id}\``, inline: true }
                    );
                break;
                
            case 'deploy_live':
                embed
                    .setColor(0x46E7A8)
                    .setTitle('✅ Deploy Successful')
                    .setDescription(`Service **${service.name}** is now live!`)
                    .addFields(
                        { name: 'Service ID', value: `\`${service.id}\``, inline: true },
                        { name: 'Deploy ID', value: `\`${deploy.id}\``, inline: true }
                    );
                if (service.url) {
                    embed.addFields({ name: '🌐 URL', value: service.url });
                }
                break;
                
            case 'deploy_failed':
                embed
                    .setColor(0xE74C3C)
                    .setTitle('❌ Deploy Failed')
                    .setDescription(`Service **${service.name}** deployment failed!`)
                    .addFields(
                        { name: 'Service ID', value: `\`${service.id}\``, inline: true },
                        { name: 'Deploy ID', value: `\`${deploy.id}\``, inline: true },
                        { name: 'Reason', value: deploy.reason || 'Unknown error' }
                    );
                break;
                
            case 'service_suspended':
                embed
                    .setColor(0xFFA500)
                    .setTitle('⏸️ Service Suspended')
                    .setDescription(`Service **${service.name}** has been suspended.`)
                    .addFields(
                        { name: 'Service ID', value: `\`${service.id}\``, inline: true }
                    );
                break;
                
            case 'service_resumed':
                embed
                    .setColor(0x46E7A8)
                    .setTitle('▶️ Service Resumed')
                    .setDescription(`Service **${service.name}** is back online.`)
                    .addFields(
                        { name: 'Service ID', value: `\`${service.id}\``, inline: true }
                    );
                break;
                
            case 'server_failed':
            case 'health_check_failed':
                embed
                    .setColor(0xE74C3C)
                    .setTitle('🚨 Service Health Check Failed')
                    .setDescription(`Service **${service.name}** health check is failing!`)
                    .addFields(
                        { name: 'Service ID', value: `\`${service.id}\``, inline: true },
                        { name: 'Action', value: 'Check logs: `.render logs ' + service.id + '`' }
                    );
                break;
                
            default:
                console.log('Unknown Render webhook type:', type);
                return null;
        }
        
        embed.setFooter({ text: 'Render Webhook' });
        return embed;
    }

    // ========== GITHUB WEBHOOKS ==========
    
    async handleGitHubWebhook(req, body) {
        const event = req.headers['x-github-event'];
        const signature = req.headers['x-hub-signature-256'];
        
        // Verify signature if secret is set
        if (this.secret && signature) {
            const hmac = crypto.createHmac('sha256', this.secret);
            const digest = 'sha256=' + hmac.update(body).digest('hex');
            if (signature !== digest) {
                console.warn('⚠️ Invalid GitHub webhook signature');
                return;
            }
        }
        
        const data = JSON.parse(body);
        
        console.log('📥 GitHub Webhook:', event);
        
        const embed = this.createGitHubEmbed(event, data);
        if (embed) {
            await this.sendNotification(embed);
        }
    }

    createGitHubEmbed(event, data) {
        const repo = data.repository;
        const sender = data.sender;
        
        let embed = new EmbedBuilder()
            .setTimestamp()
            .setFooter({ text: 'GitHub Webhook' });
        
        switch (event) {
            case 'push':
                const commits = data.commits || [];
                const branch = data.ref?.replace('refs/heads/', '') || 'unknown';
                
                embed
                    .setColor(0x24292E)
                    .setTitle(`📤 Push to ${repo.name}`)
                    .setURL(data.compare)
                    .setDescription(`**${commits.length}** commit(s) pushed to \`${branch}\``)
                    .setThumbnail(sender?.avatar_url);
                
                if (commits.length > 0) {
                    const commitList = commits.slice(0, 5).map(c => {
                        const sha = c.id.slice(0, 7);
                        const msg = c.message.split('\n')[0].slice(0, 50);
                        return `\`${sha}\` ${msg}`;
                    }).join('\n');
                    
                    embed.addFields({ name: 'Commits', value: commitList });
                }
                break;
                
            case 'pull_request':
                const pr = data.pull_request;
                const action = data.action;
                
                const prColors = {
                    'opened': 0x28A745,
                    'closed': pr.merged ? 0x6F42C1 : 0xCB2431,
                    'reopened': 0x28A745,
                    'synchronize': 0x3498DB
                };
                
                embed
                    .setColor(prColors[action] || 0x24292E)
                    .setTitle(`🔀 PR ${action}: ${pr.title}`)
                    .setURL(pr.html_url)
                    .setDescription(`#${pr.number} in **${repo.name}**`)
                    .addFields(
                        { name: 'Author', value: pr.user.login, inline: true },
                        { name: 'Branch', value: `\`${pr.head.ref}\` → \`${pr.base.ref}\``, inline: true }
                    )
                    .setThumbnail(pr.user.avatar_url);
                break;
                
            case 'issues':
                const issue = data.issue;
                
                embed
                    .setColor(data.action === 'opened' ? 0x28A745 : 0xCB2431)
                    .setTitle(`📋 Issue ${data.action}: ${issue.title}`)
                    .setURL(issue.html_url)
                    .setDescription(`#${issue.number} in **${repo.name}**`)
                    .setThumbnail(issue.user.avatar_url);
                break;
                
            case 'create':
                embed
                    .setColor(0x28A745)
                    .setTitle(`🌿 Branch/Tag Created`)
                    .setDescription(`\`${data.ref}\` created in **${repo.name}**`)
                    .addFields(
                        { name: 'Type', value: data.ref_type, inline: true },
                        { name: 'By', value: sender.login, inline: true }
                    );
                break;
                
            case 'delete':
                embed
                    .setColor(0xCB2431)
                    .setTitle(`🗑️ Branch/Tag Deleted`)
                    .setDescription(`\`${data.ref}\` deleted in **${repo.name}**`)
                    .addFields(
                        { name: 'Type', value: data.ref_type, inline: true },
                        { name: 'By', value: sender.login, inline: true }
                    );
                break;
                
            case 'fork':
                embed
                    .setColor(0x6F42C1)
                    .setTitle(`🍴 Repository Forked`)
                    .setDescription(`**${repo.full_name}** was forked`)
                    .addFields(
                        { name: 'Fork', value: data.forkee.full_name, inline: true },
                        { name: 'By', value: sender.login, inline: true }
                    );
                break;
                
            case 'star':
                if (data.action === 'created') {
                    embed
                        .setColor(0xF1C40F)
                        .setTitle(`⭐ New Star!`)
                        .setDescription(`**${sender.login}** starred **${repo.full_name}**`)
                        .setThumbnail(sender.avatar_url);
                } else {
                    return null; // Don't notify on unstar
                }
                break;
                
            case 'ping':
                embed
                    .setColor(0x3498DB)
                    .setTitle(`🏓 Webhook Connected!`)
                    .setDescription(`GitHub webhook for **${repo?.full_name || 'unknown'}** is now active.`);
                break;
                
            default:
                console.log('Unhandled GitHub event:', event);
                return null;
        }
        
        return embed;
    }

    // ========== NOTIFICATION SENDER ==========
    
    async sendNotification(embed) {
        try {
            // Try notification channel first
            if (this.notificationChannelId) {
                const channel = await this.client.channels.fetch(this.notificationChannelId).catch(() => null);
                if (channel) {
                    await channel.send({ embeds: [embed] });
                    return;
                }
            }
            
            // Fallback: DM to first admin
            if (this.adminIds.length > 0) {
                const admin = await this.client.users.fetch(this.adminIds[0]).catch(() => null);
                if (admin) {
                    await admin.send({ embeds: [embed] });
                }
            }
        } catch (error) {
            console.error('Failed to send webhook notification:', error.message);
        }
    }
}

module.exports = WebhookServer;
