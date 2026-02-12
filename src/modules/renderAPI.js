// ============================================================
//         RENDER API WRAPPER - Complete Management
// ============================================================

const https = require('https');

class RenderAPI {
    constructor(apiKey, ownerId) {
        this.apiKey = apiKey;
        this.ownerId = ownerId;
        this.baseUrl = 'api.render.com';
    }

    // ========== HTTP HELPER ==========
    async request(method, path, body = null) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.baseUrl,
                path: path,
                method: method,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 30000
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = data ? JSON.parse(data) : {};
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(parsed);
                        } else {
                            reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
                        }
                    } catch (e) {
                        reject(new Error(`Parse error: ${e.message}`));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (body) req.write(JSON.stringify(body));
            req.end();
        });
    }

    // ========== SERVICE MANAGEMENT ==========
    
    async listServices() {
        return await this.request('GET', `/v1/services?ownerId=${this.ownerId}&limit=100`);
    }

    async getService(serviceId) {
        return await this.request('GET', `/v1/services/${serviceId}`);
    }

    async createService(options) {
        const {
            name,
            repo,
            branch = 'main',
            region = 'oregon',
            plan = 'free',
            buildCommand = 'npm install',
            startCommand = 'npm start',
            envVars = []
        } = options;

        const payload = {
            type: 'web_service',
            name,
            ownerId: this.ownerId,
            repo,
            branch,
            region,
            plan,
            buildCommand,
            startCommand,
            envVars
        };

        return await this.request('POST', '/v1/services', payload);
    }

    async updateService(serviceId, updates) {
        return await this.request('PATCH', `/v1/services/${serviceId}`, updates);
    }

    async suspendService(serviceId) {
        return await this.request('POST', `/v1/services/${serviceId}/suspend`);
    }

    async resumeService(serviceId) {
        return await this.request('POST', `/v1/services/${serviceId}/resume`);
    }

    async deleteService(serviceId) {
        await this.request('DELETE', `/v1/services/${serviceId}`);
        return true;
    }

    // ========== DEPLOY MANAGEMENT ==========
    
    async deploy(serviceId, clearCache = false) {
        const payload = {
            clearCache: clearCache ? 'clear' : 'do_not_clear'
        };
        return await this.request('POST', `/v1/services/${serviceId}/deploys`, payload);
    }

    async listDeploys(serviceId, limit = 10) {
        return await this.request('GET', `/v1/services/${serviceId}/deploys?limit=${limit}`);
    }

    async getDeploy(serviceId, deployId) {
        return await this.request('GET', `/v1/services/${serviceId}/deploys/${deployId}`);
    }

    // ========== ENVIRONMENT VARIABLES ==========
    
    async getEnvVars(serviceId) {
        return await this.request('GET', `/v1/services/${serviceId}/env-vars`);
    }

    async setEnvVar(serviceId, key, value) {
        return await this.request('PUT', `/v1/services/${serviceId}/env-vars/${key}`, { value });
    }

    async deleteEnvVar(serviceId, key) {
        await this.request('DELETE', `/v1/services/${serviceId}/env-vars/${key}`);
        return true;
    }

    // ========== LOGS ==========
    
    async getLogs(serviceId, options = {}) {
        const { limit = 100, startTime, endTime, level } = options;
        
        // Default: last 1 hour
        const end = endTime || new Date();
        const start = startTime || new Date(end - 3600000);

        let query = `resource=${serviceId}&ownerId=${this.ownerId}&limit=${limit}`;
        query += `&startTime=${start.toISOString()}`;
        query += `&endTime=${end.toISOString()}`;
        if (level) query += `&level=${level}`;

        return await this.request('GET', `/v1/logs?${query}`);
    }
}

module.exports = RenderAPI;
