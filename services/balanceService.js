const fs = require('fs').promises;
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

class BalanceService {
    constructor() {
        this.balanceHistoryFile = path.join(__dirname, '..', 'data', 'balance_history.json');
        this.portalUrl = 'https://free2.airlinesim.aero/action/portal/index';
    }

    /**
     * Lädt den aktuellen Kontostand vom AirlineSim Portal
     * @param {Object} page - Puppeteer page object
     * @returns {Object} Balance information with amount and currency
     */
    async getCurrentBalance(page) {
        try {
            console.log('⚖️ Loading current account balance...');
            
            // Navigate to portal page
            await page.goto(this.portalUrl, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            // Wait for balance element to be present
            await page.waitForSelector('a.balance', { timeout: 10000 });

            // Extract balance data
            const balanceData = await page.evaluate(() => {
                const balanceLink = document.querySelector('a.balance');
                if (!balanceLink) return null;

                // Look for the amount in span with class "good" or "bad"
                const amountSpan = balanceLink.querySelector('span.good, span.bad');
                const amountText = amountSpan ? amountSpan.textContent.trim() : null;
                
                // Extract currency (should be "AS$")
                const currencyText = balanceLink.textContent.replace(amountText || '', '').trim();
                
                // Determine if balance is positive or negative
                const isPositive = amountSpan ? amountSpan.classList.contains('good') : true;
                
                return {
                    rawAmount: amountText,
                    currency: currencyText,
                    isPositive: isPositive,
                    fullText: balanceLink.textContent.trim()
                };
            });

            if (!balanceData || !balanceData.rawAmount) {
                throw new Error('Balance information not found on page');
            }

            // Parse amount (remove commas and convert to number)
            const numericAmount = parseFloat(balanceData.rawAmount.replace(/,/g, ''));
            const finalAmount = balanceData.isPositive ? numericAmount : -numericAmount;

            const balanceInfo = {
                amount: finalAmount,
                currency: balanceData.currency,
                rawAmount: balanceData.rawAmount,
                isPositive: balanceData.isPositive,
                timestamp: new Date().toISOString(),
                url: this.portalUrl
            };

            console.log(`💰 Current balance: ${balanceData.currency} ${balanceData.rawAmount} (${balanceData.isPositive ? 'positive' : 'negative'})`);
            
            return balanceInfo;

        } catch (error) {
            console.error('❌ Error loading current balance:', error.message);
            throw new Error(`Failed to load balance: ${error.message}`);
        }
    }

    /**
     * Speichert Balance-Daten in der Historie für Charts
     * @param {Object} balanceInfo - Balance information from getCurrentBalance
     */
    async saveBalanceHistory(balanceInfo) {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(this.balanceHistoryFile);
            await fs.mkdir(dataDir, { recursive: true });

            let history = [];
            
            // Load existing history
            try {
                const existingData = await fs.readFile(this.balanceHistoryFile, 'utf8');
                history = JSON.parse(existingData);
            } catch (error) {
                // File doesn't exist yet, start with empty array
                console.log('📊 Creating new balance history file');
            }

            // Add new entry
            const historyEntry = {
                ...balanceInfo,
                id: Date.now() // Simple ID based on timestamp
            };

            history.push(historyEntry);

            // Keep only last 1000 entries to prevent file from getting too large
            if (history.length > 1000) {
                history = history.slice(-1000);
            }

            // Save updated history
            await fs.writeFile(this.balanceHistoryFile, JSON.stringify(history, null, 2));
            
            console.log(`📈 Balance history saved (${history.length} entries total)`);
            
            return {
                entriesTotal: history.length,
                latestEntry: historyEntry
            };

        } catch (error) {
            console.error('❌ Error saving balance history:', error.message);
            throw new Error(`Failed to save balance history: ${error.message}`);
        }
    }

    /**
     * Lädt und gibt Balance-Historie für Charts zurück
     * @param {number} limit - Maximum number of entries to return (default: 100)
     * @returns {Array} Array of balance history entries
     */
    async getBalanceHistory(limit = 100) {
        try {
            const existingData = await fs.readFile(this.balanceHistoryFile, 'utf8');
            const history = JSON.parse(existingData);
            
            // Return latest entries up to limit
            const limitedHistory = history.slice(-limit);
            
            console.log(`📊 Retrieved ${limitedHistory.length} balance history entries`);
            
            return limitedHistory;

        } catch (error) {
            console.log('📊 No balance history found, returning empty array');
            return [];
        }
    }

    /**
     * Erstellt eine neue Browser-Session und lädt den aktuellen Kontostand
     * @returns {Object} Balance information
     */
    async loadBalanceWithNewSession() {
        let browser = null;
        let page = null;

        try {
            console.log('🌐 Starting new browser session for balance check...');
            
            browser = await puppeteer.launch({ 
                headless: false,
                defaultViewport: null,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            page = await browser.newPage();
            
            // Load cookies for authentication
            try {
                const cookiesData = await fs.readFile(path.join(__dirname, '..', 'cookies.json'), 'utf8');
                const cookies = JSON.parse(cookiesData);
                await page.setCookie(...cookies);
                console.log('🍪 Cookies loaded for authentication');
            } catch (error) {
                console.warn('⚠️ Could not load cookies, may need to login first');
            }

            // Get current balance
            const balanceInfo = await this.getCurrentBalance(page);
            
            // Save to history
            await this.saveBalanceHistory(balanceInfo);
            
            return balanceInfo;

        } catch (error) {
            console.error('❌ Error in loadBalanceWithNewSession:', error.message);
            throw error;
        } finally {
            if (page) await page.close();
            if (browser) await browser.close();
        }
    }

    /**
     * Generiert Balance-Statistiken aus der Historie
     * @returns {Object} Balance statistics
     */
    async getBalanceStatistics() {
        try {
            const history = await this.getBalanceHistory(1000); // Get more data for stats
            
            if (history.length === 0) {
                return {
                    totalEntries: 0,
                    message: 'No balance history available'
                };
            }

            const amounts = history.map(entry => entry.amount);
            const latest = history[history.length - 1];
            const oldest = history[0];
            
            const stats = {
                totalEntries: history.length,
                latestBalance: latest.amount,
                latestCurrency: latest.currency,
                latestTimestamp: latest.timestamp,
                oldestBalance: oldest.amount,
                oldestTimestamp: oldest.timestamp,
                maxBalance: Math.max(...amounts),
                minBalance: Math.min(...amounts),
                averageBalance: amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length,
                balanceChange: latest.amount - oldest.amount,
                balanceChangePercent: oldest.amount !== 0 ? ((latest.amount - oldest.amount) / Math.abs(oldest.amount)) * 100 : 0,
                timeRange: {
                    from: oldest.timestamp,
                    to: latest.timestamp,
                    durationHours: (new Date(latest.timestamp) - new Date(oldest.timestamp)) / (1000 * 60 * 60)
                }
            };

            console.log(`📈 Balance Statistics: Current ${stats.latestCurrency} ${stats.latestBalance.toLocaleString()}, Change: ${stats.balanceChange > 0 ? '+' : ''}${stats.balanceChange.toLocaleString()} (${stats.balanceChangePercent.toFixed(2)}%)`);
            
            return stats;

        } catch (error) {
            console.error('❌ Error generating balance statistics:', error.message);
            throw error;
        }
    }
}

module.exports = { BalanceService };
