const aiService = require('./aiService');

class AircraftAIAnalyzer {
    constructor(airlineConfig, currentBalance) {
        this.airlineConfig = airlineConfig;
        this.currentBalance = currentBalance;
    }

    async chooseBestFamily(familyGroups, budget) {
        console.log('Wähle beste Flugzeugfamilie...');

        const prompt = `Wähle die beste Flugzeugfamilie für Hub ${this.airlineConfig.airlineInfo.hub} mit Budget ${budget.toLocaleString()} AS$.

            VERFÜGBARE FAMILIEN:
            ${familyGroups.map((group, i) =>
            `${i + 1}. ${group.name}
            Passagiere: ${group.minPassengers}-${group.maxPassengers}
            Security Deposit: ${group.minSecurityDeposit.toLocaleString()}-${group.maxSecurityDeposit.toLocaleString()} AS$`
        ).join('\n')}

            REGEL: Security Deposit + Bestuhlung (50k-200k AS$) < 80% Budget

            Du MUSST zB exakt so antworten:
            FAMILIE: A319 / A320 / A321 NEO
            GRUND: Beste Profitabilität für mittelstrecken
            PASSAGIER_ZIEL: 180

            oder: 

            FAMILIE: 787
            GRUND: Ideal für Langstrecken
            PASSAGIER_ZIEL: 240

            WICHTIG: Verwende den EXAKTEN Namen aus der Liste oben! Zum Beispiel:
            - "A319 / A320 / A321 NEO" (NICHT "A320 NEO")
            - "737 MAX" (NICHT "Boeing 737 MAX")
            - "ERJ 135/140/145" (NICHT "Embraer ERJ")`;

        const aiResponse = await aiService.generateText(prompt);
        console.log('==================================================')
        console.log('==================================================')

        console.log('AI Familie-Wahl Prompt:', prompt);
        console.log('==================================================')
        console.log('==================================================')

        console.log('AI Familie-Wahl:', aiResponse);
        console.log('==================================================')
        console.log('==================================================')

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
                console.warn(`⚠️ Familie "${gewählteFamilie}" nicht gefunden, verwende budgetfreundlichste mit gutem Preis-Leistungs-Verhältnis: ${selectedFamily.name}`);
            } else {
                console.warn(`⚠️ Familie "${gewählteFamilie}" nicht gefunden und kein Geld`);
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
        console.log('AI Schritt 2: Wähle bestes Modell aus Familie...');

        const topAircraft = familyAircraft;

        const prompt = `Wähle das beste Modell aus Familie "${familyChoice.selectedFamily.name}" für Hub ${this.airlineConfig.airlineInfo.hub} mit Budget ${budget.toLocaleString()} AS$.

VERFÜGBARE MODELLE:
${topAircraft.map((aircraft, i) =>
            `${i + 1}. ${aircraft.model}
   Passagiere: ${aircraft.passengers} | Reichweite: ${aircraft.range}
   Security Deposit: ${aircraft.securityDeposit.toLocaleString()} AS$ | Wochenrate: ${aircraft.weeklyRate.toLocaleString()} AS$`
        ).join('\n')}

REGEL: Security Deposits + Bestuhlung < 80% Budget

Du MUSST exakt so antworten:

EMPFEHLUNG: A320-251N
ANZAHL: 3
GRUND: Optimale Größe für profitabilität
SECURITY_DEPOSITS: 5000000
WOCHENKOSTEN: 250000

WICHTIG: Verwende den EXAKTEN Modellnamen aus der Liste oben!

Deine Antwort:`;

        const aiResponse = await aiService.generateText(prompt);
        console.log('🤖 AI Modell-Wahl:', aiResponse);

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
        let recommendedAircraft = topAircraft.find(aircraft =>
            aircraft.model.toLowerCase() === empfohlenerName.toLowerCase()
        );

        // Fallback: Partial match
        if (!recommendedAircraft) {
            recommendedAircraft = topAircraft.find(aircraft =>
                aircraft.model.toLowerCase().includes(empfohlenerName.toLowerCase()) ||
                empfohlenerName.toLowerCase().includes(aircraft.model.toLowerCase())
            );
        }

        // Weiterer Fallback: Budgetfreundliches Flugzeug mit bestem Preis-Leistungs-Verhältnis
        if (!recommendedAircraft && topAircraft.length > 0) {
            // Filtere Flugzeuge die ins Budget passen (Security Deposit + geschätzte Bestuhlung < 70% Budget)
            const maxAffordableDeposit = budget * 0.5; // 50% für Security Deposit, 20% für Bestuhlung
            const affordableAircraft = topAircraft.filter(aircraft =>
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
                recommendedAircraft = topAircraft[0]; // Bereits nach Security Deposit sortiert
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
            analyzedAircraftCount: topAircraft.length,
            totalAircraftInFamily: familyAircraft.length
        };
    }

    /**
     * Kombinierte zweistufige AI-Analyse
     */
    async analyzeAircraftChoice(allAircraft, aircraftDataService, budget = null) {
        console.log('🧠 Starte zweistufige AI-Analyse für Flugzeug-Leasing...');

        // Use current balance as budget if not provided - mehr konservativ für zusätzliche Kosten
        if (!budget) {
            budget = Math.floor(this.currentBalance.amount * 0.6); // Use nur 60% für Security Deposits (Rest für Bestuhlung, Personal etc.)
            console.log(`💰 Using 60% of current balance as budget: ${budget.toLocaleString()} AS$ (Reserve für Bestuhlung & Personal)`);
        }

        // Schritt 1: Gruppiere Flugzeuge nach Familien
        const familyGroups = aircraftDataService.groupAircraftByFamily(allAircraft);
        console.log(`📊 Gefunden: ${familyGroups.length} Flugzeugfamilien mit insgesamt ${allAircraft.length} Modellen`);

        // Schritt 2: AI wählt beste Familie
        const familyChoice = await this.chooseBestFamily(familyGroups, budget);

        if (!familyChoice.selectedFamily) {
            throw new Error('AI konnte keine geeignete Flugzeugfamilie finden');
        }

        console.log(`✅ Familie gewählt: ${familyChoice.selectedFamily.name} (${familyChoice.selectedFamily.totalModels} Modelle)`);

        // Schritt 3: AI wählt bestes Modell aus der Familie
        const modelChoice = await this.chooseBestModel(
            familyChoice.selectedFamily.aircraft,
            familyChoice,
            budget
        );

        if (!modelChoice.aircraft) {
            throw new Error(`AI konnte kein geeignetes Modell in Familie ${familyChoice.selectedFamily.name} finden`);
        }

        console.log(`✅ Modell gewählt: ${modelChoice.model} (${modelChoice.quantity}x)`);
        console.log(`📊 AI analysierte ${modelChoice.analyzedAircraftCount} von ${modelChoice.totalAircraftInFamily} Modellen in der Familie`);

        return modelChoice;
    }
}

module.exports = AircraftAIAnalyzer;
