const { createBrowserWithCookies } = require('../services/puppeteerSettings');
const decisionLogger = require('../services/decisionLogger');
const authService = require('../services/authService');
const { BalanceService } = require('../services/balanceService');
const { AirlineConfigService } = require('../services/airlineConfigService');
const StationAIAnalyzer = require('../services/stationAIAnalyzer');

class StationManager {
    constructor() {
        this.browser = null;
        this.page = null;
        this.balanceService = new BalanceService();
        this.airlineConfig = new AirlineConfigService();
        this.stationAIAnalyzer = null; // Wird nach der Initialisierung erstellt
    }

    async initialize() {
        const { browser, page } = await createBrowserWithCookies();
        this.browser = browser;
        this.page = page;
        
        // Lade Airline-Konfiguration
        this.airlineInfo = await this.airlineConfig.loadAirlineConfig();
        
        // Validiere Login mit zentralem AuthService
        this.loginInfo = await authService.validateLogin(this.page);
        
        // Load current balance on initialization
        console.log('💰 Loading current account balance...');
        this.currentBalance = await this.balanceService.getCurrentBalance(this.page);
        await this.balanceService.saveBalanceHistory(this.currentBalance);

        // Erstelle AI Analyzer nach Balance-Load
        this.stationAIAnalyzer = new StationAIAnalyzer(this.airlineConfig, this.currentBalance);
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    /**
     * Scrapt existierende Stationen von der Stations-Seite
     */
    async getExistingStations() {
        console.log('🏢 Lade existierende Stationen...');
        
        await this.page.goto('https://free2.airlinesim.aero/app/ops/stations?1', {
            waitUntil: 'networkidle2',
            timeout: 15000
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000));

        const stations = await this.page.evaluate(() => {
            const rows = document.querySelectorAll('table.offices tbody tr');
            const stationsList = [];

            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 4) {
                    // Airport Name und Code extrahieren
                    const airportCell = cells[2];
                    const airportLink = airportCell.querySelector('a');
                    const codeSpan = airportCell.querySelector('span');
                    
                    if (airportLink && codeSpan) {
                        const name = airportLink.textContent.trim();
                        const code = codeSpan.textContent.trim();
                        
                        // Land extrahieren
                        const countryCell = cells[3];
                        const countryImg = countryCell.querySelector('img');
                        const country = countryImg ? countryImg.getAttribute('title') : 'Unknown';
                        
                        // Departures extrahieren
                        const departuresCell = cells[4];
                        const departures = parseInt(departuresCell.textContent.trim()) || 0;
                        
                        // Passenger Info extrahieren
                        const paxMarketCell = cells[5];
                        const paxMarketImg = paxMarketCell.querySelector('img');
                        const paxMarketTitle = paxMarketImg ? paxMarketImg.getAttribute('title') : '';
                        const paxDemand = paxMarketTitle.match(/demand:\s*(\d+)/) ? 
                            parseInt(paxMarketTitle.match(/demand:\s*(\d+)/)[1]) : 0;
                        
                        const paxCapCell = cells[6];
                        const paxCap = parseInt(paxCapCell.textContent.trim()) || 0;
                        
                        stationsList.push({
                            name,
                            code,
                            country,
                            departures,
                            passengerDemand: paxDemand,
                            passengerCapacity: paxCap,
                            isActive: departures > 0
                        });
                    }
                }
            });

            return stationsList;
        });

        console.log(`📊 Gefunden: ${stations.length} existierende Stationen`);
        console.log(`✈️ Aktive Stationen (mit Flügen): ${stations.filter(s => s.isActive).length}`);
        
        return stations;
    }

    /**
     * Öffnet eine neue Station
     */
    async openNewStation(stationCode) {
        console.log(`🏗️ Öffne neue Station: ${stationCode}`);
        
        try {
            // Zur Stations-Seite navigieren
            await this.page.goto('https://free2.airlinesim.aero/app/ops/stations?1', {
                waitUntil: 'networkidle2',
                timeout: 15000
            });
            
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Airport Code in das Eingabefeld eingeben
            const airportInput = await this.page.$('#id5'); // "Open new Station" Input
            if (!airportInput) {
                throw new Error('Airport input field nicht gefunden');
            }

            await airportInput.clear();
            await airportInput.type(stationCode);
            
            // Kurz warten für Autocomplete
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Submit Button klicken
            const submitButton = await this.page.$('button[type="submit"]:has(.fa-plus)');
            if (!submitButton) {
                throw new Error('Submit Button nicht gefunden');
            }

            await submitButton.click();
            
            // Warten auf Navigation oder Erfolgs-/Fehlermeldung
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Prüfen ob Station erfolgreich eröffnet wurde
            const currentUrl = this.page.url();
            const pageContent = await this.page.content();
            
            // Erfolg prüfen (verschiedene mögliche Indikatoren)
            const success = currentUrl.includes('/ops/stations/') || 
                           pageContent.includes('Station opened') ||
                           pageContent.includes('successfully') ||
                           !pageContent.includes('error') && !pageContent.includes('Error');
            
            if (success) {
                console.log(`✅ Station ${stationCode} erfolgreich eröffnet`);
                return { success: true, stationCode, message: 'Station erfolgreich eröffnet' };
            } else {
                console.log(`❌ Fehler beim Eröffnen der Station ${stationCode}`);
                return { success: false, stationCode, message: 'Station konnte nicht eröffnet werden' };
            }
            
        } catch (error) {
            console.error(`❌ Fehler beim Eröffnen der Station ${stationCode}:`, error.message);
            return { success: false, stationCode, message: error.message };
        }
    }

    /**
     * Analysiert beste Stationen basierend auf Flugzeug-Empfehlung
     */
    async analyzeStationsForAircraft(aircraftRecommendation) {
        console.log('🧠 Analysiere beste Stationen für Flugzeug-Empfehlung...');
        
        // Lade existierende Stationen
        const existingStations = await this.getExistingStations();
        
        // Update AI analyzer mit aktueller Balance
        this.stationAIAnalyzer.currentBalance = this.currentBalance;
        
        // AI-Analyse für beste Stationen
        const stationRecommendations = await this.stationAIAnalyzer.analyzeBestStations(
            aircraftRecommendation, 
            existingStations
        );
        
        return {
            ...stationRecommendations,
            existingStations
        };
    }

    /**
     * Hauptfunktion: Analysiert und eröffnet neue Stationen basierend auf Flugzeug-Empfehlung
     */
    async manageStations(aircraftRecommendation) {
        try {
            await this.initialize();

            console.log('🏢 Starte Station-Management basierend auf Flugzeug-Empfehlung...');
            
            // 1. Analysiere beste Stationen für die Flugzeuge
            const stationAnalysis = await this.analyzeStationsForAircraft(aircraftRecommendation);
            
            console.log('\n🎯 STATION-EMPFEHLUNGEN:');
            console.log(`   Basierend auf: ${aircraftRecommendation.model} (${aircraftRecommendation.quantity}x)`);
            console.log(`   Passagiere pro Flug: ${aircraftRecommendation.aircraft?.passengers || 'Unknown'}`);
            console.log(`   Reichweite: ${aircraftRecommendation.aircraft?.range || 'Unknown'}`);
            console.log('');
            console.log(`   📊 Gefunden: ${stationAnalysis.existingStations.length} existierende Stationen`);
            console.log(`   💰 Verfügbares Budget: ${stationAnalysis.budget.availableForOperations.toLocaleString()} AS$ (Stationen sind KOMPLETT kostenlos!)`);
            console.log(`   🎯 Top ${stationAnalysis.stations.length} empfohlene neue Stationen:`);
            
            stationAnalysis.stations.forEach((station, index) => {
                console.log(`     ${index + 1}. ${station.name} (${station.code}) - ${station.country}`);
                console.log(`        💰 Station: KOMPLETT KOSTENLOS! 🆓 (inkl. Personal)`);
                console.log(`        ✈️ Route: ${station.route}`);
                console.log(`        👥 Erwartete Passagiere: ${station.expectedPassengers}/Tag`);
                console.log(`        📝 Grund: ${station.reasoning}`);
                console.log('');
            });
            
            // 2. Wähle beste Station zum Eröffnen
            const selectedStation = this.stationAIAnalyzer.selectStationToOpen(stationAnalysis);
            
            if (!selectedStation) {
                console.log('❌ Keine Station im Budget verfügbar');
                
                decisionLogger.logDecision(
                    'station_management',
                    'Keine Station eröffnet - Andere Gründe',
                    'Trotz kostenloser Stationen wurde keine Station eröffnet',
                    { 
                        aircraftRecommendation: aircraftRecommendation.model,
                        budget: stationAnalysis.budget,
                        recommendations: stationAnalysis.stations.length
                    }
                );
                
                return { 
                    action: 'no_station_affordable', 
                    stationAnalysis,
                    selectedStation: null
                };
            }
            
            // 3. Station eröffnen (erstmal simulieren)
            console.log('\n💡 SIMULATION: Station-Eröffnung würde jetzt durchgeführt');
            console.log(`   🏗️ Öffne Station: ${selectedStation.name} (${selectedStation.code})`);
            console.log(`   💰 Kosten: KOMPLETT KOSTENLOS! 🆓`);
            console.log(`   👥 Personal: AUCH KOSTENLOS! 🆓`);
            console.log(`   ✈️ Geplante Route: ${selectedStation.route}`);
            console.log('   📋 Nächste Schritte:');
            console.log(`     1. Station eröffnen: 0 AS$`);
            console.log(`     2. Personal einstellen: 0 AS$`);
            console.log(`     3. Route planen: ${this.airlineInfo.hub} ↔ ${selectedStation.code}`);
            console.log(`     4. Flugzeug zuweisen: ${aircraftRecommendation.model}`);
            
            // Für echte Eröffnung später:
            // const result = await this.openNewStation(selectedStation.code);
            
            // Log decision
            const decisionId = decisionLogger.logDecision(
                'station_management',
                `AI empfiehlt Station: ${selectedStation.name} (${selectedStation.code}) für ${aircraftRecommendation.model}`,
                selectedStation.reasoning,
                { 
                    aircraftInfo: stationAnalysis.aircraftInfo,
                    selectedStation,
                    budget: stationAnalysis.budget,
                    totalRecommendations: stationAnalysis.stations.length,
                    existingStations: stationAnalysis.existingStations.length,
                    route: selectedStation.route,
                    expectedPassengers: selectedStation.expectedPassengers
                }
            );
            
            // Simulate success
            setTimeout(() => {
                decisionLogger.updateDecisionOutcome(decisionId, 'simulated_success', 8.8);
            }, 2000);

            return {
                action: 'station_recommended',
                stationAnalysis,
                selectedStation,
                decisionId
            };

        } catch (error) {
            console.error('❌ Fehler im Station-Management:', error);
            
            decisionLogger.logDecision(
                'station_management',
                'Station-Management Fehler',
                `Fehler aufgetreten: ${error.message}`,
                { error: error.stack, aircraftRecommendation: aircraftRecommendation?.model }
            );
            
            throw error;
        } finally {
            await this.cleanup();
        }
    }
}

module.exports = StationManager;
