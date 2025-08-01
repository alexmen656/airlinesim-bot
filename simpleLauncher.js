const { exec } = require('child_process');
const SimpleAircraftManager = require('./modules/simpleAircraftManager');
const decisionLogger = require('./services/decisionLogger');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to run a script
const runScript = (scriptPath) => {
    return new Promise((resolve, reject) => {
        const process = exec(`node ${scriptPath}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing ${scriptPath}:`, error);
                reject(error);
            } else {
                console.log(`Output from ${scriptPath}:\n`, stdout);
                resolve(stdout);
            }
        });

        process.stdout.on('data', (data) => {
            console.log(`[${scriptPath}]`, data.toString());
        });

        process.stderr.on('data', (data) => {
            console.error(`[${scriptPath} ERROR]`, data.toString());
        });
    });
};

(async () => {
    try {
        console.log('🚀 AirlineSim Simple AI Bot Starting...');
        console.log('=====================================');
        
        // Step 1: Login (immer ausführen, um sicherzustellen, dass Cookies aktuell sind)
        console.log('🔐 Step 1: Ensuring login...');
        
        const fs = require('fs');
        const cookiesExist = fs.existsSync('cookies.json');
        
        if (!cookiesExist) {
            console.log('   No cookies found - running login automation...');
            await runScript('./modules/loginAutomation.js');
            await sleep(5000);
        } else {
            console.log('   Cookies found - verifying session...');
            // Login wird in SimpleAircraftManager überprüft
        }

        // Step 2: Create airline if needed (optional)
        if (process.argv.includes('--create-airline')) {
            console.log('🏢 Step 2: Creating new airline...');
            await runScript('./modules/fillEnterpriseForm.js');
            await sleep(10000);
        } else {
            console.log('⏭️  Step 2: Skipping airline creation (use --create-airline flag if needed)');
        }

        // Step 3: Simple Aircraft Management
        console.log('✈️ Step 3: Smart Aircraft Management...');
        const aircraftManager = new SimpleAircraftManager();
        const result = await aircraftManager.manageFleet();
        
        console.log('\n📊 AIRCRAFT MANAGEMENT RESULT:');
        console.log('Action taken:', result.action);
        
        if (result.recommendation) {
            console.log('\n🎯 AI RECOMMENDATION:');
            console.log(`   Aircraft: ${result.recommendation.model}`);
            console.log(`   Quantity: ${result.recommendation.quantity}`);
            console.log(`   Total Cost: ${result.recommendation.totalCost.toLocaleString()} AS$`);
            console.log(`   Reasoning: ${result.recommendation.reasoning}`);
        }

        // Step 4: Show decision log
        console.log('\n📋 DECISION LOG:');
        const recentDecisions = decisionLogger.getRecentDecisions(1);
        recentDecisions.forEach((decision, i) => {
            console.log(`   ${i+1}. [${decision.category.toUpperCase()}] ${decision.decision}`);
            console.log(`      Time: ${new Date(decision.timestamp).toLocaleString()}`);
            console.log(`      Reasoning: ${decision.reasoning.substring(0, 100)}...`);
            console.log('');
        });

        // Step 5: Analytics
        const analytics = decisionLogger.getDecisionAnalytics();
        console.log('📈 ANALYTICS:');
        console.log(`   Total decisions made: ${analytics.totalDecisions}`);
        console.log(`   Success rate: ${analytics.totalDecisions > 0 ? ((analytics.successfulDecisions / analytics.totalDecisions) * 100).toFixed(1) : 0}%`);
        console.log(`   Categories: ${Object.keys(analytics.categoryCounts).join(', ')}`);

        console.log('\n✅ Simple AI Bot completed successfully!');
        
        console.log('\n💡 NEXT STEPS:');
        console.log('   • Check logs/decisions.json for detailed decision log');
        console.log('   • Run with --create-airline to create new airline first');
        console.log('   • Modify AI prompts in simpleAircraftManager.js for different strategies');
        console.log('   • Add route management and pricing optimization modules');

    } catch (error) {
        console.error('❌ Simple AI Bot failed:', error);
        
        decisionLogger.logDecision(
            'system',
            'Bot execution failed',
            `Error occurred: ${error.message}`,
            { error: error.stack }
        );
    }
})();
