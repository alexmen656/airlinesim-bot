const aiService = require('./aiService');

class StationAIAnalyzer {
    constructor(airlineConfig, currentBalance) {
        this.airlineConfig = airlineConfig;
        this.currentBalance = currentBalance;
    }

    async analyzeBestStations(aircraftRecommendation, existingStations = []) {
        console.log('🏢 AI analysiert beste Stationen für Flugzeug-Empfehlung...');

        const prompt = `
            Du bist ein AirlineSim-Experte für Stationsnetzwerk-Planung. Analysiere die besten Stationen zum Eröffnen basierend auf der Flugzeug-Empfehlung.

            STRATEGISCHE ZIELE:
            - Maximale Profitabilität pro Route
            - Schneller Aufbau eines effizienten Hub-and-Spoke Systems
            - Aufbau einer großen, dominanten Airline
            - Optimale Auslastung der empfohlenen Flugzeuge

            FLUGZEUG-EMPFEHLUNG:
            - Modell: ${aircraftRecommendation.model}
            - Anzahl: ${aircraftRecommendation.quantity}x
            - Passagiere: ${aircraftRecommendation.aircraft?.passengers || 'Unknown'}
            - Reichweite: ${aircraftRecommendation.aircraft?.range || 'Unknown'}
            - Familie: ${aircraftRecommendation.aircraft?.family || 'Unknown'}

            HUB-INFORMATION:
            ${this.airlineConfig.getAIContext()}

            BESTEHENDE STATIONEN:
            ${existingStations.length > 0 ?
                            existingStations.map(station => `- ${station.name} (${station.code}): ${station.country}`).join('\n') :
                            '- Nur Hub: ' + this.airlineConfig.airlineInfo.hub
                        }

            STATION-KRITERIEN:
            1. Reichweite: Stationen müssen in Reichweite des Flugzeugs sein
            2. Nachfrage: Hohe Passagier- und Frachtnachfrage 
            3. Konkurrenz: Wenig überfüllte Routen
            4. Profitabilität: Hohe Ticketpreise und Auslastung möglich
            5. Netzwerk: Gute Anbindung für weitere Expansion

            WICHTIGE ÜBERLEGUNGEN:
            - ${aircraftRecommendation.aircraft?.passengers || 150} Passagiere pro Flug optimal auslasten
            - Hub-and-Spoke vs. Point-to-Point Strategie
            - Internationale vs. Domestische Routen
            - Saisonalität und Zeitzonenvorteile

            Empfehle die TOP 5 besten Stationen zum Eröffnen:

            ANTWORTE NUR MIT:
            STATION_1: [Flughafen Name] ([CODE]) - [Land]
            GRUND_1: [Begründung in 1-2 Sätzen]
            ROUTE_1: [Hub] ↔ [Station] - [Geschätzte tägliche Passagiere]

            STATION_2: [Flughafen Name] ([CODE]) - [Land] 
            GRUND_2: [Begründung in 1-2 Sätzen]
            ROUTE_2: [Hub] ↔ [Station] - [Geschätzte tägliche Passagiere]

            STATION_3: [Flughafen Name] ([CODE]) - [Land]
            GRUND_3: [Begründung in 1-2 Sätzen] 
            ROUTE_3: [Hub] ↔ [Station] - [Geschätzte tägliche Passagiere]

            STATION_4: [Flughafen Name] ([CODE]) - [Land]
            GRUND_4: [Begründung in 1-2 Sätzen]
            ROUTE_4: [Hub] ↔ [Station] - [Geschätzte tägliche Passagiere]

            STATION_5: [Flughafen Name] ([CODE]) - [Land]
            GRUND_5: [Begründung in 1-2 Sätzen]
            ROUTE_5: [Hub] ↔ [Station] - [Geschätzte tägliche Passagiere]

            PRIORITÄT: [1-5, welche Station zuerst eröffnen]
        `;

        const aiResponse = await aiService.generateText(prompt);
        console.log('🤖 AI Station-Empfehlung:', aiResponse, true);

        const recommendations = this.parseStationRecommendations(aiResponse);

        return {
            ...recommendations,
            aircraftInfo: {
                model: aircraftRecommendation.model,
                quantity: aircraftRecommendation.quantity,
                passengers: aircraftRecommendation.aircraft?.passengers,
                range: aircraftRecommendation.aircraft?.range
            },
            aiResponse
        };
    }

    parseStationRecommendations(aiResponse) {
        const stations = [];

        for (let i = 1; i <= 5; i++) {
            const stationPattern = `STATION_${i}:\\s*(.+?)\\s*\\(([A-Z]{3})\\)\\s*-\\s*(.+)`;
            const grundPattern = `GRUND_${i}:\\s*(.+?)(?=ROUTE_${i}:|STATION_${i + 1}:|PRIORITÄT:|$)`;
            const routePattern = `ROUTE_${i}:\\s*(.+?)\\s*-\\s*(.+?)(?=STATION_${i + 1}:|GRUND_${i + 1}:|PRIORITÄT:|$)`;

            const stationMatch = aiResponse.match(new RegExp(stationPattern, 'i'));
            const grundMatch = aiResponse.match(new RegExp(grundPattern, 'is'));
            const routeMatch = aiResponse.match(new RegExp(routePattern, 'is'));

            if (stationMatch) {
                stations.push({
                    rank: i,
                    name: stationMatch[1].trim(),
                    code: stationMatch[2].trim(),
                    country: stationMatch[3].trim(),
                    reasoning: grundMatch ? grundMatch[1].trim() : `Station ${i} Empfehlung`,
                    route: routeMatch ? routeMatch[1].trim() : `${this.airlineConfig.airlineInfo.hub} ↔ ${stationMatch[2].trim()}`,
                    expectedPassengers: routeMatch ? this.extractPassengerCount(routeMatch[2]) : 100
                });
            }
        }

        const prioritätMatch = aiResponse.match(/PRIORITÄT:\s*(\d+)/i);
        const priority = prioritätMatch ? parseInt(prioritätMatch[1]) : 1;

        if (priority >= 1 && priority <= 5) {
            const priorityStation = stations.find(s => s.rank === priority);
            if (priorityStation) {
                stations.sort((a, b) => a.rank === priority ? -1 : b.rank === priority ? 1 : a.rank - b.rank);
            }
        }

        return {
            stations,
            topPriority: priority,
            recommendedFirst: stations[0] || null
        };
    }

    extractPassengerCount(routeString) {
        const match = routeString.match(/(\d+)\s*(passagiere|passengers|pax)/i);
        return match ? parseInt(match[1]) : 100;
    }

    selectStationToOpen(recommendations) {
        if (!recommendations.stations || recommendations.stations.length === 0) {
            return null;
        }

        const selectedStation = recommendations.stations[0];

        console.log(`✅ Station ausgewählt: ${selectedStation.name} (${selectedStation.code})`, true);
        console.log(`🆓 Station-Eröffnung: KOMPLETT KOSTENLOS!`);
        console.log(`📊 Begründung: ${selectedStation.reasoning}`);

        return selectedStation;
    }
}

module.exports = StationAIAnalyzer;