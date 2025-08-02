const fs = require('fs');
const path = require('path');

class DecisionLogger {
    constructor() {
        this.logFile = path.join(__dirname, '..', 'logs', 'decisions.json');
        this.ensureLogDirectoryExists();
        this.initializeLogFile();
    }

    ensureLogDirectoryExists() {
        const logDir = path.dirname(this.logFile);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }

    initializeLogFile() {
        if (!fs.existsSync(this.logFile)) {
            this.writeLogFile([]);
        }
    }

    readLogFile() {
        try {
            const data = fs.readFileSync(this.logFile, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading log file:', error);
            return [];
        }
    }

    writeLogFile(data) {
        try {
            fs.writeFileSync(this.logFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error writing log file:', error);
        }
    }

    logDecision(category, decision, reasoning, data = {}) {
        const logEntry = {
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            category: category, // 'aircraft', 'route', 'pricing', 'fleet', 'strategy'
            decision: decision,
            reasoning: reasoning,
            data: data,
            outcome: null, // Will be updated later when we know the result
            profitability: null // Will be calculated later
        };

        const logs = this.readLogFile();
        logs.push(logEntry);
        this.writeLogFile(logs);

        console.log(`[DECISION LOGGED] ${category}: ${decision}`);
        console.log(`[REASONING] ${reasoning}`);
        
        return logEntry.id;
    }

    updateDecisionOutcome(decisionId, outcome, profitability = null) {
        const logs = this.readLogFile();
        const logIndex = logs.findIndex(log => log.id === decisionId);
        
        if (logIndex !== -1) {
            logs[logIndex].outcome = outcome;
            logs[logIndex].profitability = profitability;
            logs[logIndex].updatedAt = new Date().toISOString();
            this.writeLogFile(logs);
            
            console.log(`[OUTCOME UPDATED] Decision ${decisionId}: ${outcome}`);
        }
    }

    getDecisionsByCategory(category) {
        const logs = this.readLogFile();
        return logs.filter(log => log.category === category);
    }

    getRecentDecisions(hours = 24) {
        const logs = this.readLogFile();
        const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
        return logs.filter(log => new Date(log.timestamp) > cutoffTime);
    }

    getDecisionAnalytics() {
        const logs = this.readLogFile();
        const analytics = {
            totalDecisions: logs.length,
            categoryCounts: {},
            successfulDecisions: 0,
            failedDecisions: 0,
            avgProfitability: 0
        };

        let totalProfitability = 0;
        let profitabilityCount = 0;

        logs.forEach(log => {
            // Count by category
            analytics.categoryCounts[log.category] = (analytics.categoryCounts[log.category] || 0) + 1;
            
            // Count outcomes
            if (log.outcome === 'success') analytics.successfulDecisions++;
            else if (log.outcome === 'failure') analytics.failedDecisions++;
            
            // Calculate average profitability
            if (log.profitability !== null) {
                totalProfitability += log.profitability;
                profitabilityCount++;
            }
        });

        if (profitabilityCount > 0) {
            analytics.avgProfitability = totalProfitability / profitabilityCount;
        }

        return analytics;
    }

    generateReport() {
        const analytics = this.getDecisionAnalytics();
        const recentDecisions = this.getRecentDecisions(24);
        
        const report = {
            generatedAt: new Date().toISOString(),
            summary: analytics,
            recentDecisions: recentDecisions.map(decision => ({
                timestamp: decision.timestamp,
                category: decision.category,
                decision: decision.decision,
                outcome: decision.outcome,
                profitability: decision.profitability
            }))
        };

        const reportPath = path.join(__dirname, '..', 'logs', `report_${Date.now()}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        console.log(`[REPORT GENERATED] ${reportPath}`);
        return report;
    }

    getAnalytics() {
        const logs = this.readLogFile();
        const totalDecisions = logs.length;
        const successfulDecisions = logs.filter(log => log.outcome === 'success').length;
        const categories = [...new Set(logs.map(log => log.category))];
        
        return {
            totalDecisions,
            successRate: totalDecisions > 0 ? successfulDecisions / totalDecisions : 0,
            categories,
            recentDecisions: logs.slice(-5)
        };
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}

module.exports = new DecisionLogger();
