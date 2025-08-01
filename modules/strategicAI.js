const aiService = require('../services/aiService');
const decisionLogger = require('../services/decisionLogger');
const AircraftManager = require('../ai_shit/aircraftManager');
const RouteManager = require('../ai_shit/routeManager');
const PricingManager = require('../ai_shit/pricingManager');

class StrategicAI {
    constructor() {
        this.aircraftManager = new AircraftManager();
        this.routeManager = new RouteManager();
        this.pricingManager = new PricingManager();
        this.isInitialized = false;
    }

    async initialize() {
        if (!this.isInitialized) {
            await this.aircraftManager.initialize();
            await this.routeManager.initialize();
            await this.pricingManager.initialize();
            this.isInitialized = true;
            console.log('Strategic AI initialized successfully');
        }
    }

    async cleanup() {
        if (this.isInitialized) {
            await this.aircraftManager.cleanup();
            await this.routeManager.cleanup();
            await this.pricingManager.cleanup();
            this.isInitialized = false;
        }
    }

    /**
     * Main strategic decision-making loop
     */
    async executeStrategicCycle(companyData) {
        await this.initialize();
        
        console.log('=== Starting Strategic AI Cycle ===');
        
        const results = {
            timestamp: new Date().toISOString(),
            decisions: [],
            performance: {},
            recommendations: []
        };

        try {
            // 1. Analyze current situation
            const situationAnalysis = await this.analyzeSituation();
            results.situationAnalysis = situationAnalysis;

            // 2. Fleet optimization
            console.log('📊 Analyzing fleet optimization...');
            const fleetAnalysis = await this.aircraftManager.optimizeFleet();
            results.decisions.push({
                category: 'fleet',
                analysis: fleetAnalysis,
                timestamp: new Date().toISOString()
            });

            // 3. Route analysis and optimization
            console.log('🛣️  Analyzing route network...');
            const routeOptimization = await this.routeManager.optimizeExistingRoutes();
            const routeProfitability = await this.routeManager.monitorRouteProfitability();
            results.decisions.push({
                category: 'routes',
                optimization: routeOptimization,
                profitability: routeProfitability,
                timestamp: new Date().toISOString()
            });

            // 4. Pricing optimization
            console.log('💰 Optimizing pricing strategy...');
            const pricingAnalysis = await this.pricingManager.monitorAndAdjustPricing();
            results.decisions.push({
                category: 'pricing',
                analysis: pricingAnalysis,
                timestamp: new Date().toISOString()
            });

            // 5. Strategic planning
            console.log('🎯 Developing strategic plan...');
            const strategicPlan = await this.developStrategicPlan(companyData, situationAnalysis);
            results.strategicPlan = strategicPlan;

            // 6. Execute high-priority decisions
            console.log('⚡ Executing high-priority decisions...');
            const executionResults = await this.executeDecisions(results.decisions);
            results.executionResults = executionResults;

            // 7. Generate summary report
            const report = decisionLogger.generateReport();
            results.report = report;

            console.log('=== Strategic AI Cycle Complete ===');
            return results;

        } catch (error) {
            console.error('Error in strategic cycle:', error);
            decisionLogger.logDecision(
                'strategy',
                'Strategic cycle failed',
                `Error occurred during strategic planning: ${error.message}`,
                { error: error.stack }
            );
            throw error;
        }
    }

    /**
     * Analyze current company situation
     */
    async analyzeSituation() {
        const currentFleet = await this.aircraftManager.getCurrentFleet();
        const currentRoutes = await this.routeManager.getCurrentRoutes();
        const currentPricing = await this.pricingManager.getCurrentPricing();
        
        const situation = {
            fleet: {
                size: currentFleet.length,
                utilization: this.calculateAverageUtilization(currentFleet),
                ageProfile: this.analyzeFleetAge(currentFleet)
            },
            network: {
                routeCount: currentRoutes.length,
                totalProfit: currentRoutes.reduce((sum, route) => sum + route.profit, 0),
                averageLoadFactor: this.calculateAverageLoadFactor(currentRoutes)
            },
            pricing: {
                routesPriced: currentPricing.length,
                averageYield: this.calculateAverageYield(currentPricing)
            }
        };

        // AI analysis of the situation
        const aiAnalysis = await aiService.analyzeMarket(
            situation,
            [], // Competitor data would be scraped here
            { growth: 'moderate', fuel_prices: 'stable', demand: 'seasonal' }
        );

        return {
            currentSituation: situation,
            aiAnalysis: aiAnalysis
        };
    }

    /**
     * Develop comprehensive strategic plan
     */
    async developStrategicPlan(companyData, situationAnalysis) {
        const goals = {
            shortTerm: [
                'Optimize existing routes',
                'Improve fleet utilization',
                'Maximize pricing efficiency'
            ],
            mediumTerm: [
                'Expand route network',
                'Modernize fleet',
                'Increase market share'
            ],
            longTerm: [
                'Establish hub dominance',
                'International expansion',
                'Brand recognition'
            ]
        };

        const marketTrends = {
            demand: 'increasing',
            competition: 'moderate',
            fuel_costs: 'stable',
            regulation: 'tightening'
        };

        const strategicPlan = await aiService.strategicPlanning(
            companyData,
            marketTrends,
            goals,
            '12 months'
        );

        return strategicPlan;
    }

    /**
     * Execute high-priority decisions automatically
     */
    async executeDecisions(decisions) {
        const executionResults = [];

        for (const decision of decisions) {
            if (decision.category === 'pricing' && decision.analysis.adjustmentsRecommended > 0) {
                // Execute pricing adjustments
                for (const adjustment of decision.analysis.adjustments.slice(0, 3)) { // Limit to 3 adjustments
                    try {
                        const result = await this.executePricingAdjustment(adjustment);
                        executionResults.push(result);
                    } catch (error) {
                        console.error('Error executing pricing adjustment:', error);
                    }
                }
            }

            if (decision.category === 'routes' && decision.profitability.unprofitableRoutes > 0) {
                // Analyze unprofitable routes for potential adjustments
                const unprofitableRoutes = decision.profitability.routeDetails
                    .filter(route => route.status === 'unprofitable')
                    .slice(0, 2); // Limit to 2 routes

                for (const route of unprofitableRoutes) {
                    try {
                        const result = await this.analyzeUnprofitableRoute(route);
                        executionResults.push(result);
                    } catch (error) {
                        console.error('Error analyzing unprofitable route:', error);
                    }
                }
            }
        }

        return executionResults;
    }

    /**
     * Execute pricing adjustment
     */
    async executePricingAdjustment(adjustment) {
        const route = adjustment.route;
        const recommendation = adjustment.recommendedAction;
        
        // Parse AI recommendation to extract new pricing
        const priceMatch = recommendation.match(/PRICE: ([\d.]+)/);
        const newPrice = priceMatch ? parseFloat(priceMatch[1]) : null;
        
        if (newPrice) {
            const result = await this.pricingManager.implementDynamicPricing(route, {
                economy: newPrice,
                business: newPrice * 1.5,
                first: newPrice * 2.5
            });
            
            return {
                type: 'pricing_adjustment',
                route: route,
                success: result.success,
                details: result
            };
        }
        
        return { type: 'pricing_adjustment', route: route, success: false, reason: 'Unable to parse price recommendation' };
    }

    /**
     * Analyze unprofitable route for improvement opportunities
     */
    async analyzeUnprofitableRoute(routeData) {
        const [origin, destination] = routeData.route.split('-');
        
        // Get market analysis for the route
        const marketData = await this.routeManager.analyzeMarketDemand(origin, destination);
        const competitors = await this.routeManager.getCompetitorAnalysis(origin, destination);
        
        // AI analysis for route improvement
        const improvement = await aiService.optimizePricing(
            { from: origin, to: destination },
            100, // Current price estimate
            marketData,
            competitors,
            { fuel: 5000, crew: 2000, maintenance: 1500 }
        );
        
        decisionLogger.logDecision(
            'route',
            `Analyzed unprofitable route ${routeData.route}`,
            improvement.recommendation || 'Route analysis completed',
            { routeData, marketData, improvement }
        );
        
        return {
            type: 'route_analysis',
            route: routeData.route,
            marketData,
            improvement,
            success: true
        };
    }

    /**
     * Run autonomous airline management
     */
    async runAutonomous(companyData, cycleIntervalMinutes = 60) {
        console.log(`🤖 Starting autonomous airline management (${cycleIntervalMinutes}min cycles)`);
        
        let cycleCount = 0;
        
        const runCycle = async () => {
            try {
                cycleCount++;
                console.log(`\n🔄 Autonomous Cycle #${cycleCount} - ${new Date().toLocaleString()}`);
                
                const results = await this.executeStrategicCycle(companyData);
                
                console.log(`✅ Cycle #${cycleCount} completed successfully`);
                console.log(`📊 Decisions made: ${results.decisions.length}`);
                console.log(`⚡ Actions executed: ${results.executionResults?.length || 0}`);
                
                // Log cycle summary
                decisionLogger.logDecision(
                    'strategy',
                    `Autonomous cycle #${cycleCount} completed`,
                    `Executed strategic analysis and made ${results.decisions.length} decisions`,
                    { cycleNumber: cycleCount, results: results.report }
                );
                
            } catch (error) {
                console.error(`❌ Cycle #${cycleCount} failed:`, error);
            }
        };
        
        // Run first cycle immediately
        await runCycle();
        
        // Schedule subsequent cycles
        const interval = setInterval(runCycle, cycleIntervalMinutes * 60 * 1000);
        
        // Return control function
        return {
            stop: () => {
                clearInterval(interval);
                console.log('🛑 Autonomous management stopped');
            },
            getCycleCount: () => cycleCount,
            runCycleNow: runCycle
        };
    }

    // Helper methods
    calculateAverageUtilization(fleet) {
        if (fleet.length === 0) return 0;
        const totalUtilization = fleet.reduce((sum, aircraft) => sum + (parseFloat(aircraft.utilization) || 0), 0);
        return totalUtilization / fleet.length;
    }

    analyzeFleetAge(fleet) {
        return {
            averageAge: fleet.length > 0 ? 
                fleet.reduce((sum, aircraft) => sum + (parseInt(aircraft.age) || 0), 0) / fleet.length : 0,
            oldAircraft: fleet.filter(aircraft => parseInt(aircraft.age) > 15).length
        };
    }

    calculateAverageLoadFactor(routes) {
        if (routes.length === 0) return 0;
        const totalLoadFactor = routes.reduce((sum, route) => sum + route.loadFactor, 0);
        return totalLoadFactor / routes.length;
    }

    calculateAverageYield(pricing) {
        if (pricing.length === 0) return 0;
        const totalYield = pricing.reduce((sum, price) => sum + price.yield, 0);
        return totalYield / pricing.length;
    }
}

module.exports = StrategicAI;
