// src/modules/puppeteer-scraper.js

const puppeteer = require('puppeteer');

class PuppeteerScraper {
    constructor() {
        this.browser = null;
        this.defaultOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        };
    }

    async initialize() {
        if (this.browser) return;

        try {
            this.browser = await puppeteer.launch(this.defaultOptions);
            console.log('✅ Puppeteer browser launched');
        } catch (error) {
            console.error('Failed to launch Puppeteer:', error.message);
            throw error;
        }
    }

    async scrapeURL(url, options = {}) {
        await this.initialize();

        const page = await this.browser.newPage();

        try {
            // Set viewport
            await page.setViewport({ width: 1920, height: 1080 });

            // Set user agent
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            // Navigate to URL
            await page.goto(url, { 
                waitUntil: options.waitUntil || 'networkidle2',
                timeout: options.timeout || 30000
            });

            // Wait for selector if provided
            if (options.waitForSelector) {
                await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
            }

            // Execute custom script if provided
            if (options.executeScript) {
                await page.evaluate(options.executeScript);
            }

            // Extract data
            const data = await page.evaluate(() => {
                // Remove unwanted elements
                const removeSelectors = [
                    'script', 'style', 'noscript', 'iframe',
                    'nav', 'header', 'footer', 'aside',
                    '.ad', '.ads', '.advertisement', '.banner',
                    '.sidebar', '.menu', '.navigation'
                ];

                removeSelectors.forEach(selector => {
                    document.querySelectorAll(selector).forEach(el => el.remove());
                });

                // Extract main content
                const mainContent = 
                    document.querySelector('article')?.innerText ||
                    document.querySelector('main')?.innerText ||
                    document.querySelector('.content')?.innerText ||
                    document.querySelector('.post')?.innerText ||
                    document.body.innerText;

                // Extract metadata
                const getMetaContent = (name) => {
                    const meta = document.querySelector(`meta[name="${name}"]`) ||
                                document.querySelector(`meta[property="${name}"]`);
                    return meta?.getAttribute('content') || '';
                };

                return {
                    title: document.title,
                    description: getMetaContent('description') || getMetaContent('og:description'),
                    author: getMetaContent('author'),
                    keywords: getMetaContent('keywords'),
                    ogImage: getMetaContent('og:image'),
                    content: mainContent,
                    url: window.location.href,
                    links: Array.from(document.querySelectorAll('a[href]'))
                        .map(a => ({ text: a.innerText.trim(), href: a.href }))
                        .filter(l => l.text && l.href)
                        .slice(0, 20),
                    images: Array.from(document.querySelectorAll('img[src]'))
                        .map(img => img.src)
                        .slice(0, 10)
                };
            });

            // Take screenshot if requested
            if (options.screenshot) {
                const screenshotPath = `./temp/screenshot_${Date.now()}.png`;
                await page.screenshot({ 
                    path: screenshotPath,
                    fullPage: options.fullPageScreenshot || false
                });
                data.screenshot = screenshotPath;
            }

            return {
                success: true,
                data: data
            };

        } catch (error) {
            console.error('Puppeteer scrape error:', error.message);
            return {
                success: false,
                error: error.message
            };
        } finally {
            await page.close();
        }
    }

    async scrapeDynamicContent(url, scrollCount = 3) {
        await this.initialize();

        const page = await this.browser.newPage();

        try {
            await page.setViewport({ width: 1920, height: 1080 });
            await page.goto(url, { waitUntil: 'networkidle2' });

            // Auto-scroll to load dynamic content
            for (let i = 0; i < scrollCount; i++) {
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                await page.waitForTimeout(2000);
            }

            const content = await page.evaluate(() => document.body.innerText);

            return {
                success: true,
                content: content
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        } finally {
            await page.close();
        }
    }

    async executeCustomScript(url, script) {
        await this.initialize();

        const page = await this.browser.newPage();

        try {
            await page.goto(url, { waitUntil: 'networkidle2' });
            const result = await page.evaluate(script);

            return {
                success: true,
                result: result
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        } finally {
            await page.close();
        }
    }

    async getPDF(url, outputPath) {
        await this.initialize();

        const page = await this.browser.newPage();

        try {
            await page.goto(url, { waitUntil: 'networkidle2' });
            await page.pdf({
                path: outputPath,
                format: 'A4',
                printBackground: true
            });

            return {
                success: true,
                path: outputPath
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        } finally {
            await page.close();
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            console.log('Puppeteer browser closed');
        }
    }
}

module.exports = PuppeteerScraper;
