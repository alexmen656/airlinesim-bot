const axios = require('axios');
const decisionLogger = require('./decisionLogger');

class AIService {
    constructor() {
        console.log('AI Service initialized');
    }

    // Communicate with the local API
    async queryLocalAPI(prompt) {
        try {
            const response = await axios.post('http://localhost:11434/api/generate', {
                model: 'nollama/mythomax-l2-13b:Q5_K_S',
                prompt,
                stream: false
            });
            return response.data;
        } catch (error) {
            console.error('Error communicating with local API:', error);
            throw error;
        }
    }

    // Example AI function: Generate text using the local API
    async generateText(prompt) {
        const result = await this.queryLocalAPI(prompt);
        return result.response || 'No response';
    }

    // Example AI function: Summarize text using the local API
    async summarizeText(text) {
        const prompt = `Summarize the following text:\n${text}`;
        const result = await this.queryLocalAPI(prompt);
        return result.response || 'No summary available';
    }

    // STRATEGIC DECISION FUNCTIONS FOR AIRLINESIM

    /**
     * Analyze and recommend aircraft purchases based on current fleet and market conditions
     */
    async analyzeAircraftPurchase(currentFleet, availableAircraft, budget, routes) {
        const prompt = `
        Als AirlineSim AI-Berater, analysiere folgende Situation:
        
        Aktuelle Flotte: ${JSON.stringify(currentFleet)}
        Verfügbare Flugzeuge: ${JSON.stringify(availableAircraft)}
        Budget: ${budget}
        Geplante Routen: ${JSON.stringify(routes)}
        
        Empfehle die besten Flugzeuge für den Kauf. Berücksichtige:
        - Kosten-Nutzen-Verhältnis
        - Passagierkapazität vs. Routennachfrage
        - Betriebskosten und Effizienz
        - Reichweite für geplante Strecken
        
        Antworte im Format: RECOMMENDATION: [Flugzeugtyp], REASON: [detaillierte Begründung], PRIORITY: [1-10]
        `;
        
        const result = await this.queryLocalAPI(prompt);
        const response = result.response || 'No recommendation available';
        
        // Log the decision
        const decisionId = decisionLogger.logDecision(
            'aircraft',
            `Aircraft purchase analysis completed`,
            response,
            { currentFleet, budget, availableAircraft: availableAircraft.length }
        );
        
        return { recommendation: response, decisionId };
    }

    /**
     * Analyze and recommend optimal routes based on market data
     */
    async analyzeRoutes(currentRoutes, marketData, aircraft, competitorData) {
        const prompt = `
        Als AirlineSim Streckenplaner, analysiere folgende Marktdaten:
        
        Aktuelle Strecken: ${JSON.stringify(currentRoutes)}
        Marktdaten: ${JSON.stringify(marketData)}
        Verfügbare Flugzeuge: ${JSON.stringify(aircraft)}
        Konkurrenzdaten: ${JSON.stringify(competitorData)}
        
        Empfehle die profitabelsten neuen Strecken. Berücksichtige:
        - Nachfrage vs. Angebot
        - Entfernung und Flugzeugkapazität
        - Konkurrenzsituation
        - Saisonale Schwankungen
        - Hub-Optimierung
        
        Antworte im Format: ROUTE: [Von-Nach], DEMAND: [Nachfrage], COMPETITION: [Konkurrenz], PROFIT_POTENTIAL: [1-10], REASON: [Begründung]
        `;
        
        const result = await this.queryLocalAPI(prompt);
        const response = result.response || 'No route recommendation available';
        
        const decisionId = decisionLogger.logDecision(
            'route',
            `Route analysis completed`,
            response,
            { currentRoutes: currentRoutes.length, marketAnalyzed: Object.keys(marketData).length }
        );
        
        return { recommendation: response, decisionId };
    }

    /**
     * Optimize pricing strategy based on demand, competition, and costs
     */
    async optimizePricing(route, currentPrice, demand, competition, costs) {
        const prompt = `
        Als AirlineSim Pricing-Experte, optimiere die Preise für:
        
        Strecke: ${JSON.stringify(route)}
        Aktueller Preis: ${currentPrice}
        Nachfrage: ${JSON.stringify(demand)}
        Konkurrenz: ${JSON.stringify(competition)}
        Kosten: ${JSON.stringify(costs)}
        
        Empfehle optimale Preisgestaltung. Berücksichtige:
        - Nachfrageelastizität
        - Konkurrenzpreise
        - Gewinnmaximierung
        - Marktanteil vs. Profitabilität
        - Yield Management
        
        Antworte im Format: PRICE: [Neuer Preis], CHANGE: [Änderung in %], EXPECTED_LOAD: [Erwartete Auslastung], PROFIT_MARGIN: [Gewinnmarge], REASON: [Begründung]
        `;
        
        const result = await this.queryLocalAPI(prompt);
        const response = result.response || 'No pricing recommendation available';
        
        const decisionId = decisionLogger.logDecision(
            'pricing',
            `Pricing optimization for route ${route.from}-${route.to}`,
            response,
            { route, currentPrice, expectedDemand: demand }
        );
        
        return { recommendation: response, decisionId };
    }

    /**
     * Analyze fleet composition and recommend optimizations
     */
    async analyzeFleetOptimization(currentFleet, routes, utilization, maintenance) {
        const prompt = `
        Als AirlineSim Flottenmanager, analysiere die Flottenoptimierung:
        
        Aktuelle Flotte: ${JSON.stringify(currentFleet)}
        Strecken: ${JSON.stringify(routes)}
        Auslastung: ${JSON.stringify(utilization)}
        Wartung: ${JSON.stringify(maintenance)}
        
        Empfehle Flottenoptimierungen. Berücksichtige:
        - Flugzeugauslastung
        - Wartungskosten
        - Alter der Flugzeuge
        - Effizienz pro Strecke
        - Kapazitätsplanung
        
        Antworte im Format: ACTION: [Verkaufen/Kaufen/Behalten], AIRCRAFT: [Flugzeugtyp], QUANTITY: [Anzahl], REASON: [Begründung], PRIORITY: [1-10]
        `;
        
        const result = await this.queryLocalAPI(prompt);
        const response = result.response || 'No fleet optimization available';
        
        const decisionId = decisionLogger.logDecision(
            'fleet',
            `Fleet optimization analysis completed`,
            response,
            { fleetSize: currentFleet.length, routesCovered: routes.length }
        );
        
        return { recommendation: response, decisionId };
    }

    /**
     * Strategic planning and long-term goals
     */
    async strategicPlanning(companyData, marketTrends, goals, timeframe) {
        const prompt = `
        Als AirlineSim Strategieberater, entwickle einen strategischen Plan:
        
        Unternehmensdaten: ${JSON.stringify(companyData)}
        Markttrends: ${JSON.stringify(marketTrends)}
        Ziele: ${JSON.stringify(goals)}
        Zeitrahmen: ${timeframe}
        
        Entwickle eine strategische Roadmap. Berücksichtige:
        - Kurz-, mittel- und langfristige Ziele
        - Marktpositionierung
        - Wachstumsstrategie
        - Risikomanagement
        - Investitionsprioriten
        
        Antworte im Format: STRATEGY: [Strategiename], PHASES: [Phasen], TIMELINE: [Zeitplan], INVESTMENTS: [Nötige Investitionen], RISKS: [Risiken], REASON: [Begründung]
        `;
        
        const result = await this.queryLocalAPI(prompt);
        const response = result.response || 'No strategic plan available';
        
        const decisionId = decisionLogger.logDecision(
            'strategy',
            `Strategic planning for ${timeframe}`,
            response,
            { goals, timeframe, companySize: companyData.employees || 'unknown' }
        );
        
        return { recommendation: response, decisionId };
    }

    /**
     * Market analysis and competitor monitoring
     */
    async analyzeMarket(marketData, competitorData, industryTrends) {
        const prompt = `
        Als AirlineSim Marktanalyst, analysiere den Markt:
        
        Marktdaten: ${JSON.stringify(marketData)}
        Konkurrenzdaten: ${JSON.stringify(competitorData)}
        Branchentrends: ${JSON.stringify(industryTrends)}
        
        Erstelle eine Marktanalyse. Berücksichtige:
        - Marktgröße und Wachstum
        - Wettbewerbsintensität
        - Chancen und Bedrohungen
        - Preisdruck
        - Neue Marktsegmente
        
        Antworte im Format: MARKET_SIZE: [Größe], GROWTH: [Wachstum], COMPETITION: [Intensität 1-10], OPPORTUNITIES: [Chancen], THREATS: [Bedrohungen], RECOMMENDATION: [Empfehlung]
        `;
        
        const result = await this.queryLocalAPI(prompt);
        const response = result.response || 'No market analysis available';
        
        const decisionId = decisionLogger.logDecision(
            'strategy',
            'Market analysis completed',
            response,
            { marketSegments: Object.keys(marketData).length, competitorsAnalyzed: competitorData.length }
        );
        
        return { recommendation: response, decisionId };
    }

    // Add more AI-related functions here as needed
}
/*new AIService().generateText("hallo").then(res => {
    console.log(res);
});*/
module.exports = new AIService();
