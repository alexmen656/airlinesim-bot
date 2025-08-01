const { BalanceService } = require('./services/balanceService');

/**
 * Utility functions for balance checks that any module can use
 */
class BalanceUtils {
    constructor() {
        this.balanceService = new BalanceService();
    }

    /**
     * Quick balance check - returns current balance with page
     * @param {Object} page - Puppeteer page object
     * @returns {Object} Current balance info
     */
    async quickBalanceCheck(page) {
        try {
            const balance = await this.balanceService.getCurrentBalance(page);
            await this.balanceService.saveBalanceHistory(balance);
            return balance;
        } catch (error) {
            console.error('❌ Quick balance check failed:', error.message);
            throw error;
        }
    }

    /**
     * Check if we can afford a specific amount
     * @param {Object} page - Puppeteer page object
     * @param {number} amount - Amount to check affordability for
     * @returns {Object} Balance info with affordability check
     */
    async canAfford(page, amount) {
        try {
            const balance = await this.quickBalanceCheck(page);
            
            return {
                ...balance,
                requiredAmount: amount,
                canAfford: balance.amount >= amount,
                shortfall: Math.max(0, amount - balance.amount),
                affordabilityRatio: balance.amount / amount,
                recommendation: balance.amount >= amount ? 
                    'Purchase approved' : 
                    `Need ${(amount - balance.amount).toLocaleString()} AS$ more`
            };
        } catch (error) {
            console.error('❌ Affordability check failed:', error.message);
            throw error;
        }
    }

    /**
     * Get safe spending amount (percentage of current balance)
     * @param {Object} page - Puppeteer page object
     * @param {number} percentage - Percentage of balance to use (default: 80%)
     * @returns {Object} Safe spending amount info
     */
    async getSafeSpendingAmount(page, percentage = 80) {
        try {
            const balance = await this.quickBalanceCheck(page);
            const safeAmount = Math.floor(balance.amount * (percentage / 100));
            
            return {
                ...balance,
                safeSpendingAmount: safeAmount,
                reservedAmount: balance.amount - safeAmount,
                spendingPercentage: percentage,
                recommendation: `Safe to spend up to ${safeAmount.toLocaleString()} AS$ (${percentage}% of balance)`
            };
        } catch (error) {
            console.error('❌ Safe spending calculation failed:', error.message);
            throw error;
        }
    }

    /**
     * Get balance statistics and trends
     * @returns {Object} Balance statistics
     */
    async getBalanceStats() {
        try {
            return await this.balanceService.getBalanceStatistics();
        } catch (error) {
            console.error('❌ Balance statistics failed:', error.message);
            throw error;
        }
    }

    /**
     * Emergency balance check - loads balance with new session if needed
     * @returns {Object} Current balance info
     */
    async emergencyBalanceCheck() {
        try {
            console.log('🚨 Emergency balance check - creating new session');
            return await this.balanceService.loadBalanceWithNewSession();
        } catch (error) {
            console.error('❌ Emergency balance check failed:', error.message);
            throw error;
        }
    }

    /**
     * Format balance for display
     * @param {Object} balanceInfo - Balance information object
     * @returns {string} Formatted balance string
     */
    formatBalance(balanceInfo) {
        const status = balanceInfo.isPositive ? '✅' : '❌';
        const amount = balanceInfo.amount.toLocaleString();
        return `${status} ${balanceInfo.currency} ${amount}`;
    }

    /**
     * Log balance change for decisions
     * @param {string} context - Context of the balance check
     * @param {Object} balanceInfo - Balance information
     * @param {Object} additionalData - Additional data to log
     */
    logBalanceCheck(context, balanceInfo, additionalData = {}) {
        const formatted = this.formatBalance(balanceInfo);
        console.log(`💰 Balance Check [${context}]: ${formatted}`);
        
        if (additionalData.requiredAmount) {
            const canAfford = balanceInfo.amount >= additionalData.requiredAmount;
            const status = canAfford ? '✅ APPROVED' : '❌ INSUFFICIENT';
            console.log(`   Required: ${additionalData.requiredAmount.toLocaleString()} AS$ - ${status}`);
        }
    }
}

// Export singleton instance
const balanceUtils = new BalanceUtils();

module.exports = {
    BalanceUtils,
    balanceUtils // Singleton instance for easy import
};
