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
        this.stationAIAnalyzer = null;
    }

    async initialize() {
        const { browser, page } = await createBrowserWithCookies();
        this.browser = browser;
        this.page = page;
        
        this.airlineInfo = await this.airlineConfig.loadAirlineConfig();
        this.loginInfo = await authService.validateLogin(this.page);
        this.currentBalance = await this.balanceService.getCurrentBalance(this.page);
        await this.balanceService.saveBalanceHistory(this.currentBalance);

        this.stationAIAnalyzer = new StationAIAnalyzer(this.airlineConfig, this.currentBalance);
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    cl(input){
        console.log(input);
    }

    async getExistingStations() {
        this.cl('🏢 Lade existierende Stationen...');
        
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

        this.cl(`📊 Gefunden: ${stations.length} existierende Stationen`);
        this.cl(`✈️ Aktive Stationen (mit Flügen): ${stations.filter(s => s.isActive).length}`);

        return stations;
    }

    async openNewStation(stationCode) {
        this.cl(`🏗️ Öffne neue Station: ${stationCode}`);
        
        try {
            await this.page.goto('https://free2.airlinesim.aero/app/ops/stations?1', {
                waitUntil: 'networkidle2',
                timeout: 15000
            });
            
            await new Promise(resolve => setTimeout(resolve, 2000));

            const airportInput = await this.page.$('#id19');
            if (!airportInput) {
                throw new Error('Airport input field nicht gefunden');
            }

            // Feld leeren und neuen Wert eingeben
            await airportInput.click({ clickCount: 3 }); // Alles markieren
            await airportInput.press('Backspace'); // Löschen
            await airportInput.type(stationCode);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const submitButton = await this.page.$('button[type="submit"]:has(.fa-plus)');
            if (!submitButton) {
                throw new Error('Submit Button nicht gefunden');
            }

            await submitButton.click();
            
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const currentUrl = this.page.url();
            const pageContent = await this.page.content();
            
            const success = currentUrl.includes('/ops/stations/') || 
                           pageContent.includes('Station opened') ||
                           pageContent.includes('successfully') ||
                           !pageContent.includes('error') && !pageContent.includes('Error');
            
            if (success) {
                this.cl(`✅ Station ${stationCode} erfolgreich eröffnet`);
                return { success: true, stationCode, message: 'Station erfolgreich eröffnet' };
            } else {
                this.cl(`❌ Fehler beim Eröffnen der Station ${stationCode}`);
                return { success: false, stationCode, message: 'Station konnte nicht eröffnet werden' };
            }
            
        } catch (error) {
            console.error(`❌ Fehler beim Eröffnen der Station ${stationCode}:`, error.message);
            return { success: false, stationCode, message: error.message };
        }
    }

    async analyzeStationsForAircraft(aircraftRecommendation) {
        this.cl('🧠 Analysiere beste Stationen für Flugzeug-Empfehlung...');
        
        const existingStations = await this.getExistingStations();
        
        const stationRecommendations = await this.stationAIAnalyzer.analyzeBestStations(
            aircraftRecommendation, 
            existingStations
        );
        
        return {
            ...stationRecommendations,
            existingStations
        };
    }

    async manageStations(aircraftRecommendation) {
        try {
            await this.initialize();

            this.cl('🏢 Starte Station-Management basierend auf Flugzeug-Empfehlung...');
            
            // 1. Analysiere beste Stationen für die Flugzeuge
            const stationAnalysis = await this.analyzeStationsForAircraft(aircraftRecommendation);
            
            this.cl('\n🎯 STATION-EMPFEHLUNGEN:');
            this.cl(`   Basierend auf: ${aircraftRecommendation.model} (${aircraftRecommendation.quantity}x)`);
            this.cl(`   Passagiere pro Flug: ${aircraftRecommendation.aircraft?.passengers || 'Unknown'}`);
            this.cl(`   Reichweite: ${aircraftRecommendation.aircraft?.range || 'Unknown'}`);
            this.cl('');
            this.cl(`   📊 Gefunden: ${stationAnalysis.existingStations.length} existierende Stationen`);
            this.cl(`   🆓 Stationen sind KOMPLETT kostenlos!`);
            this.cl(`   🎯 Top ${stationAnalysis.stations.length} empfohlene neue Stationen:`);
            
            stationAnalysis.stations.forEach((station, index) => {
                this.cl(`     ${index + 1}. ${station.name} (${station.code}) - ${station.country}`);
                this.cl(`        🆓 KOMPLETT KOSTENLOS! (Station + Personal)`);
                this.cl(`        ✈️ Route: ${station.route}`);
                this.cl(`        👥 Erwartete Passagiere: ${station.expectedPassengers}/Tag`);
                this.cl(`        📝 Grund: ${station.reasoning}`);
                this.cl('');
            });
            
            // 2. Wähle beste Station zum Eröffnen
            const selectedStation = this.stationAIAnalyzer.selectStationToOpen(stationAnalysis);
            
            if (!selectedStation) {
                this.cl('❌ Keine Station verfügbar');
                
                decisionLogger.logDecision(
                    'station_management',
                    'Keine Station eröffnet',
                    'Keine Station-Empfehlung erhalten',
                    { 
                        aircraftRecommendation: aircraftRecommendation.model,
                        recommendations: stationAnalysis.stations.length
                    }
                );
                
                return { 
                    action: 'no_station_available', 
                    stationAnalysis,
                    selectedStation: null
                };
            }
            
            // Für echte Eröffnung später:
            await this.openNewStation(selectedStation.code); //const result = 
            
            // Log decision
            const decisionId = decisionLogger.logDecision(
                'station_management',
                `AI empfiehlt Station: ${selectedStation.name} (${selectedStation.code}) für ${aircraftRecommendation.model}`,
                selectedStation.reasoning,
                { 
                    aircraftInfo: stationAnalysis.aircraftInfo,
                    selectedStation,
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
