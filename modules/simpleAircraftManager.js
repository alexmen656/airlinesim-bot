const { createBrowserWithCookies } = require('../services/puppeteerSettings');
const decisionLogger = require('../services/decisionLogger');
const aiService = require('../services/aiService');

class SimpleAircraftManager {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async initialize() {
        const { browser, page } = await createBrowserWithCookies();
        this.browser = browser;
        this.page = page;
        
        // Prüfe ob eingeloggt
        await this.checkLoginStatus();
    }

    async checkLoginStatus() {
        console.log('🔐 Überprüfe Login-Status...');
        
        try {
            // Gehe zu einer geschützten Seite
            await this.page.goto('https://free2.airlinesim.aero/app/enterprise/dashboard');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const isLoggedIn = await this.page.evaluate(() => {
                // Prüfe ob Login-Formular oder Dashboard-Elemente vorhanden sind
                const hasLoginForm = document.querySelector('input[type="email"]') || 
                                   document.querySelector('input[type="password"]') ||
                                   document.body.textContent.includes('Login');
                
                const hasDashboard = document.body.textContent.includes('QuestAir') ||
                                   document.body.textContent.includes('AS$') ||
                                   document.querySelector('.navbar .balance');
                
                return !hasLoginForm && hasDashboard;
            });
            
            if (isLoggedIn) {
                console.log('✅ Bereits eingeloggt');
            } else {
                console.log('❌ Nicht eingeloggt - bitte zuerst einloggen!');
                throw new Error('User ist nicht eingeloggt. Bitte zuerst "node modules/loginAutomation.js" ausführen.');
            }
            
        } catch (error) {
            console.error('❌ Login-Status-Prüfung fehlgeschlagen:', error.message);
            throw error;
        }
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    /**
     * Prüft, ob die Airline bereits Flugzeuge besitzt
     */
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
     * Scrapt verfügbare Flugzeuge von der Manufacturers-Seite
     */
    async getAvailableAircraft() {
        console.log('🔍 Lade verfügbare Flugzeuge...');
        
        // Gehe zu Airbus A319/A320/A321 NEO Familie (basierend auf deinen HTML-Dateien)
        await this.page.goto('https://free2.airlinesim.aero/action/enterprise/aircraftsFamily?id=1200310');
        await new Promise(resolve => setTimeout(resolve, 3000));

        const aircraft = await this.page.evaluate(() => {
            const rows = document.querySelectorAll('table.table-bordered tbody tr');
            const aircraftList = [];

            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 8) {
                    const modelLink = cells[0].querySelector('a');
                    const model = modelLink ? modelLink.textContent.trim() : '';
                    const passengers = cells[1].textContent.trim();
                    const cargo = cells[2].textContent.trim();
                    const range = cells[3].textContent.trim();
                    const speed = cells[4].textContent.trim();
                    const price = cells[7].textContent.trim();
                    const available = cells[8].textContent.trim();
                    const onAuction = cells[9].textContent.trim();

                    if (model && available.toLowerCase().includes('yes')) {
                        aircraftList.push({
                            model,
                            passengers: parseInt(passengers) || 0,
                            cargo,
                            range,
                            speed,
                            price,
                            available: available.toLowerCase().includes('yes'),
                            onAuction: parseInt(onAuction) || 0,
                            priceNumeric: parseInt(price.replace(/[^\d]/g, '')) || 0
                        });
                    }
                }
            });

            return aircraftList;
        });

        console.log(`✈️ Gefunden: ${aircraft.length} verfügbare Flugzeuge`);
        return aircraft;
    }

    /**
     * Analysiert mit AI, welches Flugzeug gekauft werden soll
     */
    async analyzeAircraftChoice(availableAircraft, budget = 50000000) {
        console.log('🧠 AI analysiert beste Flugzeug-Option...');
        
        const prompt = `
Du bist ein AirlineSim-Experte. Analysiere folgende verfügbare Flugzeuge und empfehle das BESTE für eine neue Airline:

Budget: ${budget.toLocaleString()} AS$

Verfügbare Flugzeuge:
${availableAircraft.map((aircraft, i) => 
    `${i+1}. ${aircraft.model}
   - Passagiere: ${aircraft.passengers}
   - Reichweite: ${aircraft.range}
   - Preis: ${aircraft.price}
   - Gebraucht verfügbar: ${aircraft.onAuction}`
).join('\n\n')}

Für eine neue Airline mit Hub in Deutschland (wahrscheinlich DUS/FRA/MUC):
- Welches Flugzeug ist am besten?
- Warum genau dieses Modell?
- Wie viele sollten gekauft werden?

ANTWORTE NUR MIT:
EMPFEHLUNG: [Exakter Flugzeugname]
ANZAHL: [Nummer]
GRUND: [Kurze präzise Begründung in 1-2 Sätzen]
KOSTEN: [Gesamtkosten]
        `;

        const aiResponse = await aiService.generateText(prompt);
        console.log('🤖 AI Empfehlung:', aiResponse);

        // Parse AI response
        const recommendation = this.parseAIRecommendation(aiResponse, availableAircraft);
        
        // Log decision
        const decisionId = decisionLogger.logDecision(
            'aircraft',
            `AI empfiehlt: ${recommendation.model} (${recommendation.quantity}x)`,
            recommendation.reasoning,
            { 
                availableOptions: availableAircraft.length,
                budget,
                totalCost: recommendation.totalCost
            }
        );

        return { ...recommendation, decisionId };
    }

    /**
     * Parst die AI-Antwort und findet das empfohlene Flugzeug
     */
    parseAIRecommendation(aiResponse, availableAircraft) {
        // Extrahiere Empfehlung aus AI Response
        const empfehlungMatch = aiResponse.match(/EMPFEHLUNG:\s*(.+)/i);
        const anzahlMatch =  aiResponse.match(/ANZAHL:\s*(\d+)/i);
        const grundMatch = aiResponse.match(/GRUND:\s*(.+?)(?=KOSTEN:|$)/is);
        
        const empfohlenerName = empfehlungMatch ? empfehlungMatch[1].trim() : '';
        const anzahl = anzahlMatch ? parseInt(anzahlMatch[1]) : 1;
        const grund = grundMatch ? grundMatch[1].trim() : 'AI-Empfehlung basierend auf Kosten-Nutzen-Analyse';

        // Finde das Flugzeug in der Liste
        let recommendedAircraft = availableAircraft.find(aircraft => 
            aircraft.model.toLowerCase().includes(empfohlenerName.toLowerCase()) ||
            empfohlenerName.toLowerCase().includes(aircraft.model.toLowerCase())
        );

        // Fallback: Nimm das günstigste verfügbare A320neo
        if (!recommendedAircraft) {
            recommendedAircraft = availableAircraft
                .filter(aircraft => aircraft.model.includes('A320neo'))
                .sort((a, b) => a.priceNumeric - b.priceNumeric)[0];
        }

        // Weiterer Fallback: Erstes verfügbares Flugzeug
        if (!recommendedAircraft) {
            recommendedAircraft = availableAircraft[0];
        }

        const totalCost = recommendedAircraft ? recommendedAircraft.priceNumeric * anzahl : 0;

        return {
            model: recommendedAircraft ? recommendedAircraft.model : 'Kein Flugzeug gefunden',
            aircraft: recommendedAircraft,
            quantity: anzahl,
            reasoning: grund,
            totalCost: totalCost,
            aiResponse: aiResponse
        };
    }

    /**
     * Hauptfunktion: Prüft Fleet und kauft bei Bedarf Flugzeuge
     */
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

            console.log('⚠️ Keine Flugzeuge gefunden - AI wird Kaufempfehlung geben');

            // 2. Lade verfügbare Flugzeuge
            const availableAircraft = await this.getAvailableAircraft();
            
            if (availableAircraft.length === 0) {
                console.log('❌ Keine verfügbaren Flugzeuge gefunden');
                return { action: 'no_aircraft_available' };
            }

            // 3. AI-Analyse für beste Option
            const recommendation = await this.analyzeAircraftChoice(availableAircraft);
            
            console.log('\n🎯 KAUFEMPFEHLUNG:');
            console.log(`   Flugzeug: ${recommendation.model}`);
            console.log(`   Anzahl: ${recommendation.quantity}`);
            console.log(`   Gesamtkosten: ${recommendation.totalCost.toLocaleString()} AS$`);
            console.log(`   Begründung: ${recommendation.reasoning}`);

            // 4. Hier würde der tatsächliche Kauf stattfinden
            // Für jetzt nur simulieren
            console.log('\n💡 SIMULATION: Flugzeugkauf würde jetzt durchgeführt');
            console.log('   (Echter Kauf kann implementiert werden)');

            // Update decision outcome
            setTimeout(() => {
                decisionLogger.updateDecisionOutcome(
                    recommendation.decisionId, 
                    'simulated_success', 
                    8.5
                );
            }, 2000);

            return {
                action: 'purchase_recommended',
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
