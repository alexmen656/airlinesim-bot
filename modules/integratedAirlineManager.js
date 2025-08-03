const SimpleAircraftManager = require('./simpleAircraftManager');
const StationManager = require('./stationManager');
const decisionLogger = require('../services/decisionLogger');

class IntegratedAirlineManager {
    constructor() {
        this.aircraftManager = new SimpleAircraftManager();
        this.stationManager = new StationManager();
    }

    async manageAirline() {
        try {
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
                console.log(`   Station: ${stationResult.selectedStation.name} (${stationResult.selectedStation.code}), ${stationResult.selectedStation.country}`);
                console.log(`   Route: ${stationResult.selectedStation.route}`);
                console.log(`   Erwartete Passagiere: ${stationResult.selectedStation.expectedPassengers}/Tag`);
            } else {
                console.log('   Keine Station verfügbar');
            }

            console.log('\n💰 GESAMTKOSTEN:');

            const totalInitialCost = aircraftResult.recommendation.totalSecurityDeposit +
                (stationResult.selectedStation?.estimatedCost || 0);
            const totalWeeklyCost = aircraftResult.recommendation.weeklyRateCost;

            console.log(`   Einmalig: ${aircraftResult.recommendation.totalSecurityDeposit.toLocaleString()} AS$`);
            console.log(`   Wöchentlich: ${aircraftResult.recommendation.weeklyRateCost.toLocaleString()} AS$/Woche`);

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

            // Extrahiere echte Flugzeug-Info aus der Fleet für Station-Analyse
            const fleetData = await this.aircraftManager.getFleetData();

            if (!fleetData || fleetData.length === 0) {
                console.log('❌ Keine Flugzeug-Daten verfügbar');
                return {
                    action: 'no_fleet_data',
                    error: 'Keine Flugzeug-Daten verfügbar für Station-Analyse'
                };
            }

            // Erstelle umfassende Fleet-Informationen für Station-Analyse
            const fleetSummary = {
                totalAircraft: fleetData.length,
                aircraftTypes: [...new Set(fleetData.map(a => a.type))],
                families: [...new Set(fleetData.map(a => a.family))],
                totalPassengerCapacity: fleetData.reduce((sum, a) => sum + (a.passengers || 0), 0),
                averagePassengers: Math.round(fleetData.reduce((sum, a) => sum + (a.passengers || 0), 0) / fleetData.length),
                rangeTypes: [...new Set(fleetData.map(a => a.range))],
                individualAircraft: fleetData
            };

            // Bereite vollständige Aircraft-Empfehlung mit ALLEN Flugzeugtypen vor
            const aircraftRecommendation = {
                model: `Mixed Fleet (${fleetSummary.aircraftTypes.join(', ')})`,
                quantity: fleetSummary.totalAircraft,
                totalSecurityDeposit: 0, // Bereits geleaste Flugzeuge
                aircraft: {
                    passengers: fleetSummary.averagePassengers,
                    totalCapacity: fleetSummary.totalPassengerCapacity,
                    range: fleetSummary.rangeTypes.join(' | '),
                    family: fleetSummary.families.join(' + '),
                    types: fleetSummary.aircraftTypes,
                    individualSpecs: fleetData.map(a => ({
                        type: a.type,
                        passengers: a.passengers,
                        range: a.range,
                        registration: a.registration,
                        status: a.status
                    }))
                },
                familyChoice: {
                    selectedFamily: {
                        name: `Mixed: ${fleetSummary.families.join(' + ')}`,
                        types: fleetSummary.aircraftTypes
                    }
                },
                fleetAnalysis: fleetSummary
            };

            console.log(`🔍 Fleet-Analyse für Station-Management:`);
            console.log(`   📊 ${fleetSummary.totalAircraft} Flugzeuge total`);
            console.log(`   ✈️ Typen: ${fleetSummary.aircraftTypes.join(', ')}`);
            console.log(`   👥 ${fleetSummary.totalPassengerCapacity} Passagierplätze gesamt (⌀ ${fleetSummary.averagePassengers})`);
            console.log(`   🏢 Familien: ${fleetSummary.families.join(' + ')}`);

            // Detaillierte Flugzeug-Liste
            console.log(`   📝 Einzelne Flugzeuge:`);
            fleetData.forEach(aircraft => {
                console.log(`      - ${aircraft.registration}: ${aircraft.type} (${aircraft.passengers} Pax, ${aircraft.range})`);
            });

            const stationResult = await this.stationManager.manageStations(aircraftRecommendation);

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
