const SimpleAircraftManager = require('./modules/simpleAircraftManager');

async function testLeasingSystem() {
    console.log('🧪 Testing Complete Leasing System...\n');
    
    let aircraftManager = null;
    
    try {
        console.log('=== Test: Full Aircraft Leasing Analysis ===');
        aircraftManager = new SimpleAircraftManager();
        
        // Run the complete fleet management
        const result = await aircraftManager.manageFleet();
        
        console.log('\n✅ Fleet Management completed!');
        console.log('Result:', result.action);
        
        if (result.recommendation) {
            const rec = result.recommendation;
            console.log('\n📊 LEASING SUMMARY:');
            console.log(`Aircraft: ${rec.model} x${rec.quantity}`);
            console.log(`Security Deposit Total: ${rec.totalSecurityDeposit.toLocaleString()} AS$`);
            console.log(`Weekly Rate Total: ${rec.weeklyRateCost.toLocaleString()} AS$/week`);
            console.log(`Can Afford: ${rec.balanceCheck?.canAfford ? 'YES' : 'NO'}`);
        }
        
        console.log('\n🎉 Leasing System test completed successfully!');
        
    } catch (error) {
        console.error('❌ Leasing System test failed:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

// Quick test to just see available aircraft
async function testQuickScan() {
    console.log('🔍 Quick Scan: All Aircraft Families...\n');
    
    let aircraftManager = null;
    
    try {
        aircraftManager = new SimpleAircraftManager();
        await aircraftManager.initialize();
        
        // Show cache info first
        const cacheInfo = await aircraftManager.getCacheInfo();
        console.log('📋 Cache Info:', cacheInfo);
        console.log('');
        
        // Just get available aircraft
        const aircraft = await aircraftManager.getAvailableAircraft();
        
        console.log('\n📊 TOP 10 CHEAPEST LEASING OPTIONS:');
        aircraft.slice(0, 10).forEach((plane, i) => {
            console.log(`${i+1}. ${plane.model} (${plane.family})`);
            console.log(`   Security Deposit: ${plane.securityDeposit.toLocaleString()} AS$`);
            console.log(`   Weekly Rate: ${plane.weeklyRate.toLocaleString()} AS$`);
            console.log(`   Passengers: ${plane.passengers}`);
            console.log('');
        });
        
        console.log('✅ Quick scan completed!');
        
    } catch (error) {
        console.error('❌ Quick scan failed:', error.message);
    } finally {
        if (aircraftManager) {
            await aircraftManager.cleanup();
        }
    }
}

// Test cache functionality
async function testCache() {
    console.log('🧪 Testing Aircraft Cache System...\n');
    
    let aircraftManager = null;
    
    try {
        aircraftManager = new SimpleAircraftManager();
        await aircraftManager.initialize();
        
        console.log('=== Test 1: Cache Info ===');
        let cacheInfo = await aircraftManager.getCacheInfo();
        console.log('Cache Info:', cacheInfo);
        console.log('');
        
        console.log('=== Test 2: Load Aircraft (should use cache if available) ===');
        const startTime1 = Date.now();
        const aircraft1 = await aircraftManager.getAvailableAircraft();
        const loadTime1 = Date.now() - startTime1;
        console.log(`Loaded ${aircraft1.length} aircraft in ${loadTime1}ms`);
        console.log('');
        
        console.log('=== Test 3: Load Aircraft again (should be much faster from cache) ===');
        const startTime2 = Date.now();
        const aircraft2 = await aircraftManager.getAvailableAircraft();
        const loadTime2 = Date.now() - startTime2;
        console.log(`Loaded ${aircraft2.length} aircraft in ${loadTime2}ms`);
        console.log(`Speed improvement: ${Math.round(loadTime1 / loadTime2)}x faster`);
        console.log('');
        
        console.log('=== Test 4: Updated Cache Info ===');
        cacheInfo = await aircraftManager.getCacheInfo();
        console.log('Updated Cache Info:', cacheInfo);
        console.log('');
        
        console.log('=== Test 5: Force Refresh (ignore cache) ===');
        console.log('This will take longer as it fetches fresh data...');
        const startTime3 = Date.now();
        const aircraft3 = await aircraftManager.getAvailableAircraft(true); // forceRefresh=true
        const loadTime3 = Date.now() - startTime3;
        console.log(`Force refresh: ${aircraft3.length} aircraft in ${loadTime3}ms`);
        console.log('');
        
        console.log('✅ Cache system test completed!');
        
    } catch (error) {
        console.error('❌ Cache test failed:', error.message);
    } finally {
        if (aircraftManager) {
            await aircraftManager.cleanup();
        }
    }
}

// Clear cache
async function clearCache() {
    console.log('🗑️ Clearing Aircraft Cache...\n');
    
    const aircraftManager = new SimpleAircraftManager();
    const cleared = await aircraftManager.clearAircraftCache();
    
    if (cleared) {
        console.log('✅ Cache cleared successfully!');
    } else {
        console.log('ℹ️ No cache found to clear.');
    }
}

// Run based on command line arguments
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--quick')) {
        testQuickScan();
    } else if (args.includes('--cache')) {
        testCache();
    } else if (args.includes('--clear-cache')) {
        clearCache();
    } else {
        testLeasingSystem();
    }
}

module.exports = { testLeasingSystem, testQuickScan, testCache, clearCache };
