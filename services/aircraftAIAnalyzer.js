const aiService = require('./aiService');

class AircraftAIAnalyzer {
    constructor(airlineConfig, currentBalance) {
        this.airlineConfig = airlineConfig;
        this.currentBalance = currentBalance;
    }

    async chooseBestFamily(familyGroups, budget) {
        console.log('Wähle beste Flugzeugfamilie...', true);

        const prompt = `Du bist ein deutscher AirlineSim-Experte. Antworte NUR auf DEUTSCH!

            Hub: ${this.airlineConfig.airlineInfo.hub}
            Budget: ${budget.toLocaleString()} AS$

            VERFÜGBARE FAMILIEN:
            ${familyGroups.map((group, i) =>
                        `${i + 1}. ${group.name}
            Passagiere: ${group.minPassengers}-${group.maxPassengers}
            Security Deposit: ${group.minSecurityDeposit.toLocaleString()}-${group.maxSecurityDeposit.toLocaleString()} AS$`
                    ).join('\n')}

            SCHREIBE EXAKT DIESE 3 ZEILEN (auf Deutsch, mit exaktem Familiennamen):

            FAMILIE: [Name aus Liste kopieren]
            GRUND: [Deutsche Begründung]
            PASSAGIER_ZIEL: [Zahl]

            BEISPIEL:
            FAMILIE: A319 / A320 / A321 NEO
            GRUND: Beste Profitabilität für Mittelstrecken
            PASSAGIER_ZIEL: 180

            WICHTIG: 
            - NUR DEUTSCH antworten!
            - EXAKT den Namen aus der Liste kopieren!
            - Keine englischen Wörter!

            Deine Antwort:`;

        const aiResponse = await aiService.generateText(prompt);
        console.log('==================================================', true)
        console.log('==================================================', true)

        console.log('AI Familie-Wahl Prompt:', prompt); // Nur in Log-Datei
        console.log('==================================================')
        console.log('==================================================')

        console.log('AI Familie-Wahl:', aiResponse, true); // Zeigt in Konsole
        console.log('==================================================', true)
        console.log('==================================================', true)

        const familienMatch = aiResponse.match(/FAMILIE:\s*(.+)/i);
        const grundMatch = aiResponse.match(/GRUND:\s*(.+?)(?=PASSAGIER_ZIEL:|$)/is);
        const passagierMatch = aiResponse.match(/PASSAGIER_ZIEL:\s*(\d+)/i);

        const gewählteFamilie = familienMatch ? familienMatch[1].trim() : '';
        const grund = grundMatch ? grundMatch[1].trim() : 'AI-Empfehlung basierend auf Familie-Analyse';
        const zielPassagiere = passagierMatch ? parseInt(passagierMatch[1]) : 150;

        let selectedFamily = familyGroups.find(group =>
            group.name.toLowerCase() === gewählteFamilie.toLowerCase()
        );

        if (!selectedFamily) {
            selectedFamily = familyGroups.find(group =>
                group.name.toLowerCase().includes(gewählteFamilie.toLowerCase()) ||
                gewählteFamilie.toLowerCase().includes(group.name.toLowerCase())
            );
        }

        if (!selectedFamily && familyGroups.length > 0) {
            const maxAffordableDeposit = budget * 0.8;
            const affordableFamilies = familyGroups.filter(group =>
                group.minSecurityDeposit <= maxAffordableDeposit
            );

            if (affordableFamilies.length > 0) {
                selectedFamily = affordableFamilies.reduce((best, current) => {
                    const bestRatio = best.maxPassengers / best.minSecurityDeposit;
                    const currentRatio = current.maxPassengers / current.minSecurityDeposit;
                    return currentRatio > bestRatio ? current : best;
                });
                console.warn(`⚠️ Familie "${gewählteFamilie}" nicht gefunden, verwende budgetfreundlichste mit gutem Preis-Leistungs-Verhältnis: ${selectedFamily.name}`, true);
            } else {
                console.warn(`⚠️ Familie "${gewählteFamilie}" nicht gefunden und kein Geld`, true);
            }
        }

        return {
            selectedFamily,
            reasoning: grund,
            targetPassengers: zielPassagiere,
            aiResponse
        };
    }

    async chooseBestModel(familyAircraft, familyChoice, budget) {
        console.log('AI Schritt 2: Wähle bestes Modell aus Familie...', true);

        const prompt = `Du bist ein deutscher AirlineSim-Experte. Antworte NUR auf DEUTSCH!

            Familie: ${familyChoice.selectedFamily.name}
            Hub: ${this.airlineConfig.airlineInfo.hub} 
            Budget: ${budget.toLocaleString()} AS$

            VERFÜGBARE MODELLE:
            ${familyAircraft.map((aircraft, i) =>
                        `${i + 1}. ${aircraft.model}
            Passagiere: ${aircraft.passengers} | Security Deposit: ${aircraft.securityDeposit.toLocaleString()} AS$`
                    ).join('\n')}

            SCHREIBE EXAKT DIESE 5 ZEILEN (auf Deutsch, mit exaktem Modellnamen):

            EMPFEHLUNG: [Modellname aus Liste kopieren]
            ANZAHL: [Zahl]
            GRUND: [Deutsche Begründung]
            SECURITY_DEPOSITS: [Gesamtsumme ohne Punkte]
            WOCHENKOSTEN: [Gesamtsumme ohne Punkte]

            BEISPIEL:
            EMPFEHLUNG: A320-251N
            ANZAHL: 2
            GRUND: Optimale Größe für profitable Routen
            SECURITY_DEPOSITS: 4000000
            WOCHENKOSTEN: 200000

            WICHTIG:
            - NUR DEUTSCH antworten!
            - EXAKT den Modellnamen aus der Liste kopieren!
            - Zahlen ohne Punkte oder Kommas!

            Deine Antwort:`;

        const aiResponse = await aiService.generateText(prompt);
        console.log('🤖 AI Modell-Wahl:', aiResponse, true); // Zeigt in Konsole

        // Parse AI response
        const empfehlungMatch = aiResponse.match(/EMPFEHLUNG:\s*(.+)/i);
        const anzahlMatch = aiResponse.match(/ANZAHL:\s*(\d+)/i);
        const grundMatch = aiResponse.match(/GRUND:\s*(.+?)(?=SECURITY_DEPOSITS:|$)/is);
        const securityMatch = aiResponse.match(/SECURITY_DEPOSITS:\s*([\d,]+)/i);
        const wochenMatch = aiResponse.match(/WOCHENKOSTEN:\s*([\d,]+)/i);

        const empfohlenerName = empfehlungMatch ? empfehlungMatch[1].trim() : '';
        const anzahl = anzahlMatch ? parseInt(anzahlMatch[1]) : 1;
        const grund = grundMatch ? grundMatch[1].trim() : 'AI-Empfehlung basierend auf Modell-Analyse';

        // Finde das Flugzeug in der Familie (exact match zuerst)
        let recommendedAircraft = familyAircraft.find(aircraft =>
            aircraft.model.toLowerCase() === empfohlenerName.toLowerCase()
        );

        // Fallback: Partial match
        if (!recommendedAircraft) {
            recommendedAircraft = familyAircraft.find(aircraft =>
                aircraft.model.toLowerCase().includes(empfohlenerName.toLowerCase()) ||
                empfohlenerName.toLowerCase().includes(aircraft.model.toLowerCase())
            );
        }

        // Weiterer Fallback: Budgetfreundliches Flugzeug mit bestem Preis-Leistungs-Verhältnis
        if (!recommendedAircraft && familyAircraft.length > 0) {
            // Filtere Flugzeuge die ins Budget passen (Security Deposit + geschätzte Bestuhlung < 70% Budget)
            const maxAffordableDeposit = budget * 0.5; // 50% für Security Deposit, 20% für Bestuhlung
            const affordableAircraft = familyAircraft.filter(aircraft =>
                aircraft.securityDeposit <= maxAffordableDeposit
            );

            if (affordableAircraft.length > 0) {
                // Wähle Flugzeug mit bestem Verhältnis: Passagiere pro AS$ Security Deposit
                recommendedAircraft = affordableAircraft.reduce((best, current) => {
                    const bestRatio = best.passengers / best.securityDeposit;
                    const currentRatio = current.passengers / current.securityDeposit;
                    return currentRatio > bestRatio ? current : best;
                });
                console.warn(`⚠️ Flugzeug "${empfohlenerName}" nicht gefunden, verwende budgetfreundliches mit bestem Preis-Leistungs-Verhältnis: ${recommendedAircraft.model}`);
            } else {
                // Notfall: Günstigstes Flugzeug
                recommendedAircraft = familyAircraft[0]; // Bereits nach Security Deposit sortiert
                console.warn(`⚠️ Flugzeug "${empfohlenerName}" nicht gefunden und keine budgetfreundliche Option verfügbar, verwende günstigstes: ${recommendedAircraft.model}`);
            }
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
            familyChoice: familyChoice,
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
            aiWeeklyEstimate: aiWeeklyEstimate,
            // Zusätzliche Infos
            totalAircraftInFamily: familyAircraft.length
        };
    }

    async analyzeAircraftChoice(allAircraft, aircraftDataService, budget = null) {
        console.log('🧠 Starte zweistufige AI-Analyse für Flugzeug-Leasing...', true);

        if (!budget) {
            budget = Math.floor(this.currentBalance.amount * 0.8);
        }

        const familyGroups = aircraftDataService.groupAircraftByFamily(allAircraft);
        console.log(`📊 Gefunden: ${familyGroups.length} Flugzeugfamilien mit insgesamt ${allAircraft.length} Modellen`, true);

        const familyChoice = await this.chooseBestFamily(familyGroups, budget);

        if (!familyChoice.selectedFamily) {
            throw new Error('AI konnte keine geeignete Flugzeugfamilie finden');
        }

        console.log(`✅ Familie gewählt: ${familyChoice.selectedFamily.name} (${familyChoice.selectedFamily.totalModels} Modelle)`, true);

        const modelChoice = await this.chooseBestModel(
            familyChoice.selectedFamily.aircraft,
            familyChoice,
            budget
        );

        if (!modelChoice.aircraft) {
            throw new Error(`AI konnte kein geeignetes Modell in Familie ${familyChoice.selectedFamily.name} finden`);
        }

        console.log(`✅ Modell gewählt: ${modelChoice.model} (${modelChoice.quantity}x)`, true);

        return modelChoice;
    }
}

module.exports = AircraftAIAnalyzer;
