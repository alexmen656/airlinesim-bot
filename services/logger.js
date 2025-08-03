const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '..', 'logs');
        this.logFile = path.join(this.logDir, 'app.log');
        
        // Erstelle logs Ordner falls nicht vorhanden
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
        
        // Überschreibe die globale console.log Funktion
        this.originalConsoleLog = console.log;
        console.log = this.customLog.bind(this);
    }

    customLog(...args) {
        const timestamp = new Date().toISOString();
        const message = args.slice(0, -1).map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        
        // Prüfe ob der letzte Parameter true ist
        const shouldShowInConsole = args[args.length - 1] === true;
        
        // Entferne das true aus der Nachricht wenn es der letzte Parameter ist
        const logMessage = shouldShowInConsole ? 
            args.slice(0, -1).map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ') : 
            args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');

        const logEntry = `[${timestamp}] ${logMessage}\n`;

        // Schreibe immer in die Log-Datei
        try {
            fs.appendFileSync(this.logFile, logEntry);
        } catch (error) {
            this.originalConsoleLog('Logger Error:', error);
        }

        // Zeige in Konsole nur wenn explizit true übergeben wurde
        if (shouldShowInConsole) {
            this.originalConsoleLog(...args.slice(0, -1));
        }
    }

    // Hilfsfunktionen für direktes Logging
    logToConsole(...args) {
        this.originalConsoleLog(...args);
    }

    logToFileOnly(...args) {
        const timestamp = new Date().toISOString();
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        const logEntry = `[${timestamp}] ${message}\n`;
        
        try {
            fs.appendFileSync(this.logFile, logEntry);
        } catch (error) {
            this.originalConsoleLog('Logger Error:', error);
        }
    }

    // Restore original console.log
    restore() {
        console.log = this.originalConsoleLog;
    }
}

// Singleton Pattern
let loggerInstance = null;

function initLogger() {
    if (!loggerInstance) {
        loggerInstance = new Logger();
    }
    return loggerInstance;
}

// Automatisch initialisieren beim ersten Require
initLogger();

module.exports = { Logger, initLogger };
