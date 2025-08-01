const fs = require('fs');

class AuthService {
    constructor() {
        this.cookiesPath = 'cookies.json';
    }

    /**
     * Universelle Login-Status-Prüfung die für jede Airline funktioniert
     */
    async checkLoginStatus(page) {
        console.log('🔐 Überprüfe Login-Status...');
        
        try {
            // Teste mehrere geschützte Seiten
            const testUrls = [
                'https://free2.airlinesim.aero/app/enterprise/dashboard',
                'https://free2.airlinesim.aero/app/fleets'
            ];

            for (const url of testUrls) {
                await page.goto(url, { waitUntil: 'networkidle0', timeout: 10000 });
                
                const loginStatus = await page.evaluate(() => {
                    // Eindeutige Login-Indikatoren
                    const loginIndicators = [
                        // Login-Formular vorhanden
                        document.querySelector('input[type="email"]'),
                        document.querySelector('input[type="password"]'),
                        document.querySelector('form[action*="login"]'),
                        // Login-spezifische Texte
                        document.body.textContent.includes('Please log in'),
                        document.body.textContent.includes('Login'),
                        document.body.textContent.includes('Sign in'),
                        document.body.textContent.includes('Email'),
                        document.body.textContent.includes('Password'),
                        // URL enthält login
                        window.location.href.includes('login'),
                        window.location.href.includes('auth')
                    ];

                    // Eindeutige Dashboard-Indikatoren (airline-unabhängig)
                    const dashboardIndicators = [
                        // AirlineSim-spezifische UI-Elemente
                        document.querySelector('.navbar .balance'), // Balance-Anzeige
                        document.querySelector('.as-navbar-main'), // Haupt-Navigation
                        document.querySelector('a[href*="enterprise/dashboard"]'), // Dashboard-Link
                        document.querySelector('a[href*="fleets"]'), // Fleet-Link
                        document.querySelector('a[href*="aircraft"]'), // Aircraft-Link
                        // Geld-Symbole (AS$ Currency)
                        document.body.textContent.includes('AS$'),
                        document.body.textContent.includes('Credits'),
                        // Typische Menu-Items
                        document.body.textContent.includes('Commercial'),
                        document.body.textContent.includes('Operations'),
                        document.body.textContent.includes('Management'),
                        // Footer-Elemente
                        document.querySelector('.as-footer-line')
                    ];

                    const hasLoginElements = loginIndicators.some(indicator => indicator);
                    const hasDashboardElements = dashboardIndicators.some(indicator => indicator);

                    return {
                        isLoggedIn: !hasLoginElements && hasDashboardElements,
                        hasLoginElements,
                        hasDashboardElements,
                        url: window.location.href,
                        title: document.title
                    };
                });

                console.log(`📊 Status für ${url}:`, {
                    isLoggedIn: loginStatus.isLoggedIn,
                    hasLoginElements: loginStatus.hasLoginElements,
                    hasDashboardElements: loginStatus.hasDashboardElements,
                    currentUrl: loginStatus.url,
                    title: loginStatus.title
                });

                if (loginStatus.isLoggedIn) {
                    console.log('✅ Erfolgreich eingeloggt');
                    return true;
                }
            }

            console.log('❌ Nicht eingeloggt');
            return false;

        } catch (error) {
            console.error('❌ Login-Status-Prüfung fehlgeschlagen:', error.message);
            return false;
        }
    }

    /**
     * Prüft ob Cookie-Datei existiert und nicht zu alt ist
     */
    cookiesExist() {
        if (!fs.existsSync(this.cookiesPath)) {
            return false;
        }

        try {
            const stats = fs.statSync(this.cookiesPath);
            const fileAge = Date.now() - stats.mtime.getTime();
            const maxAge = 24 * 60 * 60 * 1000; // 24 Stunden

            if (fileAge > maxAge) {
                console.log('⚠️ Cookies sind älter als 24 Stunden');
                return false;
            }

            return true;
        } catch (error) {
            console.error('Fehler beim Prüfen der Cookie-Datei:', error);
            return false;
        }
    }

    /**
     * Extrahiert Airline-Name aus der aktuellen Seite (generisch)
     */
    async getAirlineName(page) {
        try {
            const airlineName = await page.evaluate(() => {
                // Verschiedene Selektoren für Airline-Namen
                const selectors = [
                    '.navbar .dropdown .name', // Haupt-Airline-Name im Navbar
                    '.as-navbar-main .dropdown-toggle', // Alternative
                    'a[href*="enterprise/dashboard"]', // Dashboard-Link
                    '.enterprise-name', // Falls vorhanden
                    '.navbar-brand + .navbar-nav .dropdown-toggle' // Navbar-Position
                ];

                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element && element.textContent.trim()) {
                        const text = element.textContent.trim();
                        // Filtere Caret-Symbole und andere UI-Elemente heraus
                        return text.replace(/\s*▼\s*$/, '').replace(/\s*\u25BC\s*$/, '').trim();
                    }
                }

                return null;
            });

            return airlineName;
        } catch (error) {
            console.error('Fehler beim Extrahieren des Airline-Namens:', error);
            return null;
        }
    }

    /**
     * Vollständige Login-Validierung mit Airline-Info
     */
    async validateLogin(page) {
        const isLoggedIn = await this.checkLoginStatus(page);
        
        if (!isLoggedIn) {
            throw new Error('Login-Validierung fehlgeschlagen. Bitte führe zuerst "node modules/loginAutomation.js" aus.');
        }

        const airlineName = await this.getAirlineName(page);
        console.log(`✈️ Eingeloggt als: ${airlineName || 'Unbekannte Airline'}`);
        
        return {
            isLoggedIn: true,
            airlineName: airlineName
        };
    }
}

module.exports = new AuthService();
