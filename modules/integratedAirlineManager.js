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

            if (aircraftResult.action !== 'leasing_recommended') {
                console.log(`✅ ${aircraftResult.action}: ${aircraftResult.reason || 'Kein Kauf nötig'}`);
                return { action: aircraftResult.action, aircraftResult };
            }

            const stationResult = await this.stationManager.manageStations(aircraftResult.recommendation);
            const totalInitialCost = aircraftResult.recommendation.totalSecurityDeposit + (stationResult.selectedStation?.estimatedCost || 0);

            console.log(`\n✈️ ${aircraftResult.recommendation.model} x${aircraftResult.recommendation.quantity}`);
            console.log(`🏢 ${stationResult.selectedStation?.name || 'Keine Station'}`);
            console.log(`💰 ${totalInitialCost.toLocaleString()} AS$ initial`);

            const decisionId = decisionLogger.logDecision(
                'integrated_airline_management',
                `${aircraftResult.recommendation.model} + ${stationResult.selectedStation?.name || 'No Station'}`,
                'Airline Setup abgeschlossen',
                { aircraftResult, stationResult, totalInitialCost }
            );

            return {
                action: 'completed',
                aircraftResult,
                stationResult,
                totalCosts: { initial: totalInitialCost, weekly: aircraftResult.recommendation.weeklyRateCost },
                decisionId
            };

        } catch (error) {
            console.error('❌ Fehler:', error.message);
            throw error;
        }
    }

    async manageStationsOnly() {
        try {
            await this.aircraftManager.initialize();
            const fleetStatus = await this.aircraftManager.checkFleetStatus();

            if (fleetStatus.isEmpty) {
                return { action: 'no_aircraft_found', suggestion: 'Use manageAirline() instead' };
            }

            const fleetData = await this.aircraftManager.getFleetData();
            if (!fleetData?.length) {
                return { action: 'no_fleet_data' };
            }

            const aircraftTypes = [...new Set(fleetData.map(a => a.type))];
            const families = [...new Set(fleetData.map(a => a.family))];
            const ranges = [...new Set(fleetData.map(a => a.range))];
            const avgPassengers = Math.round(fleetData.reduce((sum, a) => sum + (a.passengers || 0), 0) / fleetData.length);

            const aircraftRecommendation = {
                model: `Mixed Fleet (${aircraftTypes.join(', ')})`,
                quantity: fleetData.length,
                totalSecurityDeposit: 0,
                aircraft: {
                    passengers: avgPassengers,
                    range: ranges.join(' | '),
                    family: families.join(' + '),
                    types: aircraftTypes
                },
                familyChoice: {
                    selectedFamily: {
                        name: `Mixed: ${families.join(' + ')}`,
                        types: aircraftTypes
                    }
                }
            };

            console.log(`🔍 Fleet: ${fleetData.length} Flugzeuge verfügbar`);
            const stationResult = await this.stationManager.manageStations(aircraftRecommendation);
            await this.aircraftManager.cleanup();

            return { action: 'stations_only_completed', stationResult };

        } catch (error) {
            console.error('❌ Fehler im Station-Management:', error);
            throw error;
        }
    }
}

module.exports = IntegratedAirlineManager;
