/**
 * TrendGuard Dynamic Strategy - Live Signal Detection
 * 
 * Logic:
 * 1. Trend Filter: Price > 800 SMA (Long) | Price < 800 SMA (Short)
 * 2. Entry Signal: Price > 100h High (Long) | Price < 100h Low (Short) (Donchian Channel)
 * 3. Strength: ADX(14) > 25
 * 4. Exit: 4.0x ATR Trailing Stop
 */

const TrendStrategy = {
    // Configuration
    config: {
        smaPeriod: 800,
        donchianPeriod: 100,
        adxPeriod: 14,
        adxThreshold: 25,
        atrPeriod: 14,
        atrMultiplier: 4.0,
        riskPerTrade: 0.01, // 1%
        refreshInterval: 300000, // 5 minutes
        candleCount: 1000 // Need at least 800 for SMA
    },

    // Current state
    state: {
        currentPrice: 0,
        sma800: 0,
        donchianHigh: 0,
        donchianLow: 0,
        adx: 0,
        atr: 0,

        // Conditions
        trendBullish: false,
        trendBearish: false,
        breakoutLong: false,
        breakoutShort: false,
        strongMomentum: false,

        // Signal
        signal: 'NEUTRAL', // LONG, SHORT, NEUTRAL
        signalStrength: 0, // 0-3

        // Trade levels
        stopLoss: 0,
        positionSize: 0, // in BTC for 100k account example

        // Metadata
        lastUpdate: null,
        error: null
    },

    // Initialize
    async init() {
        console.log('🚀 TrendGuard Strategy initialized');
        await this.updateSignal();

        // Auto-refresh every 5 minutes
        setInterval(() => this.updateSignal(), this.config.refreshInterval);

        // Schedule hourly refresh
        this.scheduleHourlyRefresh();
    },

    scheduleHourlyRefresh() {
        const now = new Date();
        const msToNextHour = (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000;

        setTimeout(() => {
            this.updateSignal();
            setInterval(() => this.updateSignal(), 3600000);
        }, msToNextHour + 5000);
    },

    // Fetch 1H candles from Binance
    async fetchKlines() {
        try {
            const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=${this.config.candleCount}`;
            const response = await fetch(url);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            // Parse: [openTime, open, high, low, close, volume, ...]
            return data.map(candle => ({
                time: candle[0],
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[5])
            }));
        } catch (error) {
            console.error('TrendGuard: Error fetching klines:', error);
            this.state.error = error.message;
            throw error;
        }
    },

    // Calculate SMA
    calculateSMA(prices, period) {
        if (prices.length < period) return null;
        // Simple Average of last 'period' prices
        const slice = prices.slice(prices.length - period);
        const sum = slice.reduce((a, b) => a + b, 0);
        return sum / period;
    },

    // Calculate Donchian Channel (High/Low of last N periods, excluding current)
    calculateDonchian(candles, period) {
        if (candles.length < period + 1) return { high: 0, low: 0 };

        // Exclude the most recent candle as it is "current"
        const relevantCandles = candles.slice(candles.length - period - 1, candles.length - 1);

        const highs = relevantCandles.map(c => c.high);
        const lows = relevantCandles.map(c => c.low);

        return {
            high: Math.max(...highs),
            low: Math.min(...lows)
        };
    },

    // Calculate ATR
    calculateATR(candles, period = 14) {
        if (candles.length < period + 1) return 0;

        // Calculate TRs
        const trs = [];
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            trs.push(tr);
        }

        // Wilder's Smoothing for ATR
        // Initial ATR = SMA of TR
        let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;

        // Subsequent ATR = ((Prior ATR * (period-1)) + Current TR) / period
        for (let i = period; i < trs.length; i++) {
            atr = ((atr * (period - 1)) + trs[i]) / period;
        }

        return atr;
    },

    // Calculate ADX
    calculateADX(candles, period = 14) {
        if (candles.length < period * 2) return 0; // Need enough data for smoothing

        const trs = [];
        const plusDMs = [];
        const minusDMs = [];

        // 1. Calculate TR, +DM, -DM
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevHigh = candles[i - 1].high;
            const prevLow = candles[i - 1].low;
            const prevClose = candles[i - 1].close;

            const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));

            let plusDM = high - prevHigh;
            let minusDM = prevLow - low;

            if (plusDM < 0) plusDM = 0;
            if (minusDM < 0) minusDM = 0;

            if (plusDM > minusDM) minusDM = 0;
            else if (minusDM > plusDM) plusDM = 0;
            else {
                plusDM = 0;
                minusDM = 0;
            }

            trs.push(tr);
            plusDMs.push(plusDM);
            minusDMs.push(minusDM);
        }

        // 2. Smooth TR, +DM, -DM (Wilder's Smoothing)
        // First value is sum
        let smoothTR = trs.slice(0, period).reduce((a, b) => a + b, 0);
        let smoothPlusDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
        let smoothMinusDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);

        // Following values
        const dxList = [];

        // Calculate initial DX if possible? 
        // We usually calculate ADX over a sequence.

        // Let's iterate forward to get the latest ADX
        for (let i = period; i < trs.length; i++) {
            smoothTR = smoothTR - (smoothTR / period) + trs[i];
            smoothPlusDM = smoothPlusDM - (smoothPlusDM / period) + plusDMs[i];
            smoothMinusDM = smoothMinusDM - (smoothMinusDM / period) + minusDMs[i];

            const plusDI = (smoothPlusDM / smoothTR) * 100;
            const minusDI = (smoothMinusDM / smoothTR) * 100;

            const diSum = plusDI + minusDI;
            let dx = 0;
            if (diSum !== 0) {
                dx = (Math.abs(plusDI - minusDI) / diSum) * 100;
            }
            dxList.push(dx);
        }

        // 3. Smooth DX to get ADX
        if (dxList.length < period) return dxList[dxList.length - 1]; // Fallback

        // First ADX = average of DX
        let adx = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;

        // Subsequent ADX
        for (let i = period; i < dxList.length; i++) {
            adx = ((adx * (period - 1)) + dxList[i]) / period;
        }

        return adx;
    },

    // Main Update Function
    async updateSignal() {
        try {
            console.log('📊 Updating TrendGuard Signal...');

            const candles = await this.fetchKlines();
            if (candles.length < this.config.smaPeriod) {
                throw new Error(`Insufficient data: ${candles.length}/${this.config.smaPeriod} candles`);
            }

            const currentPrice = candles[candles.length - 1].close;
            const closePrices = candles.map(c => c.close);

            // Calculate Indicators
            const sma800 = this.calculateSMA(closePrices, this.config.smaPeriod);
            const donchian = this.calculateDonchian(candles, this.config.donchianPeriod);
            const adx = this.calculateADX(candles, this.config.adxPeriod);
            const atr = this.calculateATR(candles, this.config.atrPeriod);

            // Store State
            this.state.currentPrice = currentPrice;
            this.state.sma800 = sma800;
            this.state.donchianHigh = donchian.high;
            this.state.donchianLow = donchian.low;
            this.state.adx = adx;
            this.state.atr = atr;
            this.state.lastUpdate = new Date();
            this.state.error = null;

            // Evaluate Conditions
            this.state.trendBullish = currentPrice > sma800;
            this.state.trendBearish = currentPrice < sma800;

            // Breakout logic: Price currently breaking the level
            this.state.breakoutLong = currentPrice > donchian.high;
            this.state.breakoutShort = currentPrice < donchian.low;

            this.state.strongMomentum = adx > this.config.adxThreshold;

            // Determine Signal
            let newSignal = 'NEUTRAL';
            let strength = 0;

            // Long Scenario
            if (this.state.trendBullish) {
                strength++;
                if (this.state.strongMomentum) strength++;
                if (this.state.breakoutLong) {
                    strength++;
                    if (this.state.strongMomentum) { // Breakout + Trend + Momentum
                        newSignal = 'LONG';
                    }
                }
            }

            // Short Scenario
            if (this.state.trendBearish) {
                strength++;
                if (this.state.strongMomentum) strength++;
                if (this.state.breakoutShort) {
                    strength++;
                    if (this.state.strongMomentum) {
                        newSignal = 'SHORT';
                    }
                }
            }

            // If we are already in a trade, check exit conditions?
            // "Exit (Stop Loss): ATR Trailing Stop"
            // For this display, we mainly show Entry Signals. 
            // If we are not breaking out right now, we are likely "Neutral" (no new entry).
            // But if user wants to see "active trade", we'd need persistent state.
            // For now, simpler "Signal Generator" approach:

            this.state.signal = newSignal;
            this.state.signalStrength = strength;

            // Calculate Trade Parameters
            this.state.stopLoss = this.calculateStopLoss(newSignal, currentPrice, atr);
            this.state.positionSize = this.calculatePositionSize(100000, currentPrice, this.state.stopLoss); // Example $100k

            console.log(`✅ TrendGuard Updated: ${newSignal}, Price: ${currentPrice}, SMA: ${sma800.toFixed(2)}, ADX: ${adx.toFixed(2)}`);

            this.updateUI();

            return this.state;

        } catch (error) {
            console.error('TrendGuard Error:', error);
            this.state.error = error.message;
            this.updateUI();
        }
    },

    calculateStopLoss(signal, price, atr) {
        const dist = atr * this.config.atrMultiplier;
        if (signal === 'LONG') return price - dist;
        if (signal === 'SHORT') return price + dist;
        return 0;
    },

    calculatePositionSize(accountSize, entryPrice, stopLoss) {
        if (!stopLoss || stopLoss === 0) return 0;
        const riskAmount = accountSize * this.config.riskPerTrade; // $1,000
        const riskPerUnit = Math.abs(entryPrice - stopLoss);
        return riskAmount / riskPerUnit; // Units of BTC
    },

    updateUI() {
        // Only update if elements exist (tab might be hidden but elements are in DOM)
        const container = document.getElementById('trendStrategySection');
        if (!container) return;

        // Update Header Info
        const timeEl = document.getElementById('trendUpdate');
        if (timeEl && this.state.lastUpdate) timeEl.textContent = this.state.lastUpdate.toLocaleTimeString('de-DE');

        // Update Signal
        const signalEl = document.getElementById('trendSignal');
        if (signalEl) {
            signalEl.textContent = this.state.signal;
            signalEl.className = `sm-signal sm-signal-${this.state.signal.toLowerCase()}`;
        }

        const strengthEl = document.getElementById('trendStrength');
        if (strengthEl) strengthEl.textContent = `${this.state.signalStrength}/3`;

        // Update Conditions/Metrics

        // 1. Trend Filter (SMA 800)
        this.updateMetric('trend',
            this.state.trendBullish ? 'BULLISH' : 'BEARISH',
            this.state.trendBullish ? '✅ Price > SMA 800' : 'Price < SMA 800',
            this.state.trendBullish ? 'long' : 'short'
        );
        document.getElementById('smaValue').textContent = '$' + this.state.sma800.toLocaleString(undefined, { maximumFractionDigits: 0 });

        // 2. Channel (Donchian)
        const channelStatus = this.state.breakoutLong ? 'BREAKOUT UP' : (this.state.breakoutShort ? 'BREAKOUT DOWN' : 'INSIDE');
        const channelClass = this.state.breakoutLong ? 'long' : (this.state.breakoutShort ? 'short' : 'neutral');
        this.updateMetric('channel', channelStatus,
            `H: $${this.state.donchianHigh.toFixed(0)} | L: $${this.state.donchianLow.toFixed(0)}`,
            channelClass
        );

        // 3. Momentum (ADX)
        const adxStatus = this.state.strongMomentum ? 'STRONG' : 'WEAK';
        const adxClass = this.state.strongMomentum ? 'long' : 'neutral';
        this.updateMetric('momentum', `${this.state.adx.toFixed(1)}`, adxStatus, adxClass);

        // Trade Levels
        const slEl = document.getElementById('trendSL');
        if (slEl) {
            if (this.state.signal !== 'NEUTRAL') {
                slEl.textContent = `$${this.state.stopLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
            } else {
                slEl.textContent = '--';
            }
        }

        const sizeEl = document.getElementById('trendSize');
        if (sizeEl) {
            if (this.state.signal !== 'NEUTRAL') {
                sizeEl.textContent = `${this.state.positionSize.toFixed(4)} BTC`;
            } else {
                sizeEl.textContent = '--';
            }
        }
    },

    updateMetric(id, mainText, subText, statusClass) {
        const el = document.getElementById(`metric-${id}`);
        if (!el) return;
        const val = el.querySelector('.metric-value');
        const sub = el.querySelector('.metric-sub');

        if (val) {
            val.textContent = mainText;
            val.className = `metric-value text-${statusClass === 'long' ? 'bullish' : statusClass === 'short' ? 'bearish' : 'neutral'}`;
        }
        if (sub) sub.textContent = subText;
    }
};

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TrendStrategy.init());
} else {
    TrendStrategy.init();
}
