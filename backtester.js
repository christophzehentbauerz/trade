/**
 * Backtesting Engine - Weighted Score System
 * Uses the SAME scoring logic as the live dashboard (app.js)
 * Ensures backtest results reflect actual live strategy performance
 *
 * Scoring: Technical 35%, Momentum 25%, Sentiment 20%, Macro 20%
 * Thresholds: LONG >= 6.5, SHORT <= 3.5
 * Trade Levels: SL 6%, TP1 4%, TP2 8%, TP3 12%
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
            let runningATH = 0;

            for (let i = 0; i < priceData.prices.length; i++) {
                const timestamp = priceData.prices[i][0];
                const price = priceData.prices[i][1];
                const volume = priceData.total_volumes[i] ? priceData.total_volumes[i][1] : 0;
                const date = new Date(timestamp);

                if (price > runningATH) runningATH = price;

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
                    fearGreed,
                    ath: runningATH,
                    athChange: ((price - runningATH) / runningATH) * 100
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
     * Calculate weighted score — SAME LOGIC as app.js calculateScores()
     * Uses identical thresholds and weights for consistent results
     */
    calculateWeightedScore(snapshot, priceWindow, prevDayPrice) {
        const prices = priceWindow.map(d => d.price);

        // === TECHNICAL SCORE (35%) — same as app.js ===
        const rsi = calculateRSI(prices);
        const trend = determineTrend(prices);

        let techScore = 5;

        // RSI scoring
        if (rsi < 30) techScore += 2.5;
        else if (rsi < 40) techScore += 1.5;
        else if (rsi > 70) techScore -= 2.5;
        else if (rsi > 60) techScore -= 1.5;

        // Trend scoring
        if (trend === 'up') techScore += 1.5;
        else if (trend === 'down') techScore -= 1.5;

        // ATH distance (technical component)
        if (snapshot.athChange > -20) techScore += 0.5;
        else if (snapshot.athChange < -40) techScore -= 1;

        techScore = Math.max(0, Math.min(10, techScore));

        // === MOMENTUM SCORE (25%) — same as app.js "onchain" ===
        // Uses daily price change as proxy for 24h change
        let momentumScore = 5;
        if (prevDayPrice) {
            const dailyChange = ((snapshot.price - prevDayPrice) / prevDayPrice) * 100;
            if (dailyChange > 5) momentumScore += 2;
            else if (dailyChange > 2) momentumScore += 1;
            else if (dailyChange < -5) momentumScore -= 2;
            else if (dailyChange < -2) momentumScore -= 1;
        }
        momentumScore = Math.max(0, Math.min(10, momentumScore));

        // === SENTIMENT SCORE (20%) — same as app.js ===
        // Note: Only Fear & Greed available historically
        // Funding Rate, L/S Ratio, News Sentiment not available in backtest
        let sentimentScore = 5;

        // Fear & Greed as contrarian indicator (same thresholds)
        if (snapshot.fearGreed <= 20) sentimentScore += 3;
        else if (snapshot.fearGreed <= 35) sentimentScore += 1.5;
        else if (snapshot.fearGreed >= 80) sentimentScore -= 3;
        else if (snapshot.fearGreed >= 65) sentimentScore -= 1.5;

        sentimentScore = Math.max(0, Math.min(10, sentimentScore));

        // === MACRO SCORE (20%) — same as app.js ===
        let macroScore = 5;
        if (snapshot.athChange < -30) macroScore += 2;
        else if (snapshot.athChange < -15) macroScore += 1;
        else if (snapshot.athChange > -5) macroScore -= 1;

        macroScore = Math.max(0, Math.min(10, macroScore));

        // === WEIGHTED TOTAL — same weights as app.js CONFIG.weights ===
        const weightedScore =
            techScore * 0.35 +
            momentumScore * 0.25 +
            sentimentScore * 0.20 +
            macroScore * 0.20;

        // Determine signal — same thresholds as app.js
        let signal = 'NEUTRAL';
        if (weightedScore >= 5.8) signal = 'LONG';
        else if (weightedScore <= 4.2) signal = 'SHORT';

        return {
            weightedScore,
            signal,
            scores: {
                technical: techScore,
                momentum: momentumScore,
                sentiment: sentimentScore,
                macro: macroScore
            },
            rsi,
            trend
        };
    },

    /**
     * Calculate trade levels — SAME as app.js and bot.js
     * SL: 6%, TP1: 4%, TP2: 8%, TP3: 12%
     */
    calculateTradeLevels(price, direction) {
        const slPercent = 0.06;

        const stopLoss = direction === 'LONG'
            ? price * (1 - slPercent)
            : price * (1 + slPercent);

        const tp1 = direction === 'LONG' ? price * 1.04 : price * 0.96;
        const tp2 = direction === 'LONG' ? price * 1.08 : price * 0.92;
        const tp3 = direction === 'LONG' ? price * 1.12 : price * 0.88;

        return {
            entryPrice: price,
            stopLoss,
            tp1,
            tp2,
            tp3,
            slPercent,
            riskReward: 0.04 / slPercent
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
            outcome = timeoutProfit > 0 ? 'WIN' : 'LOSS';
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
     * Run backtest with weighted score system (aligned with live dashboard)
     */
    async runBacktest(maxTrades = 60) {
        console.log('🔬 Starting Weighted-Score Backtest (aligned with live system)...');
        console.log('   Scoring: Technical 35%, Momentum 25%, Sentiment 20%, Macro 20%');
        console.log('   Thresholds: LONG >= 5.8, SHORT <= 4.2');
        console.log('   Trade Levels: SL 6%, TP1 4%, TP2 8%, TP3 12%\n');

        if (!this.cachedHistoricalData) {
            await this.fetchHistoricalData(365);
        }

        if (!this.cachedHistoricalData || this.cachedHistoricalData.length < 30) {
            console.error('❌ Insufficient historical data');
            return null;
        }

        const data = this.cachedHistoricalData;
        const trades = [];
        const windowSize = 30;

        let signalsEvaluated = 0;

        for (let i = windowSize; i < data.length - 20; i++) {
            if (trades.length >= maxTrades) break;

            const snapshot = data[i];
            const priceWindow = data.slice(Math.max(0, i - windowSize), i + 1);
            const prevDayPrice = i > 0 ? data[i - 1].price : null;

            const result = this.calculateWeightedScore(snapshot, priceWindow, prevDayPrice);
            signalsEvaluated++;

            if (result.signal === 'NEUTRAL') continue;

            const icon = result.signal === 'LONG' ? '🟢' : '🔴';
            console.log(`${icon} ${result.signal} @ ${snapshot.date} | Score: ${result.weightedScore.toFixed(1)}/10 | F&G: ${snapshot.fearGreed} | RSI: ${result.rsi.toFixed(0)}`);

            const levels = this.calculateTradeLevels(snapshot.price, result.signal);
            const outcome = this.simulateTradeOutcome(i, levels, result.signal, data);

            const outcomeIcon = outcome.outcome === 'WIN' ? '✅' : '❌';
            console.log(`   ${outcomeIcon} ${outcome.outcome} → ${outcome.profit > 0 ? '+' : ''}${outcome.profit.toFixed(2)}% in ${outcome.exitDay}d`);

            trades.push({
                date: snapshot.date,
                timestamp: snapshot.timestamp,
                direction: result.signal,
                confluenceScore: result.weightedScore,
                scores: result.scores,
                entryPrice: levels.entryPrice,
                stopLoss: levels.stopLoss,
                tp1: levels.tp1,
                exitPrice: outcome.exitPrice,
                exitDay: outcome.exitDay,
                outcome: outcome.outcome,
                profit: outcome.profit,
                rsi: result.rsi,
                fearGreed: snapshot.fearGreed
            });

            // Skip forward past trade duration
            i += Math.max(4, outcome.exitDay);
        }

        console.log(`\n📈 Backtest Complete:`);
        console.log(`   Days analyzed: ${signalsEvaluated}`);
        console.log(`   Trades executed: ${trades.length}`);
        console.log(`   Note: Backtest uses F&G only for sentiment (no Funding/L-S/News data historically)`);

        this.results = trades;
        return this.analyzeResults(trades);
    },

    /**
     * Analyze results
     */
    analyzeResults(trades) {
        const wins = trades.filter(t => t.outcome === 'WIN');
        const losses = trades.filter(t => t.outcome === 'LOSS');
        const timeouts = trades.filter(t => t.outcome === 'TIMEOUT');

        const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
        const avgWin = wins.length > 0
            ? wins.reduce((sum, t) => sum + t.profit, 0) / wins.length
            : 0;
        const avgLoss = losses.length > 0
            ? losses.reduce((sum, t) => sum + t.profit, 0) / losses.length
            : 0;
        const totalReturn = trades.reduce((sum, t) => sum + t.profit, 0);

        const bestTrade = trades.length > 0
            ? trades.reduce((max, t) => t.profit > max.profit ? t : max, trades[0])
            : null;
        const worstTrade = trades.length > 0
            ? trades.reduce((min, t) => t.profit < min.profit ? t : min, trades[0])
            : null;

        return {
            totalTrades: trades.length,
            wins: wins.length,
            losses: losses.length,
            timeouts: timeouts.length,
            winRate,
            avgWin,
            avgLoss,
            totalReturn,
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
