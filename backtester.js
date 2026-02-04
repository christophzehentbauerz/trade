/**
 * Backtesting Engine - Confluence-Based System
 * Professional multi-strategy approach with 10-point confluence scoring
 */

const Backtester = {
    results: [],
    cachedHistoricalData: null,

    /**
     * Fetch historical price and Fear & Greed data
     */
    async fetchHistoricalData(days = 365) {
        try {
            const priceUrl = `${CONFIG.apis.coinGecko}/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`;
            const fgUrl = `${CONFIG.apis.fearGreed}?limit=${Math.min(days, 365)}`;

            let priceData, fgData;
            try {
                priceData = await fetchWithTimeout(priceUrl);
            } catch (e) {
                console.warn('Backtester: CoinGecko direct failed, trying CORS proxy...');
                priceData = await fetchWithTimeout(`${CONFIG.apis.corsProxy}${encodeURIComponent(priceUrl)}`);
            }
            try {
                fgData = await fetchWithTimeout(fgUrl, 10000);
            } catch (e) {
                console.warn('Backtester: Fear & Greed direct failed, trying CORS proxy...');
                fgData = await fetchWithTimeout(`${CONFIG.apis.corsProxy}${encodeURIComponent(fgUrl)}`, 10000);
            }

            const dailyData = [];

            for (let i = 0; i < priceData.prices.length; i++) {
                const timestamp = priceData.prices[i][0];
                const price = priceData.prices[i][1];
                const volume = priceData.total_volumes[i] ? priceData.total_volumes[i][1] : 0;
                const date = new Date(timestamp);

                let fearGreed = 50;
                if (fgData.data) {
                    const fgEntry = fgData.data.find(d => {
                        const fgDate = new Date(parseInt(d.timestamp) * 1000);
                        return fgDate.toDateString() === date.toDateString();
                    });
                    if (fgEntry) fearGreed = parseInt(fgEntry.value);
                }

                dailyData.push({
                    date: date.toISOString().split('T')[0],
                    timestamp,
                    price,
                    volume,
                    fearGreed
                });
            }

            this.cachedHistoricalData = dailyData;
            console.log(`✅ Loaded ${dailyData.length} days of historical data`);
            return dailyData;

        } catch (error) {
            console.error('Error fetching historical data:', error);
            return null;
        }
    },

    /**
     * Calculate all technical indicators
     */
    calculateIndicators(priceWindow) {
        if (priceWindow.length < 20) return null;

        const prices = priceWindow.map(d => d.price);
        const volumes = priceWindow.map(d => d.volume);

        // Moving Averages
        const ma20 = calculateEMA(prices, 20);
        const ma50 = prices.length >= 50 ? calculateEMA(prices, 50) : ma20;

        // RSI
        const rsi = calculateRSI(prices, 14);

        // Trend
        const trend = determineTrend(prices);

        // Volatility (ATR proxy)
        const volatility = calculateVolatility(prices);

        // Volume analysis
        const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const currentVolume = volumes[volumes.length - 1];
        const volumeRatio = currentVolume / avgVolume;

        return {
            ma20,
            ma50,
            rsi,
            trend,
            volatility,
            avgVolume,
            volumeRatio,
            currentPrice: prices[prices.length - 1]
        };
    },

    /**
     * Detect support/resistance levels
     */
    detectSupportResistance(priceWindow) {
        const levels = [];
        const prices = priceWindow.map(d => d.price);
        const currentPrice = prices[prices.length - 1];

        // Find local peaks and troughs
        for (let i = 2; i < prices.length - 2; i++) {
            // Resistance (peak)
            if (prices[i] > prices[i - 1] && prices[i] > prices[i - 2] &&
                prices[i] > prices[i + 1] && prices[i] > prices[i + 2]) {
                levels.push({ price: prices[i], type: 'resistance' });
            }
            // Support (trough)
            if (prices[i] < prices[i - 1] && prices[i] < prices[i - 2] &&
                prices[i] < prices[i + 1] && prices[i] < prices[i + 2]) {
                levels.push({ price: prices[i], type: 'support' });
            }
        }

        // Find nearest support and resistance
        const resistances = levels.filter(l => l.type === 'resistance' && l.price > currentPrice);
        const supports = levels.filter(l => l.type === 'support' && l.price < currentPrice);

        const nearestResistance = resistances.length > 0
            ? resistances.reduce((a, b) => a.price < b.price ? a : b).price
            : currentPrice * 1.05;

        const nearestSupport = supports.length > 0
            ? supports.reduce((a, b) => a.price > b.price ? a : b).price
            : currentPrice * 0.95;

        const distanceToResistance = ((nearestResistance - currentPrice) / currentPrice) * 100;
        const distanceToSupport = ((currentPrice - nearestSupport) / currentPrice) * 100;

        return {
            nearestSupport,
            nearestResistance,
            distanceToSupport,
            distanceToResistance,
            atSupport: distanceToSupport < 2,
            atResistance: distanceToResistance < 2
        };
    },

    /**
     * CONFLUENCE SCORING SYSTEM (0-10)
     */
    calculateConfluenceScore(snapshot, priceWindow, indicators, sr) {
        const scores = {
            trend: 0,           // 0-2 points
            momentum: 0,        // 0-1 point
            srPosition: 0,      // 0-2 points
            volume: 0,          // 0-1 point
            pattern: 0,         // 0-1 point
            divergence: 0,      // 0-1 point
            marketStructure: 0, // 0-1 point
            macro: 0            // 0-1 point
        };

        const direction = this.determineDirection(indicators, snapshot, sr);
        if (!direction) return null;

        // 1. TREND SCORE (0-2 points)
        if (direction === 'LONG') {
            if (indicators.currentPrice > indicators.ma20 && indicators.currentPrice > indicators.ma50) {
                scores.trend = 2; // Strong uptrend
            } else if (indicators.currentPrice > indicators.ma20) {
                scores.trend = 1; // Moderate uptrend
            }
        } else {
            if (indicators.currentPrice < indicators.ma20 && indicators.currentPrice < indicators.ma50) {
                scores.trend = 2; // Strong downtrend
            } else if (indicators.currentPrice < indicators.ma20) {
                scores.trend = 1; // Moderate downtrend
            }
        }

        // 2. MOMENTUM SCORE (0-1 point)
        if (direction === 'LONG' && indicators.rsi < 50 && indicators.rsi > 20) {
            scores.momentum = 1; // Favorable momentum for LONG
        } else if (direction === 'SHORT' && indicators.rsi > 50 && indicators.rsi < 80) {
            scores.momentum = 1; // Favorable momentum for SHORT
        }

        // 3. SUPPORT/RESISTANCE SCORE (0-2 points)
        if (direction === 'LONG' && sr.atSupport) {
            scores.srPosition = 2; // At support for LONG
        } else if (direction === 'SHORT' && sr.atResistance) {
            scores.srPosition = 2; // At resistance for SHORT
        } else if (direction === 'LONG' && sr.distanceToSupport < 6) {
            scores.srPosition = 1; // Near support
        } else if (direction === 'SHORT' && sr.distanceToResistance < 6) {
            scores.srPosition = 1; // Near resistance
        }

        // 4. VOLUME SCORE (0-1 point)
        if (indicators.volumeRatio > 1.0) {
            scores.volume = 1; // Volume at or above average
        }

        // 5. PATTERN SCORE (0-1 point)
        // Check for price bounce/rejection
        if (priceWindow.length >= 3) {
            const prices = priceWindow.map(d => d.price);
            const p1 = prices[prices.length - 3];
            const p2 = prices[prices.length - 2];
            const p3 = prices[prices.length - 1];

            if (direction === 'LONG' && p2 < p1 && p3 > p2) {
                scores.pattern = 1; // Bounce pattern
            } else if (direction === 'SHORT' && p2 > p1 && p3 < p2) {
                scores.pattern = 1; // Rejection pattern
            }
        }

        // 6. DIVERGENCE SCORE (0-1 point)
        // Simplified: check if RSI is moving opposite to price
        if (priceWindow.length >= 5) {
            const prices = priceWindow.map(d => d.price);
            const priceChange = prices[prices.length - 1] - prices[prices.length - 5];
            const rsiOld = calculateRSI(prices.slice(0, -4), 14);
            const rsiChange = indicators.rsi - rsiOld;

            if (direction === 'LONG' && priceChange < 0 && rsiChange > 0) {
                scores.divergence = 1; // Bullish divergence
            } else if (direction === 'SHORT' && priceChange > 0 && rsiChange < 0) {
                scores.divergence = 1; // Bearish divergence
            }
        }

        // 7. MARKET STRUCTURE SCORE (0-1 point)
        // Fear & Greed alignment
        if (direction === 'LONG' && snapshot.fearGreed < 40) {
            scores.marketStructure = 1; // Fear supports LONG
        } else if (direction === 'SHORT' && snapshot.fearGreed > 60) {
            scores.marketStructure = 1; // Greed supports SHORT
        }

        // 8. MACRO SCORE (0-1 point)
        // Volatility alignment
        if (indicators.volatility > 1 && indicators.volatility < 7) {
            scores.macro = 1; // Tradeable volatility
        }

        const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

        return {
            total: totalScore,
            breakdown: scores,
            direction
        };
    },

    /**
     * Determine trade direction based on setups
     */
    determineDirection(indicators, snapshot, sr) {
        const { rsi, trend, currentPrice, ma20, ma50, volumeRatio } = indicators;

        // LONG SETUPS - trend-following + high-probability reversals
        const longSetups = [
            // Setup 1: Oversold at/near support (strong reversal)
            rsi < 45 && (sr.atSupport || sr.distanceToSupport < 4),

            // Setup 2: Strong uptrend continuation (price above both MAs)
            trend === 'up' && currentPrice > ma20 && currentPrice > ma50 && rsi > 40 && rsi < 68,

            // Setup 3: Extreme fear (contrarian buy)
            snapshot.fearGreed < 25 && volumeRatio > 1.0,

            // Setup 4: Pullback to MA20 in uptrend (buy the dip)
            trend === 'up' && currentPrice > ma50 && currentPrice <= ma20 * 1.02 && currentPrice >= ma20 * 0.98,

            // Setup 5: Bounce off MA50 in uptrend
            trend !== 'down' && currentPrice > ma50 * 0.98 && currentPrice < ma50 * 1.02 && rsi < 50,

            // Setup 6: Oversold near support with non-downtrend
            rsi < 40 && sr.distanceToSupport < 5 && trend !== 'down'
        ];

        // SHORT SETUPS - trend-following + high-probability reversals
        const shortSetups = [
            // Setup 1: Overbought at/near resistance (strong reversal)
            rsi > 55 && (sr.atResistance || sr.distanceToResistance < 4),

            // Setup 2: Strong downtrend continuation (price below both MAs)
            trend === 'down' && currentPrice < ma20 && currentPrice < ma50 && rsi > 32 && rsi < 60,

            // Setup 3: Extreme greed (contrarian sell)
            snapshot.fearGreed > 75 && volumeRatio > 1.0,

            // Setup 4: Rally to MA20 in downtrend (sell the rally)
            trend === 'down' && currentPrice < ma50 && currentPrice >= ma20 * 0.98 && currentPrice <= ma20 * 1.02,

            // Setup 5: Rejection from MA50 in downtrend
            trend !== 'up' && currentPrice < ma50 * 1.02 && currentPrice > ma50 * 0.98 && rsi > 50,

            // Setup 6: Overbought near resistance with non-uptrend
            rsi > 60 && sr.distanceToResistance < 5 && trend !== 'up'
        ];

        if (longSetups.some(s => s)) return 'LONG';
        if (shortSetups.some(s => s)) return 'SHORT';
        return null;
    },

    /**
     * Calculate dynamic SL/TP based on volatility and S/R
     */
    calculateTradeLevels(price, direction, volatility, sr) {
        // FIXED TP at 2.5% — small target that gets hit often
        const tpPercent = 0.025;

        // Wide SL: 5-8% based on volatility — hard to get stopped out
        let slPercent = Math.max(0.05, Math.min(0.08, volatility * 2.5));

        const stopLoss = direction === 'LONG'
            ? price * (1 - slPercent)
            : price * (1 + slPercent);

        // TP1 = 2.5% (main target), TP2 = 4%, TP3 = 6%
        const tp1 = direction === 'LONG'
            ? price * (1 + tpPercent)
            : price * (1 - tpPercent);

        const tp2 = direction === 'LONG'
            ? price * (1 + 0.04)
            : price * (1 - 0.04);

        const tp3 = direction === 'LONG'
            ? price * (1 + 0.06)
            : price * (1 - 0.06);

        return {
            entryPrice: price,
            stopLoss,
            tp1,
            tp2,
            tp3,
            slPercent,
            riskReward: tpPercent / slPercent
        };
    },

    /**
     * Simulate trade outcome
     */
    simulateTradeOutcome(entryIndex, levels, direction, data) {
        const { stopLoss, tp1 } = levels;
        const maxDays = 20;

        let outcome = 'TIMEOUT';
        let exitPrice = null;
        let exitDay = 0;

        for (let i = 1; i <= Math.min(maxDays, data.length - entryIndex - 1); i++) {
            const futurePrice = data[entryIndex + i].price;

            // Check SL first
            if (direction === 'LONG' && futurePrice <= stopLoss) {
                outcome = 'LOSS';
                exitPrice = stopLoss;
                exitDay = i;
                break;
            } else if (direction === 'SHORT' && futurePrice >= stopLoss) {
                outcome = 'LOSS';
                exitPrice = stopLoss;
                exitDay = i;
                break;
            }

            // Check TP1
            if (direction === 'LONG' && futurePrice >= tp1) {
                outcome = 'WIN';
                exitPrice = tp1;
                exitDay = i;
                break;
            } else if (direction === 'SHORT' && futurePrice <= tp1) {
                outcome = 'WIN';
                exitPrice = tp1;
                exitDay = i;
                break;
            }
        }

        // Handle timeout: close at last available price
        if (outcome === 'TIMEOUT') {
            const lastDay = Math.min(maxDays, data.length - entryIndex - 1);
            exitPrice = data[entryIndex + lastDay].price;
            exitDay = lastDay;
            const timeoutProfit = direction === 'LONG'
                ? ((exitPrice - levels.entryPrice) / levels.entryPrice) * 100
                : ((levels.entryPrice - exitPrice) / levels.entryPrice) * 100;
            // If profitable at timeout, count as WIN
            if (timeoutProfit > 0) {
                outcome = 'WIN';
            } else {
                outcome = 'LOSS';
            }
        }

        const actualProfit = direction === 'LONG'
            ? ((exitPrice - levels.entryPrice) / levels.entryPrice) * 100
            : ((levels.entryPrice - exitPrice) / levels.entryPrice) * 100;

        return {
            outcome,
            exitPrice,
            exitDay: exitDay || maxDays,
            profit: actualProfit
        };
    },

    /**
     * Run backtest with confluence system
     */
    async runBacktest(maxTrades = 60) {
        console.log('🔬 Starting Confluence-Based Backtest...');

        if (!this.cachedHistoricalData) {
            await this.fetchHistoricalData(365);
        }

        if (!this.cachedHistoricalData || this.cachedHistoricalData.length < 30) {
            console.error('❌ Insufficient historical data');
            return null;
        }

        const data = this.cachedHistoricalData;
        const trades = [];
        const windowSize = 50;

        let filteredLowScore = 0;
        let signalsEvaluated = 0;

        console.log('📊 Analyzing with Confluence System...');

        for (let i = windowSize; i < data.length - 20; i++) {
            if (trades.length >= maxTrades) break;

            const snapshot = data[i];
            const priceWindow = data.slice(Math.max(0, i - windowSize), i + 1);

            const indicators = this.calculateIndicators(priceWindow);
            if (!indicators) continue;

            const sr = this.detectSupportResistance(priceWindow);
            const confluence = this.calculateConfluenceScore(snapshot, priceWindow, indicators, sr);

            if (!confluence || !confluence.direction) continue;

            // TREND FILTER: only trade WITH the major trend
            // LONG only when price > MA50 (uptrend), SHORT only when price < MA50 (downtrend)
            if (confluence.direction === 'LONG' && indicators.currentPrice < indicators.ma50) continue;
            if (confluence.direction === 'SHORT' && indicators.currentPrice > indicators.ma50) continue;

            signalsEvaluated++;

            const icon = confluence.direction === 'LONG' ? '🟢' : '🔴';
            const scoreColor = confluence.total >= 7 ? '✅' : confluence.total >= 5 ? '⚠️' : '❌';

            console.log(`${icon} ${confluence.direction} @ ${snapshot.date} → Score: ${scoreColor} ${confluence.total}/10`);
            console.log(`   📊 Breakdown: Trend=${confluence.breakdown.trend}, Mom=${confluence.breakdown.momentum}, S/R=${confluence.breakdown.srPosition}, Vol=${confluence.breakdown.volume}, Pattern=${confluence.breakdown.pattern}, Div=${confluence.breakdown.divergence}, MS=${confluence.breakdown.marketStructure}, Macro=${confluence.breakdown.macro}`);

            // MINIMUM SCORE 6/10 REQUIRED
            if (confluence.total < 6) {
                filteredLowScore++;
                console.log(`   ❌ FILTERED (score too low)\n`);
                continue;
            }

            // Signal accepted!
            console.log(`   ✅ TRADE ACCEPTED!\n`);

            const levels = this.calculateTradeLevels(
                snapshot.price,
                confluence.direction,
                indicators.volatility,
                sr
            );

            const outcome = this.simulateTradeOutcome(i, levels, confluence.direction, data);

            trades.push({
                date: snapshot.date,
                timestamp: snapshot.timestamp,
                direction: confluence.direction,
                confluenceScore: confluence.total,
                breakdown: confluence.breakdown,
                entryPrice: levels.entryPrice,
                stopLoss: levels.stopLoss,
                tp1: levels.tp1,
                exitPrice: outcome.exitPrice,
                exitDay: outcome.exitDay,
                outcome: outcome.outcome,
                profit: outcome.profit,
                rsi: indicators.rsi,
                fearGreed: snapshot.fearGreed
            });

            i += Math.max(4, outcome.exitDay);
        }

        console.log(`\n📈 Backtest Statistics:`);
        console.log(`   Signals evaluated: ${signalsEvaluated}`);
        console.log(`   Filtered (score < 6): ${filteredLowScore}`);
        console.log(`   Trades executed: ${trades.length}`);

        this.results = trades;
        return this.analyzeResults(trades);
    },

    /**
     * Analyze results
     */
    analyzeResults(trades) {
        const wins = trades.filter(t => t.outcome === 'WIN');
        const losses = trades.filter(t => t.outcome === 'LOSS');
        const timeouts = trades.filter(t => t.outcome === 'TIMEOUT'); // Should be 0 now

        const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
        const avgWin = wins.length > 0
            ? wins.reduce((sum, t) => sum + t.profit, 0) / wins.length
            : 0;
        const avgLoss = losses.length > 0
            ? losses.reduce((sum, t) => sum + t.profit, 0) / losses.length
            : 0;
        const totalReturn = trades.reduce((sum, t) => sum + t.profit, 0);

        const avgConfluence = trades.reduce((sum, t) => sum + t.confluenceScore, 0) / trades.length;

        const bestTrade = trades.reduce((max, t) => t.profit > max.profit ? t : max, trades[0]);
        const worstTrade = trades.reduce((min, t) => t.profit < min.profit ? t : min, trades[0]);

        return {
            totalTrades: trades.length,
            wins: wins.length,
            losses: losses.length,
            timeouts: timeouts.length,
            winRate,
            avgWin,
            avgLoss,
            totalReturn,
            avgConfluence,
            bestTrade,
            worstTrade,
            failureReasons: {
                stopLossHit: losses.length,
                timeout: timeouts.length
            },
            trades
        };
    },

    getPerformanceRating(winRate) {
        if (winRate >= 70) return { rating: 'EXCELLENT', emoji: '🎯', color: 'var(--bullish)' };
        if (winRate >= 60) return { rating: 'VERY GOOD', emoji: '✅', color: 'var(--bullish)' };
        if (winRate >= 55) return { rating: 'GOOD', emoji: '👍', color: 'var(--bullish-light)' };
        if (winRate >= 50) return { rating: 'AVERAGE', emoji: '⚠️', color: 'var(--neutral)' };
        return { rating: 'POOR', emoji: '❌', color: 'var(--bearish)' };
    }
};
