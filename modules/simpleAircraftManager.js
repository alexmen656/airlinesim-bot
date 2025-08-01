const { createBrowserWithCookies } = require('../services/puppeteerSettings');
const decisionLogger = require('../services/decisionLogger');
const aiService = require('../services/aiService');
const authService = require('../services/authService');
const { BalanceService } = require('../services/balanceService');
const { AirlineConfigService } = require('../services/airlineConfigService');
const AircraftDataService = require('../services/aircraftDataService');
const AircraftAIAnalyzer = require('../services/aircraftAIAnalyzer');

class SimpleAircraftManager {
    constructor() {
        this.browser = null;
        this.page = null;
        this.balanceService = new BalanceService();
        this.airlineConfig = new AirlineConfigService();
        this.aircraftDataService = new AircraftDataService();
        this.aircraftAIAnalyzer = null; // Wird nach der Initialisierung erstellt
    }

    async initialize() {
        const { browser, page } = await createBrowserWithCookies();
        this.browser = browser;
        this.page = page;
        
        this.airlineInfo = await this.airlineConfig.loadAirlineConfig();
        this.loginInfo = await authService.validateLogin(this.page);
        
        // Load current balance on initialization
        console.log('💰 Loading current account balance...');
        this.currentBalance = await this.balanceService.getCurrentBalance(this.page);
        await this.balanceService.saveBalanceHistory(this.currentBalance);

        // Erstelle AI Analyzer nach Balance-Load
        this.aircraftAIAnalyzer = new AircraftAIAnalyzer(this.airlineConfig, this.currentBalance);
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async checkFleetStatus() {
        console.log('🔍 Überprüfe aktuellen Fleet-Status...');
        
        await this.page.goto('https://free2.airlinesim.aero/app/fleets?1');
        await new Promise(resolve => setTimeout(resolve, 2000));

        const fleetStatus = await this.page.evaluate(() => {
            const hasDefaultFleet = document.body.textContent.includes('Default fleet');
            const hasNoAircraft = document.body.textContent.includes('This fleet has no aircraft assigned right now.');
            
            return {
                hasDefaultFleet,
                hasNoAircraft,
                isEmpty: hasDefaultFleet && hasNoAircraft
            };
        });

        console.log('📊 Fleet Status:', fleetStatus);
        
        return fleetStatus;
    }

    /**
     * Updates current balance and checks affordability
     * @param {number} requiredAmount - Amount needed for purchase (optional)
     * @returns {Object} Balance info with affordability check
     */
    async checkBalanceAndAffordability(requiredAmount = null) {
        try {
            console.log('💰 Checking current balance...');
            
            // Update current balance
            this.currentBalance = await this.balanceService.getCurrentBalance(this.page);
            await this.balanceService.saveBalanceHistory(this.currentBalance);
            
            const balanceInfo = {
                ...this.currentBalance,
                canAfford: requiredAmount ? this.currentBalance.amount >= requiredAmount : null,
                affordabilityRatio: requiredAmount ? this.currentBalance.amount / requiredAmount : null
            };
            
            if (requiredAmount) {
                const canAfford = balanceInfo.canAfford ? '✅' : '❌';
                console.log(`${canAfford} Balance check: ${this.currentBalance.currency} ${this.currentBalance.amount.toLocaleString()} ${balanceInfo.canAfford ? '>=' : '<'} ${requiredAmount.toLocaleString()}`);
            }
            
            return balanceInfo;
            
        } catch (error) {
            console.error('❌ Error checking balance:', error.message);
            throw error;
        }
    }

    async getAvailableAircraft(forceRefresh = false) {
        return await this.aircraftDataService.getAvailableAircraft(this.page, forceRefresh);
    }

    async clearAircraftCache() {
        return await this.aircraftDataService.clearAllCaches();
    }

    async getCacheInfo() {
        return await this.aircraftDataService.getCacheInfo();
    }

    async analyzeAircraftChoice(availableAircraft, budget = null) {
        console.log('🧠 AI analysiert beste Flugzeug-Leasing-Option (2-stufig)...');
        
        if (!budget) {
            const balanceInfo = await this.checkBalanceAndAffordability();
            budget = Math.floor(balanceInfo.amount * 0.8); // Use 80%
            console.log(`💰 Using 80% of current balance as budget: ${budget.toLocaleString()} AS$`);
        }

        this.aircraftAIAnalyzer.currentBalance = this.currentBalance;
        
        // Verwende die neue zweistufige AI-Analyse
        const recommendation = await this.aircraftAIAnalyzer.analyzeAircraftChoice(
            availableAircraft, 
            this.aircraftDataService, 
            budget
        );
        
        // Check if we can afford the recommendation (Security Deposits)
        const affordabilityCheck = await this.checkBalanceAndAffordability(recommendation.totalSecurityDeposit);
        
        // Log decision with balance info
        const decisionId = decisionLogger.logDecision(
            'aircraft_leasing',
            `AI empfiehlt Leasing: ${recommendation.model} (${recommendation.quantity}x) für ${this.airlineInfo.name}`,
            recommendation.reasoning,
            { 
                airline: this.airlineInfo,
                availableOptions: availableAircraft.length,
                budget,
                totalSecurityDeposit: recommendation.totalSecurityDeposit,
                weeklyRateCost: recommendation.weeklyRateCost,
                currentBalance: affordabilityCheck.amount,
                canAfford: affordabilityCheck.canAfford,
                affordabilityRatio: affordabilityCheck.affordabilityRatio,
                leasingType: 'two_stage_analysis',
                familyChosen: recommendation.familyChoice?.selectedFamily?.name,
                analyzedAircraftCount: recommendation.analyzedAircraftCount,
                totalAircraftInFamily: recommendation.totalAircraftInFamily
            }
        );

        return { ...recommendation, decisionId, balanceCheck: affordabilityCheck };
    }

    async manageFleet() {
        try {
            await this.initialize();

            console.log('🚀 Starte Fleet-Management...');
            
            // 1. Prüfe aktuellen Fleet-Status
            const fleetStatus = await this.checkFleetStatus();
            
            if (!fleetStatus.isEmpty) {
                console.log('✅ Airline besitzt bereits Flugzeuge - kein Kauf notwendig');
                
                decisionLogger.logDecision(
                    'aircraft',
                    'Fleet-Check: Flugzeuge bereits vorhanden',
                    'Airline besitzt bereits Flugzeuge, daher kein automatischer Kauf',
                    fleetStatus
                );
                
                return { action: 'no_purchase_needed', fleetStatus };
            }

            console.log('⚠️ Keine Flugzeuge gefunden - AI wird Leasing-Empfehlung geben');

            // 2. Lade verfügbare Flugzeuge von ALLEN Familien
            const availableAircraft = await this.getAvailableAircraft();
            
            if (availableAircraft.length === 0) {
                console.log('❌ Keine verfügbaren Flugzeuge gefunden');
                return { action: 'no_aircraft_available' };
            }

            // 3. AI-Analyse für beste Leasing-Option (2-stufig)
            const recommendation = await this.analyzeAircraftChoice(availableAircraft);
            
            console.log('\n🎯 LEASING-EMPFEHLUNG (2-stufige AI-Analyse):');
            console.log(`   Familie gewählt: ${recommendation.familyChoice?.selectedFamily?.name || 'Unknown'} (aus ${recommendation.familyChoice?.selectedFamily?.totalModels || 0} Modellen)`);
            console.log(`   Familie-Begründung: ${recommendation.familyChoice?.reasoning || 'Nicht verfügbar'}`);
            console.log(`   Ziel-Passagiere: ${recommendation.familyChoice?.targetPassengers || 'Nicht verfügbar'}`);
            console.log('');
            console.log(`   Flugzeug: ${recommendation.model} (${recommendation.aircraft?.family || 'Unknown Family'})`);
            console.log(`   Kaufpreis: ${recommendation.aircraft?.priceText || 'Unknown'}`);
            console.log(`   Anzahl: ${recommendation.quantity}`);
            console.log(`   Analysiert: ${recommendation.analyzedAircraftCount || 0} von ${recommendation.totalAircraftInFamily || 0} Modellen in der Familie`);
            console.log('');
            console.log('   💰 LEASING-KOSTEN:');
            console.log(`     Security Deposit (einmalig): ${recommendation.totalSecurityDeposit.toLocaleString()} AS$`);
            console.log(`     Wochenrate (ab Woche 2): ${recommendation.weeklyRateCost.toLocaleString()} AS$/Woche`);
            console.log(`     Erste Woche: KOSTENLOS`);
            console.log(`   Begründung: ${recommendation.reasoning}`);
            
            // Balance-Check anzeigen
            if (recommendation.balanceCheck) {
                const status = recommendation.balanceCheck.canAfford ? '✅ FINANZIERBAR' : '❌ NICHT FINANZIERBAR';
                const depositRatio = (recommendation.balanceCheck.affordabilityRatio * 100).toFixed(1);
                console.log(`   ${status} (Security Deposit = ${depositRatio}% des Guthabens)`);
                
                // Zeige wöchentliche Belastung
                const weeklyBurden = (recommendation.weeklyRateCost / this.currentBalance.amount * 100).toFixed(1);
                console.log(`   📊 Wöchentliche Belastung: ${weeklyBurden}% des aktuellen Guthabens`);
            }

            // 4. Hier würde das tatsächliche Leasing stattfinden
            console.log('\n💡 SIMULATION: Flugzeug-Leasing würde jetzt durchgeführt');
            console.log('   (Echtes Leasing kann implementiert werden)');
            console.log('   📋 Nächste Schritte:');
            console.log(`     1. Security Deposit zahlen: ${recommendation.totalSecurityDeposit.toLocaleString()} AS$`);
            console.log(`     2. Erste Woche: Kostenlos fliegen`);
            console.log(`     3. Ab Woche 2: ${recommendation.weeklyRateCost.toLocaleString()} AS$ pro Woche zahlen`);

            // Update decision outcome
            setTimeout(() => {
                decisionLogger.updateDecisionOutcome(
                    recommendation.decisionId, 
                    'simulated_success', 
                    8.5
                );
            }, 2000);

            return {
                action: 'leasing_recommended',
                recommendation,
                availableAircraft
            };

        } catch (error) {
            console.error('❌ Fehler im Fleet-Management:', error);
            
            decisionLogger.logDecision(
                'aircraft',
                'Fleet-Management Fehler',
                `Fehler aufgetreten: ${error.message}`,
                { error: error.stack }
            );
            
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    // Hilfsfunktionen
    parsePrice(priceString) {
        return parseInt(priceString.replace(/[^\d]/g, '')) || 0;
    }
}

module.exports = SimpleAircraftManager;