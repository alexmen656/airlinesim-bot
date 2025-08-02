const aiService = require('./aiService');

class AircraftAIAnalyzer {
    constructor(airlineConfig, currentBalance) {
        this.airlineConfig = airlineConfig;
        this.currentBalance = currentBalance;
    }

    /**
     * Schritt 1: AI wählt die beste Flugzeugfamilie aus
     */
    async chooseBestFamily(familyGroups, budget) {
        console.log('🧠 AI Schritt 1: Wähle beste Flugzeugfamilie...');
        
        const prompt = `
Du bist ein AirlineSim-Experte. Wähle die BESTE Flugzeugfamilie für eine neue Airline mit dem strategischen Ziel, eine HOCHPROFITABLE und GROSSE Airline aufzubauen.

STRATEGISCHE ZIELE:
- Maximale Profitabilität pro Flug und Passagier
- Schnelles Wachstum und Skalierbarkeit
- Aufbau einer großen, dominanten Airline
- Langfristige Marktführerschaft anstreben

Verfügbares Budget: ${budget.toLocaleString()} AS$ (aktueller Kontostand: ${this.currentBalance.amount.toLocaleString()} AS$)

LEASING-KONDITIONEN:
- Security Deposit: 1/20 des Kaufpreises (einmalig zu zahlen)
- Wöchentliche Rate: 1/200 des Kaufpreises (erste Woche KOSTENLOS)
- Sofortige Kosten = nur Security Deposit

ZUSÄTZLICHE KOSTEN PRO FLUGZEUG:
- Bestuhlung: ~50,000-200,000 AS$ pro Flugzeug (je nach Größe)

BUDGET-REGEL: Wähle NUR Flugzeuge wo Security Deposit + Bestuhlung < 70% des Budgets!

Verfügbare Flugzeugfamilien:
${familyGroups.map((group, i) => 
    `${i+1}. ${group.name}
   - Anzahl Modelle: ${group.totalModels}
   - Passagiere: ${group.minPassengers} - ${group.maxPassengers}
   - Security Deposit Spanne: ${group.minSecurityDeposit.toLocaleString()} - ${group.maxSecurityDeposit.toLocaleString()} AS$
   - Günstigstes Modell: ${group.minSecurityDeposit.toLocaleString()} AS$ Security Deposit`
).join('\n\n')}

Für Hub ${this.airlineConfig.airlineInfo.hub}:
- Welche Familie ist am besten für Leasing zum Aufbau einer HOCHPROFITABLEN und GROSSEN Airline?
- Warum genau diese Familie für maximale Profitabilität und Wachstum in ${this.airlineConfig.airlineInfo.hub}?
- Welche Größenkategorie (Passagiere) ist optimal für hohe Gewinne und schnelle Expansion?

WICHTIG: 
- Fokus auf PROFITABILITÄT und SKALIERBARKEIT, aber INNERHALB des Budgets!
- NIEMALS mehr als 70% des Budgets für Security Deposits verwenden!
- Berücksichtige ZUSÄTZLICHE Kosten: Bestuhlung (50k-200k AS$)
- Welche Familie bietet das beste Verhältnis aus Gewinn pro Flug und erschwinglichen Startkosten?
- Berücksichtige Hub-Größe und lukrative Routen-Möglichkeiten
- Erste Woche Leasing ist kostenlos!

ANTWORTE NUR MIT:
FAMILIE: [Exakter Familienname]
GRUND: [Kurze präzise Begründung in 1-2 Sätzen]
PASSAGIER_ZIEL: [Gewünschte Passagieranzahl für optimales Modell]
        `;

        console.log('🧠 AI Prompt für Familienwahl:', prompt);

        const aiResponse = await aiService.generateText(prompt);
        console.log('🤖 AI Familie-Wahl:', aiResponse);

        // Parse AI response
        const familienMatch = aiResponse.match(/FAMILIE:\s*(.+)/i);
        const grundMatch = aiResponse.match(/GRUND:\s*(.+?)(?=PASSAGIER_ZIEL:|$)/is);
        const passagierMatch = aiResponse.match(/PASSAGIER_ZIEL:\s*(\d+)/i);
        
        const gewählteFamilie = familienMatch ? familienMatch[1].trim() : '';
        const grund = grundMatch ? grundMatch[1].trim() : 'AI-Empfehlung basierend auf Familie-Analyse';
        const zielPassagiere = passagierMatch ? parseInt(passagierMatch[1]) : 150;

        // Finde die gewählte Familie
        let selectedFamily = familyGroups.find(group => 
            group.name.toLowerCase() === gewählteFamilie.toLowerCase()
        );

        // Fallback: Partial match
        if (!selectedFamily) {
            selectedFamily = familyGroups.find(group => 
                group.name.toLowerCase().includes(gewählteFamilie.toLowerCase()) ||
                gewählteFamilie.toLowerCase().includes(group.name.toLowerCase())
            );
        }

        // Weiterer Fallback: Familie mit bestem Preis-Leistungs-Verhältnis (nicht nur günstigste)
        if (!selectedFamily && familyGroups.length > 0) {
            // Finde Familie mit niedrigsten Security Deposits, die ins Budget passen
            const maxAffordableDeposit = budget * 0.5; // 50% für Security Deposit, Rest für Bestuhlung etc.
            const affordableFamilies = familyGroups.filter(group => 
                group.minSecurityDeposit <= maxAffordableDeposit
            );
            
            if (affordableFamilies.length > 0) {
                // Wähle Familie mit bestem Verhältnis: niedrige Kosten aber hohe Passagierzahl
                selectedFamily = affordableFamilies.reduce((best, current) => {
                    const bestRatio = best.maxPassengers / best.minSecurityDeposit;
                    const currentRatio = current.maxPassengers / current.minSecurityDeposit;
                    return currentRatio > bestRatio ? current : best;
                });
                console.warn(`⚠️ Familie "${gewählteFamilie}" nicht gefunden, verwende budgetfreundlichste mit gutem Preis-Leistungs-Verhältnis: ${selectedFamily.name}`);
            } else {
                // Notfall: Günstigste Familie nehmen
                selectedFamily = familyGroups.reduce((cheapest, current) => 
                    current.minSecurityDeposit < cheapest.minSecurityDeposit ? current : cheapest
                );
                console.warn(`⚠️ Familie "${gewählteFamilie}" nicht gefunden und keine budgetfreundliche Option verfügbar, verwende günstigste: ${selectedFamily.name}`);
            }
        }

        return {
            selectedFamily,
            reasoning: grund,
            targetPassengers: zielPassagiere,
            aiResponse
        };
    }

    /**
     * Schritt 2: AI wählt das beste spezifische Modell aus der Familie
     */
    async chooseBestModel(familyAircraft, familyChoice, budget) {
        console.log('🧠 AI Schritt 2: Wähle bestes Modell aus Familie...');
        
        // Filter Flugzeuge nach Zielpassagierzahl (±50 Passagiere Toleranz)
        const targetPassengers = familyChoice.targetPassengers;
        const filteredAircraft = familyAircraft.filter(aircraft => 
            Math.abs(aircraft.passengers - targetPassengers) <= 50
        );

        // Verwende gefilterte Liste, falls vorhanden, sonst alle
        const aircraftToAnalyze = filteredAircraft.length > 0 ? filteredAircraft : familyAircraft;
        
        // Limitiere auf Top 20 günstigste Modelle um AI-Context zu reduzieren
        const topAircraft = aircraftToAnalyze
            .sort((a, b) => a.securityDeposit - b.securityDeposit)
            .slice(0, 20);

        const prompt = `
Du bist ein AirlineSim-Experte. Wähle das BESTE spezifische Flugzeugmodell aus der Familie "${familyChoice.selectedFamily.name}" mit dem strategischen Ziel, eine HOCHPROFITABLE und GROSSE Airline aufzubauen.

STRATEGISCHE ZIELE:
- Maximale Profitabilität pro Flug und Passagier
- Schnelles Wachstum und Skalierbarkeit
- Aufbau einer großen, dominanten Airline
- Langfristige Marktführerschaft anstreben

Verfügbares Budget: ${budget.toLocaleString()} AS$ (aktueller Kontostand: ${this.currentBalance.amount.toLocaleString()} AS$)

${this.airlineConfig.getAIContext()}

LEASING-KONDITIONEN:
- Security Deposit: 1/20 des Kaufpreises (einmalig zu zahlen)
- Wöchentliche Rate: 1/200 des Kaufpreises (erste Woche KOSTENLOS)
- Sofortige Kosten = nur Security Deposit

ZUSÄTZLICHE KOSTEN PRO FLUGZEUG:
- Bestuhlung: ~50,000-200,000 AS$ pro Flugzeug (je nach Größe)

BUDGET-REGEL: Security Deposit + Bestuhlung DARF NICHT mehr als 70% des Budgets betragen!

Verfügbare Modelle in Familie "${familyChoice.selectedFamily.name}" (Top 20 günstigste):
${topAircraft.map((aircraft, i) => 
    `${i+1}. ${aircraft.model}
   - Passagiere: ${aircraft.passengers}
   - Reichweite: ${aircraft.range}
   - Geschwindigkeit: ${aircraft.speed}
   - Kaufpreis: ${aircraft.priceText}
   - Security Deposit: ${aircraft.securityDeposit.toLocaleString()} AS$ (sofort fällig)
   - Wochenrate: ${aircraft.weeklyRate.toLocaleString()} AS$ (ab Woche 2)
   - Gebraucht verfügbar: ${aircraft.onAuction}`
).join('\n\n')}

Für Hub ${this.airlineConfig.airlineInfo.hub}:
- Welches Modell ist am besten für LEASING zum Aufbau einer HOCHPROFITABLEN und GROSSEN Airline?
- Warum genau dieses Modell für maximale Profitabilität und schnelles Wachstum?
- Wie viele sollten geleast werden für optimalen Start einer großen Airline (Budget reicht nur für Security Deposits!)?

WICHTIG: 
- BUDGET-LIMIT: Security Deposit + Bestuhlung DARF NICHT mehr als 70% des Budgets betragen!
- Fokus auf PROFITABILITÄT pro Flug, aber nur erschwingliche Optionen wählen!
- Berücksichtige ZUSÄTZLICHE Kosten: Bestuhlung (50k-200k AS$)
- Welches Modell bietet das beste Verhältnis aus Gewinn und erschwinglichen Gesamtkosten?
- Erste Woche Leasing ist kostenlos!
- Ab Woche 2: Wochenrate pro Flugzeug
- Berücksichtige Passagieranzahl für maximale Auslastung und Gewinne

ANTWORTE NUR MIT:
EMPFEHLUNG: [Exakter Flugzeugname]
ANZAHL: [Nummer]
GRUND: [Kurze präzise Begründung in 1-2 Sätzen]
SECURITY_DEPOSITS: [Gesamte Security Deposits in AS$]
WOCHENKOSTEN: [Wöchentliche Kosten ab Woche 2 in AS$]
        `;

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
