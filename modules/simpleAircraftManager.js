const { createBrowserWithCookies } = require('../services/puppeteerSettings');
const decisionLogger = require('../services/decisionLogger');
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
        this.aircraftAIAnalyzer = null;
    }

    async initialize() {
        const { browser, page } = await createBrowserWithCookies();
        this.browser = browser;
        this.page = page;
        
        this.airlineInfo = await this.airlineConfig.loadAirlineConfig();
        this.loginInfo = await authService.validateLogin(this.page);
        this.currentBalance = await this.balanceService.getCurrentBalance(this.page);

        await this.balanceService.saveBalanceHistory(this.currentBalance);
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
     * Extrahiert detaillierte Flugzeug-Informationen aus der Fleet
     * @returns {Array} Array mit Flugzeug-Objekten der aktuellen Fleet
     */
    async getFleetData() {
        console.log('🔍 Extrahiere Fleet-Daten...');
        
        await this.page.goto('https://free2.airlinesim.aero/app/fleets?1');
        await new Promise(resolve => setTimeout(resolve, 2000));

        const fleetData = await this.page.evaluate(() => {
            const aircraftList = [];
            
            // Suche nach Flugzeug-Tabelle
            const rows = document.querySelectorAll('table tbody tr');
            
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 4) {
                    // Flugzeug-Typ extrahieren
                    const typeCell = cells[1];
                    const typeLink = typeCell.querySelector('a');
                    
                    if (typeLink) {
                        const type = typeLink.textContent.trim();
                        
                        // Registrierung extrahieren
                        const regCell = cells[0];
                        const registration = regCell.textContent.trim();
                        
                        // Status extrahieren
                        const statusCell = cells[2];
                        const status = statusCell.textContent.trim();
                        
                        // Basis-Informationen sammeln
                        aircraftList.push({
                            registration,
                            type,
                            status,
                            family: type.split(' ')[0] // Erster Teil ist meist die Familie
                        });
                    }
                }
            });
            
            return aircraftList;
        });

        // Erweitere Fleet-Daten mit echten Spezifikationen aus dem Aircraft Cache
        const enhancedFleetData = await this.enhanceFleetDataWithSpecs(fleetData);
        
        // Speichere Fleet-Daten persistent
        await this.saveFleetData(enhancedFleetData);

        console.log(`✈️ Gefunden: ${enhancedFleetData.length} Flugzeuge in der Fleet`);
        enhancedFleetData.forEach(aircraft => {
            console.log(`   - ${aircraft.registration}: ${aircraft.type} (${aircraft.passengers} Passagiere, ${aircraft.range}, Status: ${aircraft.status})`);
        });
        
        return enhancedFleetData;
    }

    /**
     * Erweitert Fleet-Daten mit echten Spezifikationen aus dem Aircraft Cache
     * @param {Array} fleetData - Basis Fleet-Daten
     * @returns {Array} Erweiterte Fleet-Daten mit echten Spezifikationen
     */
    async enhanceFleetDataWithSpecs(fleetData) {
        // Lade alle verfügbaren Flugzeug-Spezifikationen
        const availableAircraft = await this.aircraftDataService.getAvailableAircraft(this.page, false);
        
        // Erstelle einen Map für schnelle Suche
        const aircraftSpecsMap = new Map();
        availableAircraft.forEach(aircraft => {
            aircraftSpecsMap.set(aircraft.model, aircraft);
        });

        // Erweitere jedes Fleet-Flugzeug mit echten Spezifikationen
        const enhancedFleetData = fleetData.map(fleetAircraft => {
            const specs = aircraftSpecsMap.get(fleetAircraft.type);
            
            if (specs) {
                return {
                    ...fleetAircraft,
                    passengers: specs.passengers || 0,
                    cargo: specs.cargo || '0 kg',
                    range: specs.range || 'Unknown',
                    speed: specs.speed || 'Unknown',
                    purchasePrice: specs.purchasePrice || 0,
                    family: specs.family || fleetAircraft.family,
                    available: specs.available || false,
                    hasRealSpecs: true
                };
            } else {
                // Fallback: Verwende Schätzungen basierend auf Flugzeugtyp
                return {
                    ...fleetAircraft,
                    passengers: this.estimatePassengers(fleetAircraft.type),
                    cargo: '0 kg',
                    range: this.estimateRange(fleetAircraft.type),
                    speed: 'Unknown',
                    purchasePrice: 0,
                    hasRealSpecs: false
                };
            }
        });

        return enhancedFleetData;
    }

    /**
     * Schätzt Passagieranzahl basierend auf Flugzeugtyp (Fallback)
     */
    estimatePassengers(type) {
        if (type.includes('737')) return 189;
        if (type.includes('A320')) return 180;
        if (type.includes('A319')) return 156;
        if (type.includes('410')) return 19;
        if (type.includes('777')) return 400;
        if (type.includes('A380')) return 850;
        if (type.includes('208')) return 9;
        if (type.includes('Islander')) return 9;
        return 150; // Default
    }

    /**
     * Schätzt Reichweite basierend auf Flugzeugtyp (Fallback)
     */
    estimateRange(type) {
        if (type.includes('737')) return '2,000-6,000 km';
        if (type.includes('A320')) return '3,000-6,000 km';
        if (type.includes('777')) return '9,000-15,000 km';
        if (type.includes('A380')) return '15,000+ km';
        if (type.includes('410')) return '240-2,100 km';
        if (type.includes('208')) return '185-1,820 km';
        if (type.includes('Islander')) return '260-1,400 km';
        return '3,000 km'; // Default
    }

    /**
     * Speichert Fleet-Daten persistent in data/fleet_data.json
     * @param {Array} fleetData - Fleet-Daten zum Speichern
     */
    async saveFleetData(fleetData) {
        const fs = require('fs').promises;
        const path = require('path');
        
        const fleetDataObj = {
            timestamp: new Date().toISOString(),
            totalAircraft: fleetData.length,
            fleet: fleetData,
            aircraftTypes: [...new Set(fleetData.map(a => a.type))], // Alle einzigartigen Typen
            families: [...new Set(fleetData.map(a => a.family))], // Alle einzigartigen Familien
            totalPassengerCapacity: fleetData.reduce((sum, a) => sum + (a.passengers || 0), 0),
            realSpecsCount: fleetData.filter(a => a.hasRealSpecs).length,
            estimatedSpecsCount: fleetData.filter(a => !a.hasRealSpecs).length
        };

        const fleetDataPath = path.join(__dirname, '..', 'data', 'fleet_data.json');
        
        try {
            await fs.writeFile(fleetDataPath, JSON.stringify(fleetDataObj, null, 2));
            console.log(`💾 Fleet-Daten gespeichert: ${fleetDataPath}`);
            console.log(`   📊 ${fleetDataObj.totalAircraft} Flugzeuge, ${fleetDataObj.totalPassengerCapacity} Passagierplätze gesamt`);
            console.log(`   ✅ ${fleetDataObj.realSpecsCount} mit echten Spezifikationen, ${fleetDataObj.estimatedSpecsCount} geschätzt`);
        } catch (error) {
            console.error('❌ Fehler beim Speichern der Fleet-Daten:', error.message);
        }
    }

    /**
     * Lädt gespeicherte Fleet-Daten aus data/fleet_data.json
     * @returns {Object|null} Fleet-Daten oder null wenn nicht vorhanden
     */
    async loadSavedFleetData() {
        const fs = require('fs').promises;
        const path = require('path');
        
        const fleetDataPath = path.join(__dirname, '..', 'data', 'fleet_data.json');
        
        try {
            const data = await fs.readFile(fleetDataPath, 'utf8');
            const fleetData = JSON.parse(data);
            
            console.log(`📂 Fleet-Daten geladen: ${fleetData.totalAircraft} Flugzeuge (Stand: ${new Date(fleetData.timestamp).toLocaleString()})`);
            
            return fleetData;
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('📂 Keine gespeicherten Fleet-Daten gefunden');
            } else {
                console.error('❌ Fehler beim Laden der Fleet-Daten:', error.message);
            }
            return null;
        }
    }

    /**
     * Gibt alle Flugzeugtypen aus der aktuellen Fleet zurück
     * @returns {Array} Array mit allen einzigartigen Flugzeugtypen
     */
    async getAllFleetAircraftTypes() {
        const savedFleetData = await this.loadSavedFleetData();
        
        if (savedFleetData && savedFleetData.aircraftTypes) {
            console.log(`🛩️ Flugzeugtypen in der Fleet: ${savedFleetData.aircraftTypes.join(', ')}`);
            return savedFleetData.aircraftTypes;
        }
        
        // Fallback: Lade aktuelle Fleet-Daten
        const currentFleetData = await this.getFleetData();
        return [...new Set(currentFleetData.map(a => a.type))];
    }

    /**
     * Updates current balance and checks affordability
     * @param {number} requiredAmount - Amount needed for purchase (optional)
     * @returns {Object} Balance info with affordability check
     */
    async checkBalanceAndAffordability(requiredAmount = null) {
        try {            
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
        
        const recommendation = await this.aircraftAIAnalyzer.analyzeAircraftChoice(
            availableAircraft, 
            this.aircraftDataService, 
            budget
        );
        
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
            console.log(`     Begründung: ${recommendation.reasoning}`);
            
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

    parsePrice(priceString) {
        return parseInt(priceString.replace(/[^\d]/g, '')) || 0;
    }
}

module.exports = SimpleAircraftManager;