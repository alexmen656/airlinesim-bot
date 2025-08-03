const IntegratedAirlineManager = require('./modules/integratedAirlineManager');
const decisionLogger = require('./services/decisionLogger');
// Logger wird automatisch initialisiert beim Require
require('./services/logger');

async function runIntegratedAirlineBot() {
    console.log('Starting Integrated AirlineSim Bot', true); // Zeigt in Konsole
    console.log('====================================================', true); // Zeigt in Konsole
    
    try {
        const manager = new IntegratedAirlineManager();
        const result = await manager.manageAirline();
        
        console.log('📊 INTEGRATED AIRLINE MANAGEMENT SUMMARY:');
        console.log(`   Action taken: ${result.action}`);
        
        if (result.aircraftResult?.recommendation) {
            console.log('\n✈️ AIRCRAFT RECOMMENDATION:');
            console.log(`   Aircraft: ${result.aircraftResult.recommendation.model}`);
            console.log(`   Quantity: ${result.aircraftResult.recommendation.quantity}`);
            console.log(`   Total Cost: ${result.aircraftResult.recommendation.totalSecurityDeposit.toLocaleString()} AS$`);
            console.log(`   Reasoning: ${result.aircraftResult.recommendation.reasoning}`);
        }
        
        if (result.stationResult?.selectedStation) {
            console.log('\n🏢 STATION RECOMMENDATION:');
            console.log(`   Station: ${result.stationResult.selectedStation.name} (${result.stationResult.selectedStation.code}), ${result.stationResult.selectedStation.country}`);
            console.log(`   Route: ${result.stationResult.selectedStation.route}`);
            console.log(`   Expected Passengers: ${result.stationResult.selectedStation.expectedPassengers}/day`);
            console.log(`   Reasoning: ${result.stationResult.selectedStation.reasoning}`);
        }
        
        if (result.totalCosts) {
            console.log('\n💰 TOTAL INVESTMENT:');
            console.log(`   Initial costs: ${result.totalCosts.initial.toLocaleString()} AS$`);
            console.log(`   Weekly costs: ${result.totalCosts.weekly.toLocaleString()} AS$/week`);
        }
        
        const analytics = decisionLogger.getAnalytics();
        console.log('📈 ANALYTICS:');
        console.log(`   Total decisions made: ${analytics.totalDecisions}`);
        console.log(`   Success rate: ${(analytics.successRate * 100).toFixed(1)}%`);
        console.log(`   Categories: ${analytics.categories.join(', ')}`);
        console.log('\n✅ Integrated AI Bot completed successfully!');
        
        return result;
        
    } catch (error) {
        console.error('\n❌ Bot execution failed:', error.message);
        
        decisionLogger.logDecision(
            'system',
            'Integrated bot execution failed',
            `Error occurred: ${error.message}`,
            { error: error.stack }
        );
        
        throw error;
    }
}

if (require.main === module) {
    runIntegratedAirlineBot()
        .then(() => {
            console.log('\n🎉 Integrated bot execution completed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Integrated bot execution failed:', error);
            process.exit(1);
        });
}

module.exports = { runIntegratedAirlineBot };