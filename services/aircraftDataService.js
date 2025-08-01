const fs = require('fs').promises;
const path = require('path');

class AircraftDataService {
    constructor() {
        this.aircraftCacheFile = path.join(__dirname, '..', 'data', 'aircraft_cache.json');
        this.familyCacheFile = path.join(__dirname, '..', 'data', 'aircraft_families_cache.json');
        this.cacheValidityHours = 72; // Cache für 72 Stunden
        this.familyCacheValidityHours = 168; // Familien-Cache für 1 Woche (ändern sich selten)
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
     * Prüft ob der Familien-Cache noch gültig ist
     */
    async isFamilyCacheValid() {
        try {
            const cacheData = await fs.readFile(this.familyCacheFile, 'utf8');
            const cache = JSON.parse(cacheData);
            
            const cacheTime = new Date(cache.timestamp);
            const now = new Date();
            const hoursSinceCache = (now - cacheTime) / (1000 * 60 * 60);
            
            const isValid = hoursSinceCache < this.familyCacheValidityHours;
            
            if (isValid) {
                console.log(`📋 Familien-Cache ist gültig (${hoursSinceCache.toFixed(1)}h alt, max ${this.familyCacheValidityHours}h)`);
            } else {
                console.log(`📋 Familien-Cache ist abgelaufen (${hoursSinceCache.toFixed(1)}h alt, max ${this.familyCacheValidityHours}h)`);
            }
            
            return {
                isValid,
                age: hoursSinceCache,
                data: cache.families || []
            };
            
        } catch (error) {
            console.log('📋 Kein Familien-Cache gefunden, erstelle neuen Cache');
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
     * Speichert Familien-Daten im Cache
     */
    async saveFamilyCache(familiesData) {
        try {
            const cache = {
                timestamp: new Date().toISOString(),
                totalFamilies: familiesData.length,
                families: familiesData,
                cacheValidityHours: this.familyCacheValidityHours
            };
            
            // Ensure data directory exists
            const dataDir = path.dirname(this.familyCacheFile);
            await fs.mkdir(dataDir, { recursive: true });
            
            await fs.writeFile(this.familyCacheFile, JSON.stringify(cache, null, 2));
            
            console.log(`💾 Familien-Cache gespeichert: ${familiesData.length} Familien`);
            
        } catch (error) {
            console.warn('⚠️ Fehler beim Speichern des Familien-Cache:', error.message);
        }
    }

    /**
     * Lädt alle verfügbaren Flugzeugfamilien dynamisch von der Manufacturers-Seite
     */
    async getAllAircraftFamilies(page, forceRefresh = false) {
        // Prüfe Cache, außer wenn forceRefresh=true
        if (!forceRefresh) {
            const cacheStatus = await this.isFamilyCacheValid();
            if (cacheStatus.isValid && cacheStatus.data.length > 0) {
                console.log(`✅ Verwende cached Familien-Daten (${cacheStatus.data.length} Familien)`);
                return cacheStatus.data;
            }
        }

        console.log('🔍 Lade alle Flugzeugfamilien von Manufacturers-Seite...');
        
        await page.goto('https://free2.airlinesim.aero/app/aircraft/manufacturers', {
            waitUntil: 'networkidle2',
            timeout: 15000
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000));

        const families = await page.evaluate(() => {
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
        
        // Speichere im Cache
        await this.saveFamilyCache(families);
        
        return families;
    }

    /**
     * Lädt Flugzeuge einer spezifischen Familie
     */
    async getAircraftFromFamily(page, family) {
        console.log(`  📋 Scanne Familie: ${family.name}`);
        
        await page.goto(`https://free2.airlinesim.aero/action/enterprise/aircraftsFamily?id=${family.id}`, {
            waitUntil: 'networkidle2',
            timeout: 15000
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000));

        const familyAircraft = await page.evaluate((familyName) => {
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

        console.log(`    ✅ ${familyAircraft.length} Flugzeuge gefunden in ${family.name}`);
        return familyAircraft;
    }

    /**
     * Scrapt verfügbare Flugzeuge von ALLEN Familien mit Leasing-Berechnung und Caching
     */
    async getAvailableAircraft(page, forceRefresh = false) {
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
        const aircraftFamilies = await this.getAllAircraftFamilies(page);
        let allAircraft = [];

        for (const family of aircraftFamilies) {
            try {
                const familyAircraft = await this.getAircraftFromFamily(page, family);
                allAircraft = [...allAircraft, ...familyAircraft];

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
     * Gruppiert Flugzeuge nach Familien für AI-Analyse
     */
    groupAircraftByFamily(aircraftList) {
        const familyGroups = {};
        
        aircraftList.forEach(aircraft => {
            if (!familyGroups[aircraft.family]) {
                familyGroups[aircraft.family] = {
                    name: aircraft.family,
                    aircraft: [],
                    minSecurityDeposit: Infinity,
                    maxSecurityDeposit: 0,
                    minPassengers: Infinity,
                    maxPassengers: 0,
                    totalModels: 0
                };
            }
            
            const group = familyGroups[aircraft.family];
            group.aircraft.push(aircraft);
            group.minSecurityDeposit = Math.min(group.minSecurityDeposit, aircraft.securityDeposit);
            group.maxSecurityDeposit = Math.max(group.maxSecurityDeposit, aircraft.securityDeposit);
            group.minPassengers = Math.min(group.minPassengers, aircraft.passengers);
            group.maxPassengers = Math.max(group.maxPassengers, aircraft.passengers);
            group.totalModels++;
        });
        
        return Object.values(familyGroups);
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
     * Löscht den Familien-Cache
     */
    async clearFamilyCache() {
        try {
            await fs.unlink(this.familyCacheFile);
            console.log('🗑️ Familien-Cache gelöscht');
            return true;
        } catch (error) {
            console.log('🗑️ Kein Familien-Cache zum Löschen gefunden');
            return false;
        }
    }

    /**
     * Löscht alle Caches
     */
    async clearAllCaches() {
        const aircraft = await this.clearAircraftCache();
        const families = await this.clearFamilyCache();
        return { aircraft, families };
    }

    /**
     * Zeigt Cache-Statistiken an
     */
    async getCacheInfo() {
        try {
            const aircraftCache = await this.isCacheValid();
            const familyCache = await this.isFamilyCacheValid();
            
            return {
                aircraft: {
                    exists: true,
                    isValid: aircraftCache.isValid,
                    ageHours: aircraftCache.age,
                    maxAgeHours: this.cacheValidityHours,
                    count: aircraftCache.data.length,
                    cacheFile: this.aircraftCacheFile
                },
                families: {
                    exists: true,
                    isValid: familyCache.isValid,
                    ageHours: familyCache.age,
                    maxAgeHours: this.familyCacheValidityHours,
                    count: familyCache.data.length,
                    cacheFile: this.familyCacheFile
                }
            };
        } catch (error) {
            return {
                aircraft: {
                    exists: false,
                    isValid: false,
                    ageHours: 0,
                    maxAgeHours: this.cacheValidityHours,
                    count: 0,
                    cacheFile: this.aircraftCacheFile
                },
                families: {
                    exists: false,
                    isValid: false,
                    ageHours: 0,
                    maxAgeHours: this.familyCacheValidityHours,
                    count: 0,
                    cacheFile: this.familyCacheFile
                }
            };
        }
    }
}

module.exports = AircraftDataService;
