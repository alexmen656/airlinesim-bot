const fs = require('fs').promises;
const path = require('path');

class AirlineConfigService {
    constructor() {
        this.airlineFile = path.join(__dirname, '..', 'data', 'airline.json');
        this.airlineInfo = null;
    }

    /**
     * Lädt Airline-Konfiguration aus airline.json
     * @returns {Object} Airline information
     */
    async loadAirlineConfig() {
        try {
            const airlineData = await fs.readFile(this.airlineFile, 'utf8');
            this.airlineInfo = JSON.parse(airlineData);

            //console.log(`✈️ Airline Config: ${this.airlineInfo.name} (${this.airlineInfo.code}) - Hub: ${this.airlineInfo.hub}`);
            return this.airlineInfo;

        } catch (error) {
            console.warn('⚠️ Could not load airline.json, using defaults');

            this.airlineInfo = {
                name: 'Unknown Airline',
                code: 'XXX',
                hub: 'Unknown'
            };

            return this.airlineInfo;
        }
    }

    /**
     * Generiert AI-Kontext mit Hub-Information
     * @returns {string} Hub context for AI
     */
    getAIContext() {
        if (!this.airlineInfo) {
            return 'Airline mit unbekanntem Hub';
        }

        return `Airline: ${this.airlineInfo.name} (${this.airlineInfo.code}) mit Hub in ${this.airlineInfo.hub}`;
    }
}

module.exports = { AirlineConfigService };
