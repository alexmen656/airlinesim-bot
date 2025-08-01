const { createBrowserWithCookies } = require('../services/puppeteerSettings');
const decisionLogger = require('../services/decisionLogger');
const aiService = require('../services/aiService');
const authService = require('../services/authService');
const { BalanceService } = require('../services/balanceService');
const { AirlineConfigService } = require('../services/airlineConfigService');
const fs = require('fs').promises;
const path = require('path');

class SimpleAircraftManager {
    constructor() {
        this.browser = null;
        this.page = null;
        this.balanceService = new BalanceService();
        this.airlineConfig = new AirlineConfigService();
        this.aircraftCacheFile = path.join(__dirname, '..', 'data', 'aircraft_cache.json');
        this.cacheValidityHours = 72; // Cache für 72 Stunden
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
     * Updates current balance and checks affordability
     * @param {number} requiredAmount - Amount needed for purchase (optional)
     * @returns {Object} Balance info with affordability check
     */
    async checkBalanceAndAffordability(requiredAmount = null) {
        try {
            console.log('💰 Checking current balance...');
            
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

    /**
     * Prüft ob der Aircraft-Cache noch gültig ist
     */
    async isCacheValid() {
        try {
            const cacheData = await fs.readFile(this.aircraftCacheFile, 'utf8');
            const cache = JSON.parse(cacheData);
            
            const cacheTime = new Date(cache.timestamp);
            const now = new Date();
            const hoursSinceCache = (now - cacheTime) / (1000 * 60 * 60);
            
            const isValid = hoursSinceCache < this.cacheValidityHours;
            
            if (isValid) {
                console.log(`📋 Aircraft-Cache ist gültig (${hoursSinceCache.toFixed(1)}h alt, max ${this.cacheValidityHours}h)`);
            } else {
                console.log(`📋 Aircraft-Cache ist abgelaufen (${hoursSinceCache.toFixed(1)}h alt, max ${this.cacheValidityHours}h)`);
            }
            
            return {
                isValid,
                age: hoursSinceCache,
                data: cache.aircraft || []
            };
            
        } catch (error) {
            console.log('📋 Kein Aircraft-Cache gefunden, erstelle neuen Cache');
            return { isValid: false, age: 0, data: [] };
        }
    }

    /**
     * Speichert Aircraft-Daten im Cache
     */
    async saveAircraftCache(aircraftData) {
        try {
            const cache = {
                timestamp: new Date().toISOString(),
                totalAircraft: aircraftData.length,
                aircraft: aircraftData,
                cacheValidityHours: this.cacheValidityHours
            };
            
            // Ensure data directory exists
            const dataDir = path.dirname(this.aircraftCacheFile);
            await fs.mkdir(dataDir, { recursive: true });
            
            await fs.writeFile(this.aircraftCacheFile, JSON.stringify(cache, null, 2));
            
            console.log(`💾 Aircraft-Cache gespeichert: ${aircraftData.length} Flugzeuge`);
            
        } catch (error) {
            console.warn('⚠️ Fehler beim Speichern des Aircraft-Cache:', error.message);
        }
    }

    /**
     * Lädt alle verfügbaren Flugzeugfamilien dynamisch von der Manufacturers-Seite
     */
    async getAllAircraftFamilies() {
        console.log('🔍 Lade alle Flugzeugfamilien von Manufacturers-Seite...');
        
        await this.page.goto('https://free2.airlinesim.aero/app/aircraft/manufacturers', {
            waitUntil: 'networkidle2',
            timeout: 15000
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000));

        const families = await this.page.evaluate(() => {
            const familyLinks = document.querySelectorAll('a.type-link[href*="aircraftsFamily"]');
            const familiesList = [];

            familyLinks.forEach(link => {
                const href = link.getAttribute('href');
                const name = link.textContent.trim();
                const idMatch = href.match(/id=(\d+)/);
                
                if (idMatch) {
                    familiesList.push({
                        name: name,
                        id: idMatch[1],
                        url: href
                    });
                }
            });

            return familiesList;
        });

        console.log(`📋 Gefunden: ${families.length} Flugzeugfamilien (Airbus, Boeing, etc.)`);
        return families;
    }

    /**
     * Scrapt verfügbare Flugzeuge von ALLEN Familien mit Leasing-Berechnung und Caching
     */
    async getAvailableAircraft(forceRefresh = false) {
        console.log('🔍 Lade verfügbare Flugzeuge...');
        
        // Prüfe Cache, außer wenn forceRefresh=true
        if (!forceRefresh) {
            const cacheStatus = await this.isCacheValid();
            if (cacheStatus.isValid && cacheStatus.data.length > 0) {
                console.log(`✅ Verwende cached Aircraft-Daten (${cacheStatus.data.length} Flugzeuge)`);
                console.log(`💰 Security Deposit Spanne: ${cacheStatus.data[0]?.securityDeposit.toLocaleString()} - ${cacheStatus.data[cacheStatus.data.length-1]?.securityDeposit.toLocaleString()} AS$`);
                return cacheStatus.data;
            }
        }
        
        console.log('🔄 Aktualisiere Aircraft-Daten aus ALLEN Familien...');
        
        // Lade alle Familien dynamisch
        const aircraftFamilies = await this.getAllAircraftFamilies();
        let allAircraft = [];

        for (const family of aircraftFamilies) {
            try {
                console.log(`  📋 Scanne Familie: ${family.name}`);
                
                await this.page.goto(`https://free2.airlinesim.aero/action/enterprise/aircraftsFamily?id=${family.id}`, {
                    waitUntil: 'networkidle2',
                    timeout: 15000
                });
                
                await new Promise(resolve => setTimeout(resolve, 2000));

                const familyAircraft = await this.page.evaluate((familyName) => {
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
                            const priceText = cells[7].textContent.trim();
                            const availableText = cells[8] ? cells[8].textContent.trim() : '';
                            const onAuctionText = cells[9] ? cells[9].textContent.trim() : '0';

                            // Extrahiere echten Preis (z.B. "35,734,000 AS$")
                            const priceMatch = priceText.match(/[\d,]+/);
                            const purchasePrice = priceMatch ? 
                                parseInt(priceMatch[0].replace(/,/g, '')) : 0;

                            if (model && availableText.toLowerCase().includes('yes') && purchasePrice > 0) {
                                // Leasing-Berechnung
                                const securityDeposit = Math.floor(purchasePrice / 20); // 1/20 des Kaufpreises
                                const weeklyRate = Math.floor(purchasePrice / 200);     // 1/200 des Kaufpreises
                                const initialCost = securityDeposit; // Erste Woche kostenlos

                                aircraftList.push({
                                    model,
                                    family: familyName,
                                    passengers: parseInt(passengers) || 0,
                                    cargo,
                                    range,
                                    speed,
                                    priceText: priceText,
                                    purchasePrice: purchasePrice,
                                    // Leasing-Informationen
                                    securityDeposit: securityDeposit,
                                    weeklyRate: weeklyRate,
                                    initialCost: initialCost, // Nur Security Deposit
                                    available: true,
                                    onAuction: parseInt(onAuctionText) || 0
                                });
                            }
                        }
                    });

                    return aircraftList;
                }, family.name);

                allAircraft = [...allAircraft, ...familyAircraft];
                console.log(`    ✅ ${familyAircraft.length} Flugzeuge gefunden in ${family.name}`);

            } catch (error) {
                console.warn(`    ⚠️ Fehler beim Scannen von ${family.name}:`, error.message);
            }
        }

        // Sortiere nach initialCost (Security Deposit)
        allAircraft.sort((a, b) => a.initialCost - b.initialCost);

        console.log(`✈️ Gesamt gefunden: ${allAircraft.length} verfügbare Flugzeuge`);
        if (allAircraft.length > 0) {
            console.log(`💰 Security Deposit Spanne: ${allAircraft[0]?.securityDeposit.toLocaleString()} - ${allAircraft[allAircraft.length-1]?.securityDeposit.toLocaleString()} AS$`);
        }
        
        // Speichere im Cache
        await this.saveAircraftCache(allAircraft);
        
        return allAircraft;
    }

    /**
     * Löscht den Aircraft-Cache (erzwingt Neuladen beim nächsten Aufruf)
     */
    async clearAircraftCache() {
        try {
            await fs.unlink(this.aircraftCacheFile);
            console.log('🗑️ Aircraft-Cache gelöscht');
            return true;
        } catch (error) {
            console.log('🗑️ Kein Aircraft-Cache zum Löschen gefunden');
            return false;
        }
    }

    /**
     * Zeigt Cache-Statistiken an
     */
    async getCacheInfo() {
        try {
            const cacheStatus = await this.isCacheValid();
            return {
                exists: true,
                isValid: cacheStatus.isValid,
                ageHours: cacheStatus.age,
                maxAgeHours: this.cacheValidityHours,
                aircraftCount: cacheStatus.data.length,
                cacheFile: this.aircraftCacheFile
            };
        } catch (error) {
            return {
                exists: false,
                isValid: false,
                ageHours: 0,
                maxAgeHours: this.cacheValidityHours,
                aircraftCount: 0,
                cacheFile: this.aircraftCacheFile
            };
        }
    }

    /**
     * Analysiert mit AI, welches Flugzeug geleast werden soll
     */
    async analyzeAircraftChoice(availableAircraft, budget = null) {
        console.log('🧠 AI analysiert beste Flugzeug-Leasing-Option...');
        
        // Use current balance as budget if not provided
        if (!budget) {
            const balanceInfo = await this.checkBalanceAndAffordability();
            budget = Math.floor(balanceInfo.amount * 0.8); // Use 80% of available balance as safe budget
            console.log(`💰 Using 80% of current balance as budget: ${budget.toLocaleString()} AS$`);
        }
        
        const prompt = `
Du bist ein AirlineSim-Experte. Analysiere folgende verfügbare Flugzeuge für LEASING (nicht Kauf!) und empfehle das BESTE für eine neue Airline:

Verfügbares Budget: ${budget.toLocaleString()} AS$ (aktueller Kontostand: ${this.currentBalance.amount.toLocaleString()} AS$)

${this.airlineConfig.getAIContext()}

LEASING-KONDITIONEN:
- Security Deposit: 1/20 des Kaufpreises (einmalig zu zahlen)
- Wöchentliche Rate: 1/200 des Kaufpreises (erste Woche KOSTENLOS)
- Sofortige Kosten = nur Security Deposit

Verfügbare Flugzeuge (sortiert nach Security Deposit):
${availableAircraft.slice(0, 20).map((aircraft, i) => 
    `${i+1}. ${aircraft.model} (${aircraft.family})
   - Passagiere: ${aircraft.passengers}
   - Reichweite: ${aircraft.range}
   - Kaufpreis: ${aircraft.priceText}
   - Security Deposit: ${aircraft.securityDeposit.toLocaleString()} AS$ (sofort fällig)
   - Wochenrate: ${aircraft.weeklyRate.toLocaleString()} AS$ (ab Woche 2)
   - Gebraucht verfügbar: ${aircraft.onAuction}`
).join('\n\n')}

Für Hub ${this.airlineInfo.hub}:
- Welches Flugzeug ist am besten für LEASING?
- Warum genau dieses Modell für ${this.airlineInfo.hub}?
- Wie viele sollten geleast werden (Budget reicht nur für Security Deposits!)?

WICHTIG: 
- Rechne nur mit Security Deposits für die Anfangskosten!
- Erste Woche Leasing ist kostenlos!
- Ab Woche 2: Wochenrate pro Flugzeug

ANTWORTE NUR MIT:
EMPFEHLUNG: [Exakter Flugzeugname]
ANZAHL: [Nummer]
GRUND: [Kurze präzise Begründung in 1-2 Sätzen]
SECURITY_DEPOSITS: [Gesamte Security Deposits in AS$]
WOCHENKOSTEN: [Wöchentliche Kosten ab Woche 2 in AS$]
        `;

        const aiResponse = await aiService.generateText(prompt);
        console.log('🤖 AI Leasing-Empfehlung:', aiResponse);

        // Parse AI response
        const recommendation = this.parseAIRecommendation(aiResponse, availableAircraft);
        
        // Check if we can afford the recommendation (Security Deposits)
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
                leasingType: 'new_leasing'
            }
        );

        return { ...recommendation, decisionId, balanceCheck: affordabilityCheck };
    }

    /**
     * Parst die AI-Antwort und findet das empfohlene Flugzeug für Leasing
     */
    parseAIRecommendation(aiResponse, availableAircraft) {
        // Extrahiere Empfehlung aus AI Response
        const empfehlungMatch = aiResponse.match(/EMPFEHLUNG:\s*(.+)/i);
        const anzahlMatch = aiResponse.match(/ANZAHL:\s*(\d+)/i);
        const grundMatch = aiResponse.match(/GRUND:\s*(.+?)(?=SECURITY_DEPOSITS:|$)/is);
        const securityMatch = aiResponse.match(/SECURITY_DEPOSITS:\s*([\d,]+)/i);
        const wochenMatch = aiResponse.match(/WOCHENKOSTEN:\s*([\d,]+)/i);
        
        const empfohlenerName = empfehlungMatch ? empfehlungMatch[1].trim() : '';
        const anzahl = anzahlMatch ? parseInt(anzahlMatch[1]) : 1;
        const grund = grundMatch ? grundMatch[1].trim() : 'AI-Empfehlung basierend auf Leasing-Analyse';

        // Finde das Flugzeug in der Liste (exact match zuerst)
        let recommendedAircraft = availableAircraft.find(aircraft => 
            aircraft.model.toLowerCase() === empfohlenerName.toLowerCase()
        );

        // Fallback: Partial match
        if (!recommendedAircraft) {
            recommendedAircraft = availableAircraft.find(aircraft => 
                aircraft.model.toLowerCase().includes(empfohlenerName.toLowerCase()) ||
                empfohlenerName.toLowerCase().includes(aircraft.model.toLowerCase())
            );
        }

        // Weiterer Fallback: Günstigstes verfügbares Flugzeug (niedrigster Security Deposit)
        if (!recommendedAircraft && availableAircraft.length > 0) {
            recommendedAircraft = availableAircraft[0]; // Bereits nach Security Deposit sortiert
            console.warn(`⚠️ Flugzeug "${empfohlenerName}" nicht gefunden, verwende günstigstes: ${recommendedAircraft.model}`);
        }

        // Berechne echte Leasing-Kosten
        const totalSecurityDeposit = recommendedAircraft ? recommendedAircraft.securityDeposit * anzahl : 0;
        const weeklyRateCost = recommendedAircraft ? recommendedAircraft.weeklyRate * anzahl : 0;

        // Validiere AI-Kostenberechnung
        const aiSecurityEstimate = securityMatch ? parseInt(securityMatch[1].replace(/,/g, '')) : 0;
        const aiWeeklyEstimate = wochenMatch ? parseInt(wochenMatch[1].replace(/,/g, '')) : 0;
        
        if (aiSecurityEstimate > 0 && Math.abs(totalSecurityDeposit - aiSecurityEstimate) > totalSecurityDeposit * 0.1) {
            console.warn(`⚠️ AI Security Deposit ungenau: AI sagte ${aiSecurityEstimate.toLocaleString()} AS$, real: ${totalSecurityDeposit.toLocaleString()} AS$`);
        }

        if (aiWeeklyEstimate > 0 && Math.abs(weeklyRateCost - aiWeeklyEstimate) > weeklyRateCost * 0.1) {
            console.warn(`⚠️ AI Wochenkosten ungenau: AI sagte ${aiWeeklyEstimate.toLocaleString()} AS$, real: ${weeklyRateCost.toLocaleString()} AS$`);
        }

        return {
            model: recommendedAircraft ? recommendedAircraft.model : 'Kein Flugzeug gefunden',
            aircraft: recommendedAircraft,
            quantity: anzahl,
            reasoning: grund,
            // Leasing-spezifische Kosten
            totalSecurityDeposit: totalSecurityDeposit,
            weeklyRateCost: weeklyRateCost,
            securityDepositPerUnit: recommendedAircraft ? recommendedAircraft.securityDeposit : 0,
            weeklyRatePerUnit: recommendedAircraft ? recommendedAircraft.weeklyRate : 0,
            // Für Rückwärtskompatibilität
            totalCost: totalSecurityDeposit, // Verwende Security Deposit als "Sofortkosten"
            pricePerUnit: recommendedAircraft ? recommendedAircraft.securityDeposit : 0,
            aiResponse: aiResponse,
            aiSecurityEstimate: aiSecurityEstimate,
            aiWeeklyEstimate: aiWeeklyEstimate
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

            console.log('⚠️ Keine Flugzeuge gefunden - AI wird Leasing-Empfehlung geben');

            // 2. Lade verfügbare Flugzeuge von ALLEN Familien
            const availableAircraft = await this.getAvailableAircraft();
            
            if (availableAircraft.length === 0) {
                console.log('❌ Keine verfügbaren Flugzeuge gefunden');
                return { action: 'no_aircraft_available' };
            }

            // 3. AI-Analyse für beste Leasing-Option
            const recommendation = await this.analyzeAircraftChoice(availableAircraft);
            
            console.log('\n🎯 LEASING-EMPFEHLUNG:');
            console.log(`   Flugzeug: ${recommendation.model} (${recommendation.aircraft?.family || 'Unknown Family'})`);
            console.log(`   Kaufpreis: ${recommendation.aircraft?.priceText || 'Unknown'}`);
            console.log(`   Anzahl: ${recommendation.quantity}`);
            console.log('');
            console.log('   💰 LEASING-KOSTEN:');
            console.log(`     Security Deposit (einmalig): ${recommendation.totalSecurityDeposit.toLocaleString()} AS$`);
            console.log(`     Wochenrate (ab Woche 2): ${recommendation.weeklyRateCost.toLocaleString()} AS$/Woche`);
            console.log(`     Erste Woche: KOSTENLOS`);
            console.log(`   Begründung: ${recommendation.reasoning}`);
            
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
            // Für jetzt nur simulieren
            console.log('\n💡 SIMULATION: Flugzeug-Leasing würde jetzt durchgeführt');
            console.log('   (Echtes Leasing kann implementiert werden)');
            console.log('   📋 Nächste Schritte:');
            console.log(`     1. Security Deposit zahlen: ${recommendation.totalSecurityDeposit.toLocaleString()} AS$`);
            console.log(`     2. Erste Woche: Kostenlos fliegen`);
            console.log(`     3. Ab Woche 2: ${recommendation.weeklyRateCost.toLocaleString()} AS$ pro Woche zahlen`);

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

    // Hilfsfunktionen
    parsePrice(priceString) {
        return parseInt(priceString.replace(/[^\d]/g, '')) || 0;
    }
}

module.exports = SimpleAircraftManager;
