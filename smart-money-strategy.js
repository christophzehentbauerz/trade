/**
 * BTC Smart Money Strategy - Asymmetric Golden Cross Trading System
 * Backtest Period: January 2022 - February 2026
 * Timeframe: 1H | Asset: BTC/USDT
 */

const SmartMoneyStrategy = {
    // Strategy Configuration
    config: {
        name: 'Smart Money Strategy',
        version: '3.0 (Asymmetric)',
        timeframe: '1H',
        asset: 'BTC/USDT',
        backtestPeriod: 'Jan 2022 - Feb 2026',

        // Indicators
        emaFast: 15,
        emaSlow: 300,
        emaHTF: 800,
        rsiPeriod: 14,
        rsiMin: 45,
        rsiMax: 70,
        atrPeriod: 14,

        // Risk Management
        initialSlAtr: 2.5,
        trailTier1: { trigger: 3.0, distance: 2.0 },
        trailTier2: { trigger: 5.0, distance: 4.0 },

        // Exit Rules
        deathCrossProfitThreshold: 0.05, // 5%
        timeStopBars: 72,
        timeStopMinProfit: 0.005 // 0.5%
    },

    // Performance Metrics
    performance: {
        totalReturn: 74.63,
        winRate: 54.5,
        profitFactor: 2.53,
        maxDrawdown: -11.11,
        totalTrades: 77,
        bestTrade: 21.49,
        avgTrade: 0.86,
        sharpeRatio: 1.0
    },

    // Comparison to Buy & Hold
    comparison: {
        buyHold: { return: 47.7, maxDD: -70, riskLevel: 'High' },
        smartMoney: { return: 74.6, maxDD: -11.1, riskLevel: 'Low' }
    },

    // All 77 Trades
    trades: [
        // 2022
        { id: 1, entry: '2022-03-16', exit: '2022-03-20', entryPrice: 40310, exitPrice: 41815, return: 3.53, result: 'WIN' },
        { id: 2, entry: '2022-04-21', exit: '2022-04-21', entryPrice: 42254, exitPrice: 41462, return: -2.07, result: 'LOSS' },
        { id: 3, entry: '2022-07-18', exit: '2022-07-18', entryPrice: 21862, exitPrice: 21876, return: -0.13, result: 'LOSS' },
        { id: 4, entry: '2022-07-19', exit: '2022-07-20', entryPrice: 22433, exitPrice: 23515, return: 4.62, result: 'WIN' },
        { id: 5, entry: '2022-08-05', exit: '2022-08-09', entryPrice: 23190, exitPrice: 23473, return: 1.02, result: 'WIN' },
        { id: 6, entry: '2022-10-05', exit: '2022-10-06', entryPrice: 20002, exitPrice: 20142, return: 0.50, result: 'WIN' },
        { id: 7, entry: '2022-10-14', exit: '2022-10-14', entryPrice: 19803, exitPrice: 19359, return: -2.44, result: 'LOSS' },
        { id: 8, entry: '2022-10-18', exit: '2022-10-18', entryPrice: 19644, exitPrice: 19416, return: -1.36, result: 'LOSS' },
        { id: 9, entry: '2022-10-25', exit: '2022-10-27', entryPrice: 19490, exitPrice: 20396, return: 4.44, result: 'WIN' },

        // 2023
        { id: 10, entry: '2023-01-06', exit: '2023-01-15', entryPrice: 16940, exitPrice: 20618, return: 21.49, result: 'WIN' },
        { id: 11, entry: '2023-02-07', exit: '2023-02-07', entryPrice: 23283, exitPrice: 22932, return: -1.71, result: 'LOSS' },
        { id: 12, entry: '2023-03-01', exit: '2023-03-02', entryPrice: 23778, exitPrice: 23494, return: -1.39, result: 'LOSS' },
        { id: 13, entry: '2023-03-13', exit: '2023-03-14', entryPrice: 22480, exitPrice: 24570, return: 9.09, result: 'WIN' },
        { id: 14, entry: '2023-04-26', exit: '2023-04-30', entryPrice: 28413, exitPrice: 29655, return: 4.17, result: 'WIN' },
        { id: 15, entry: '2023-05-04', exit: '2023-05-07', entryPrice: 29044, exitPrice: 28943, return: -0.55, result: 'LOSS' },
        { id: 16, entry: '2023-06-18', exit: '2023-06-18', entryPrice: 26650, exitPrice: 26415, return: -1.08, result: 'LOSS' },
        { id: 17, entry: '2023-06-19', exit: '2023-06-19', entryPrice: 26665, exitPrice: 26496, return: -0.83, result: 'LOSS' },
        { id: 18, entry: '2023-06-19', exit: '2023-06-20', entryPrice: 26682, exitPrice: 26754, return: 0.07, result: 'WIN' },
        { id: 19, entry: '2023-07-07', exit: '2023-07-08', entryPrice: 30391, exitPrice: 30172, return: -0.92, result: 'LOSS' },
        { id: 20, entry: '2023-07-09', exit: '2023-07-10', entryPrice: 30332, exitPrice: 30161, return: -0.76, result: 'LOSS' },
        { id: 21, entry: '2023-07-10', exit: '2023-07-10', entryPrice: 30529, exitPrice: 30302, return: -0.94, result: 'LOSS' },
        { id: 22, entry: '2023-08-02', exit: '2023-08-02', entryPrice: 29650, exitPrice: 29026, return: -2.30, result: 'LOSS' },
        { id: 23, entry: '2023-08-08', exit: '2023-08-09', entryPrice: 29439, exitPrice: 29755, return: 0.87, result: 'WIN' },
        { id: 24, entry: '2023-08-11', exit: '2023-08-14', entryPrice: 29482, exitPrice: 29266, return: -0.93, result: 'LOSS' },
        { id: 25, entry: '2023-08-14', exit: '2023-08-15', entryPrice: 29534, exitPrice: 29333, return: -0.88, result: 'LOSS' },
        { id: 26, entry: '2023-09-14', exit: '2023-09-15', entryPrice: 26678, exitPrice: 26238, return: -1.85, result: 'LOSS' },
        { id: 27, entry: '2023-09-15', exit: '2023-09-17', entryPrice: 26776, exitPrice: 26436, return: -1.47, result: 'LOSS' },
        { id: 28, entry: '2023-09-18', exit: '2023-09-18', entryPrice: 26663, exitPrice: 26760, return: 0.16, result: 'WIN' },
        { id: 29, entry: '2023-11-15', exit: '2023-11-16', entryPrice: 36100, exitPrice: 36770, return: 1.65, result: 'WIN' },
        { id: 30, entry: '2023-11-28', exit: '2023-11-28', entryPrice: 37243, exitPrice: 37861, return: 1.46, result: 'WIN' },
        { id: 31, entry: '2023-12-12', exit: '2023-12-12', entryPrice: 41805, exitPrice: 41475, return: -0.99, result: 'LOSS' },
        { id: 32, entry: '2023-12-17', exit: '2023-12-17', entryPrice: 42173, exitPrice: 41718, return: -1.28, result: 'LOSS' },
        { id: 33, entry: '2023-12-19', exit: '2023-12-20', entryPrice: 42714, exitPrice: 43442, return: 1.50, result: 'WIN' },
        { id: 34, entry: '2023-12-27', exit: '2023-12-28', entryPrice: 43154, exitPrice: 42446, return: -1.84, result: 'LOSS' },

        // 2024
        { id: 35, entry: '2024-01-01', exit: '2024-01-03', entryPrice: 43111, exitPrice: 43703, return: 1.17, result: 'WIN' },
        { id: 36, entry: '2024-01-04', exit: '2024-01-05', entryPrice: 43676, exitPrice: 43376, return: -0.89, result: 'LOSS' },
        { id: 37, entry: '2024-01-28', exit: '2024-01-28', entryPrice: 42232, exitPrice: 42413, return: 0.23, result: 'WIN' },
        { id: 38, entry: '2024-01-29', exit: '2024-01-31', entryPrice: 42160, exitPrice: 42941, return: 1.65, result: 'WIN' },
        { id: 39, entry: '2024-02-01', exit: '2024-02-02', entryPrice: 42651, exitPrice: 42981, return: 0.57, result: 'WIN' },
        { id: 40, entry: '2024-03-18', exit: '2024-03-18', entryPrice: 68360, exitPrice: 67124, return: -2.01, result: 'LOSS' },
        { id: 41, entry: '2024-03-25', exit: '2024-03-26', entryPrice: 66556, exitPrice: 69478, return: 4.19, result: 'WIN' },
        { id: 42, entry: '2024-04-06', exit: '2024-04-09', entryPrice: 68143, exitPrice: 71056, return: 4.07, result: 'WIN' },
        { id: 43, entry: '2024-05-05', exit: '2024-05-06', entryPrice: 64120, exitPrice: 64007, return: -0.38, result: 'LOSS' },
        { id: 44, entry: '2024-05-06', exit: '2024-05-07', entryPrice: 64204, exitPrice: 62975, return: -2.11, result: 'LOSS' },
        { id: 45, entry: '2024-05-30', exit: '2024-05-30', entryPrice: 68163, exitPrice: 68476, return: 0.26, result: 'WIN' },
        { id: 46, entry: '2024-06-02', exit: '2024-06-04', entryPrice: 68253, exitPrice: 68905, return: 0.76, result: 'WIN' },
        { id: 47, entry: '2024-07-15', exit: '2024-07-17', entryPrice: 61212, exitPrice: 64242, return: 4.75, result: 'WIN' },
        { id: 48, entry: '2024-07-25', exit: '2024-07-27', entryPrice: 64791, exitPrice: 67791, return: 4.43, result: 'WIN' },
        { id: 49, entry: '2024-07-31', exit: '2024-07-31', entryPrice: 66440, exitPrice: 65257, return: -1.98, result: 'LOSS' },
        { id: 50, entry: '2024-08-22', exit: '2024-08-24', entryPrice: 60970, exitPrice: 63612, return: 4.13, result: 'WIN' },
        { id: 51, entry: '2024-09-17', exit: '2024-09-18', entryPrice: 58966, exitPrice: 59655, return: 0.97, result: 'WIN' },
        { id: 52, entry: '2024-10-11', exit: '2024-10-15', entryPrice: 62450, exitPrice: 65376, return: 4.48, result: 'WIN' },
        { id: 53, entry: '2024-11-05', exit: '2024-11-07', entryPrice: 70192, exitPrice: 74746, return: 6.28, result: 'WIN' },
        { id: 54, entry: '2024-11-27', exit: '2024-11-28', entryPrice: 93403, exitPrice: 94976, return: 1.48, result: 'WIN' },
        { id: 55, entry: '2024-12-11', exit: '2024-12-11', entryPrice: 98293, exitPrice: 99782, return: 1.31, result: 'WIN' },
        { id: 56, entry: '2024-12-25', exit: '2024-12-26', entryPrice: 99145, exitPrice: 97720, return: -1.64, result: 'LOSS' },

        // 2025
        { id: 57, entry: '2025-01-14', exit: '2025-01-16', entryPrice: 96336, exitPrice: 97619, return: 1.13, result: 'WIN' },
        { id: 58, entry: '2025-01-29', exit: '2025-01-30', entryPrice: 103584, exitPrice: 104907, return: 1.08, result: 'WIN' },
        { id: 59, entry: '2025-02-20', exit: '2025-02-21', entryPrice: 98295, exitPrice: 96972, return: -1.54, result: 'LOSS' },
        { id: 60, entry: '2025-03-25', exit: '2025-03-28', entryPrice: 87222, exitPrice: 85719, return: -1.92, result: 'LOSS' },
        { id: 61, entry: '2025-04-12', exit: '2025-04-13', entryPrice: 84458, exitPrice: 84620, return: -0.01, result: 'LOSS' },
        { id: 62, entry: '2025-04-13', exit: '2025-04-15', entryPrice: 84093, exitPrice: 85147, return: 1.05, result: 'WIN' },
        { id: 63, entry: '2025-04-16', exit: '2025-04-19', entryPrice: 84605, exitPrice: 84846, return: 0.08, result: 'WIN' },
        { id: 64, entry: '2025-06-07', exit: '2025-06-10', entryPrice: 105726, exitPrice: 108620, return: 2.53, result: 'WIN' },
        { id: 65, entry: '2025-06-16', exit: '2025-06-16', entryPrice: 106946, exitPrice: 107700, return: 0.50, result: 'WIN' },
        { id: 66, entry: '2025-06-24', exit: '2025-06-26', entryPrice: 105655, exitPrice: 107325, return: 1.38, result: 'WIN' },
        { id: 67, entry: '2025-07-02', exit: '2025-07-04', entryPrice: 107080, exitPrice: 108983, return: 1.58, result: 'WIN' },
        { id: 68, entry: '2025-07-26', exit: '2025-07-28', entryPrice: 117571, exitPrice: 118435, return: 0.53, result: 'WIN' },
        { id: 69, entry: '2025-07-31', exit: '2025-07-31', entryPrice: 118055, exitPrice: 116537, return: -1.48, result: 'LOSS' },
        { id: 70, entry: '2025-08-07', exit: '2025-08-09', entryPrice: 116363, exitPrice: 117110, return: 0.44, result: 'WIN' },
        { id: 71, entry: '2025-08-17', exit: '2025-08-17', entryPrice: 118430, exitPrice: 117900, return: -0.65, result: 'LOSS' },
        { id: 72, entry: '2025-09-05', exit: '2025-09-05', entryPrice: 113215, exitPrice: 110570, return: -2.53, result: 'LOSS' },
        { id: 73, entry: '2025-09-09', exit: '2025-09-09', entryPrice: 113023, exitPrice: 111767, return: -1.31, result: 'LOSS' },
        { id: 74, entry: '2025-09-30', exit: '2025-10-04', entryPrice: 113405, exitPrice: 122268, return: 7.61, result: 'WIN' },
        { id: 75, entry: '2025-10-29', exit: '2025-10-29', entryPrice: 113284, exitPrice: 111510, return: -1.76, result: 'LOSS' },

        // 2026
        { id: 76, entry: '2026-01-03', exit: '2026-01-06', entryPrice: 89671, exitPrice: 92692, return: 3.17, result: 'WIN' },
        { id: 77, entry: '2026-01-08', exit: '2026-01-11', entryPrice: 90782, exitPrice: 90876, return: -0.10, result: 'LOSS' }
    ],

    // Top 10 Trades
    getTopTrades() {
        return [...this.trades]
            .sort((a, b) => b.return - a.return)
            .slice(0, 10);
    },

    // Trade Distribution
    getTradeDistribution() {
        const wins = this.trades.filter(t => t.result === 'WIN');
        return {
            huge: wins.filter(t => t.return > 10).length,       // >10%
            big: wins.filter(t => t.return >= 5 && t.return <= 10).length,   // 5-10%
            medium: wins.filter(t => t.return >= 2 && t.return < 5).length,  // 2-5%
            small: wins.filter(t => t.return > 0 && t.return < 2).length     // <2%
        };
    },

    // Get trades by year
    getTradesByYear(year) {
        return this.trades.filter(t => t.entry.startsWith(year.toString()));
    },

    // Analyze results
    analyzeResults() {
        const wins = this.trades.filter(t => t.result === 'WIN');
        const losses = this.trades.filter(t => t.result === 'LOSS');

        const avgWin = wins.reduce((sum, t) => sum + t.return, 0) / wins.length;
        const avgLoss = Math.abs(losses.reduce((sum, t) => sum + t.return, 0) / losses.length);

        const totalProfit = wins.reduce((sum, t) => sum + t.return, 0);
        const totalLoss = Math.abs(losses.reduce((sum, t) => sum + t.return, 0));

        return {
            totalTrades: this.trades.length,
            wins: wins.length,
            losses: losses.length,
            winRate: this.performance.winRate,
            avgWin,
            avgLoss,
            totalReturn: this.performance.totalReturn,
            profitFactor: this.performance.profitFactor,
            maxDrawdown: this.performance.maxDrawdown,
            bestTrade: Math.max(...this.trades.map(t => t.return)),
            worstTrade: Math.min(...this.trades.map(t => t.return)),
            distribution: this.getTradeDistribution(),
            trades: this.trades
        };
    },

    // Get performance rating
    getPerformanceRating() {
        return {
            rating: 'VERY GOOD',
            emoji: '✅',
            color: 'var(--bullish)'
        };
    }
};

// Export for use
if (typeof window !== 'undefined') {
    window.SmartMoneyStrategy = SmartMoneyStrategy;
}
