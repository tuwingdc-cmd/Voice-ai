// ============================================================
//         GITHUB API WRAPPER - Complete Management
// ============================================================

const https = require('https');
const fs = require('fs');
const path = require('path');

class GitHubAPI {
    constructor(token) {
        this.token = token;
        this.baseUrl = 'api.github.com';
        this.username = null; // Will be fetched on first use
    }

    // ========== HTTP HELPER ==========
    async request(method, path, body = null) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.baseUrl,
                path: path,
                method: method,
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Discord-Bot-DevOps',
                    'Content-Type': 'application/json'
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

    // ========== USER INFO ==========
    
    async getUser() {
        if (!this.username) {
            const user = await this.request('GET', '/user');
            this.username = user.login;
        }
        return this.username;
    }

    // ========== REPOSITORY MANAGEMENT ==========
    
    async listRepos(perPage = 30) {
        return await this.request('GET', `/user/repos?per_page=${perPage}&sort=updated`);
    }

    async getRepo(owner, repo) {
        return await this.request('GET', `/repos/${owner}/${repo}`);
    }

    async createRepo(name, description = '', isPrivate = false) {
        const payload = {
            name,
            description,
            private: isPrivate,
            auto_init: true
        };
        return await this.request('POST', '/user/repos', payload);
    }

    async deleteRepo(owner, repo) {
        await this.request('DELETE', `/repos/${owner}/${repo}`);
        return true;
    }

    // ========== FORK MANAGEMENT ==========
    
    async forkRepo(owner, repo, newName = null) {
        const payload = {};
        if (newName) payload.name = newName;
        
        return await this.request('POST', `/repos/${owner}/${repo}/forks`, payload);
    }

    async listForks(owner, repo) {
        return await this.request('GET', `/repos/${owner}/${repo}/forks`);
    }

    // ========== FILE OPERATIONS ==========
    
    async listContents(owner, repo, path = '', branch = 'main') {
        return await this.request('GET', `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
    }

    async getFile(owner, repo, path, branch = 'main') {
        const data = await this.request('GET', `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
        
        if (data.content) {
            data.decoded_content = Buffer.from(data.content, 'base64').toString('utf-8');
        }
        
        return data;
    }

    async createFile(owner, repo, path, content, message, branch = 'main') {
        const payload = {
            message,
            content: Buffer.from(content).toString('base64'),
            branch
        };
        
        return await this.request('PUT', `/repos/${owner}/${repo}/contents/${path}`, payload);
    }

    async updateFile(owner, repo, path, content, message, sha, branch = 'main') {
        const payload = {
            message,
            content: Buffer.from(content).toString('base64'),
            sha,
            branch
        };
        
        return await this.request('PUT', `/repos/${owner}/${repo}/contents/${path}`, payload);
    }

    async deleteFile(owner, repo, path, message, sha, branch = 'main') {
        const payload = { message, sha, branch };
        await this.request('DELETE', `/repos/${owner}/${repo}/contents/${path}`, payload);
        return true;
    }

    // ========== BRANCH OPERATIONS ==========
    
    async listBranches(owner, repo) {
        return await this.request('GET', `/repos/${owner}/${repo}/branches`);
    }

    async createBranch(owner, repo, branchName, fromBranch = 'main') {
        // Get SHA of source branch
        const ref = await this.request('GET', `/repos/${owner}/${repo}/git/ref/heads/${fromBranch}`);
        const sha = ref.object.sha;
        
        // Create new branch
        const payload = {
            ref: `refs/heads/${branchName}`,
            sha
        };
        
        return await this.request('POST', `/repos/${owner}/${repo}/git/refs`, payload);
    }

    // ========== COMMITS ==========
    
    async listCommits(owner, repo, branch = 'main', perPage = 10) {
        return await this.request('GET', `/repos/${owner}/${repo}/commits?sha=${branch}&per_page=${perPage}`);
    }
}

module.exports = GitHubAPI;
