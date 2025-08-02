const SimpleAircraftManager = require('./simpleAircraftManager');
const StationManager = require('./stationManager');
const decisionLogger = require('../services/decisionLogger');

class IntegratedAirlineManager {
    constructor() {
        this.aircraftManager = new SimpleAircraftManager();
        this.stationManager = new StationManager();
    }

    /**
     * Vollständiges Airline Management: Flugzeuge + Stationen
     */
    async manageAirline() {
        try {
            console.log('🚀 Starte integriertes Airline-Management (Flugzeuge + Stationen)...');
            
            // 1. Flugzeug-Management (bestehende Logik)
            console.log('\n=== SCHRITT 1: FLUGZEUGE ANALYSIEREN ===');
            const aircraftResult = await this.aircraftManager.manageFleet();
            
            if (aircraftResult.action === 'no_purchase_needed') {
                console.log('✅ Airline besitzt bereits Flugzeuge');
                // TODO: Könnte trotzdem Stationen basierend auf existierenden Flugzeugen analysieren
                return { 
                    action: 'no_management_needed', 
                    aircraftResult,
                    reason: 'Airline besitzt bereits Flugzeuge'
                };
            }
            
            if (aircraftResult.action === 'no_aircraft_available') {
                console.log('❌ Keine Flugzeuge verfügbar');
                return { 
                    action: 'no_aircraft_available', 
                    aircraftResult 
                };
            }
            
            if (aircraftResult.action !== 'leasing_recommended') {
                console.log('⚠️ Unerwartetes Flugzeug-Management Ergebnis');
                return { 
                    action: 'unexpected_aircraft_result', 
                    aircraftResult 
                };
            }
            
            // 2. Station-Management basierend auf Flugzeug-Empfehlung
            console.log('\n=== SCHRITT 2: STATIONEN ANALYSIEREN ===');
            const stationResult = await this.stationManager.manageStations(aircraftResult.recommendation);
            
            // 3. Zusammenfassung und Entscheidungslog
            console.log('\n=== INTEGRATED AIRLINE MANAGEMENT RESULT ===');
            console.log('✈️ FLUGZEUG-EMPFEHLUNG:');
            console.log(`   Modell: ${aircraftResult.recommendation.model}`);
            console.log(`   Anzahl: ${aircraftResult.recommendation.quantity}`);
            console.log(`   Security Deposit: ${aircraftResult.recommendation.totalSecurityDeposit.toLocaleString()} AS$`);
            console.log(`   Wochenkosten: ${aircraftResult.recommendation.weeklyRateCost.toLocaleString()} AS$/Woche`);
            console.log(`   Familie: ${aircraftResult.recommendation.familyChoice?.selectedFamily?.name || 'Unknown'}`);
            
            console.log('\n🏢 STATION-EMPFEHLUNG:');
            if (stationResult.selectedStation) {
                console.log(`   Station: ${stationResult.selectedStation.name} (${stationResult.selectedStation.code})`);
                console.log(`   Land: ${stationResult.selectedStation.country}`);
                console.log(`   Kosten: ${stationResult.selectedStation.estimatedCost.toLocaleString()} AS$`);
                console.log(`   Route: ${stationResult.selectedStation.route}`);
                console.log(`   Erwartete Passagiere: ${stationResult.selectedStation.expectedPassengers}/Tag`);
            } else {
                console.log('   Keine Station im Budget verfügbar');
            }
            
            console.log('\n💰 GESAMTKOSTEN:');
            const totalInitialCost = aircraftResult.recommendation.totalSecurityDeposit + 
                                   (stationResult.selectedStation?.estimatedCost || 0);
            const totalWeeklyCost = aircraftResult.recommendation.weeklyRateCost;
            
            console.log(`   Einmalig: ${totalInitialCost.toLocaleString()} AS$`);
            console.log(`   Wöchentlich: ${totalWeeklyCost.toLocaleString()} AS$/Woche`);
            
            console.log('\n📊 NÄCHSTE SCHRITTE:');
            console.log('   1. ✈️ Flugzeuge leasen');
            console.log('   2. 🏢 Station eröffnen'); 
            console.log('   3. 👥 Personal einstellen');
            console.log('   4. 🛩️ Bestuhlung konfigurieren');
            console.log('   5. ✈️ Routen planen');
            console.log('   6. 💰 Preise festlegen');
            console.log('   7. 🚀 Erste Flüge starten');
            
            // Gesamte Entscheidung loggen
            const integratedDecisionId = decisionLogger.logDecision(
                'integrated_airline_management',
                `Vollständiges Airline Setup: ${aircraftResult.recommendation.model} + ${stationResult.selectedStation?.name || 'No Station'}`,
                `AI empfiehlt ${aircraftResult.recommendation.quantity}x ${aircraftResult.recommendation.model} und Station ${stationResult.selectedStation?.code || 'None'} für optimalen Start`,
                {
                    aircraftRecommendation: aircraftResult.recommendation,
                    stationRecommendation: stationResult.selectedStation,
                    totalInitialCost,
                    totalWeeklyCost,
                    aircraftDecisionId: aircraftResult.recommendation.decisionId,
                    stationDecisionId: stationResult.decisionId,
                    budgetAnalysis: {
                        initialBalance: this.aircraftManager.currentBalance?.amount,
                        afterAircraft: this.aircraftManager.currentBalance?.amount - aircraftResult.recommendation.totalSecurityDeposit,
                        afterStation: this.aircraftManager.currentBalance?.amount - totalInitialCost,
                        canAffordBoth: (this.aircraftManager.currentBalance?.amount || 0) >= totalInitialCost
                    }
                }
            );
            
            // Simulate integrated success
            setTimeout(() => {
                decisionLogger.updateDecisionOutcome(integratedDecisionId, 'simulated_success', 9.2);
            }, 3000);

            return {
                action: 'integrated_management_completed',
                aircraftResult,
                stationResult,
                totalCosts: {
                    initial: totalInitialCost,
                    weekly: totalWeeklyCost
                },
                integratedDecisionId
            };

        } catch (error) {
            console.error('❌ Fehler im integrierten Airline-Management:', error);
            
            decisionLogger.logDecision(
                'integrated_airline_management',
                'Integriertes Airline-Management Fehler',
                `Fehler aufgetreten: ${error.message}`,
                { error: error.stack }
            );
            
            throw error;
        }
    }

    /**
     * Nur Station-Management für existierende Airlines mit Flugzeugen
     */
    async manageStationsOnly() {
        try {
            console.log('🏢 Starte nur Station-Management für existierende Airline...');
            
            // Erstmal prüfen welche Flugzeuge die Airline hat
            await this.aircraftManager.initialize();
            const fleetStatus = await this.aircraftManager.checkFleetStatus();
            
            if (fleetStatus.isEmpty) {
                console.log('❌ Keine Flugzeuge vorhanden - verwende stattdessen manageAirline()');
                return { 
                    action: 'no_aircraft_found',
                    suggestion: 'Use manageAirline() instead to get aircraft first'
                };
            }
            
            // TODO: Flugzeug-Info aus Fleet extrahieren für Station-Analyse
            // Für jetzt verwenden wir einen Dummy-Recommendation
            const dummyRecommendation = {
                model: 'Existing Aircraft',
                quantity: 1,
                totalSecurityDeposit: 0,
                aircraft: { passengers: 150, range: '3000 km' },
                familyChoice: { selectedFamily: { name: 'Existing Fleet' } }
            };
            
            const stationResult = await this.stationManager.manageStations(dummyRecommendation);
            
            await this.aircraftManager.cleanup();
            
            return {
                action: 'stations_only_completed',
                stationResult
            };

        } catch (error) {
            console.error('❌ Fehler im Station-Only Management:', error);
            throw error;
        }
    }
}

module.exports = IntegratedAirlineManager;
