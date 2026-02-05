/**
 * Smart Money Strategy - Live Signal Detection
 * Detects LONG signals based on Asymmetric Golden Cross Trading System
 * 
 * Entry Conditions (ALL must be true):
 * 1. Golden Cross: EMA(15) > EMA(300)
 * 2. HTF Filter: Price > EMA(800)
 * 3. RSI Zone: RSI(14) between 45 and 70
 */

const SmartMoneySignal = {
    // Configuration
    config: {
        emaFast: 15,
        emaSlow: 300,
        emaHTF: 800,
        rsiPeriod: 14,
        rsiMin: 45,
        rsiMax: 70,
        atrPeriod: 14,
        atrMultiplier: 2.5,
        refreshInterval: 300000, // 5 minutes
        candleCount: 1000 // Enough for EMA 800
    },

    // Current state
    state: {
        currentPrice: 0,
        emaFast: 0,
        emaSlow: 0,
        emaHTF: 0,
        rsi: 0,
        atr: 0,

        // Conditions
        goldenCross: false,
        htfFilter: false,
        rsiInZone: false,

        // Signal
        signal: 'NEUTRAL', // LONG, NEUTRAL, EXIT
        signalStrength: 0, // 0-3 (number of conditions met)

        // Trade levels
        stopLoss: 0,

        // Metadata
        lastCandle: null,
        lastUpdate: null,
        error: null
    },

    // Initialize
    async init() {
        console.log('🚀 Smart Money Signal Detection initialized');
        await this.updateSignal();

        // Auto-refresh every 5 minutes
        setInterval(() => this.updateSignal(), this.config.refreshInterval);

        // Also refresh at the start of each hour (new candle)
        this.scheduleHourlyRefresh();
    },

    scheduleHourlyRefresh() {
        const now = new Date();
        const msToNextHour = (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000;

        setTimeout(() => {
            this.updateSignal();
            // Then repeat every hour
            setInterval(() => this.updateSignal(), 3600000);
        }, msToNextHour + 5000); // 5 seconds after the hour for data to be available
    },

    // Fetch 1H candles from Binance
    async fetchKlines() {
        try {
            const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=${this.config.candleCount}`;
            const response = await fetch(url);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            // Parse candles: [openTime, open, high, low, close, volume, ...]
            return data.map(candle => ({
                time: candle[0],
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[5])
            }));
        } catch (error) {
            console.error('Error fetching klines:', error);
            this.state.error = error.message;
            throw error;
        }
    },

    // Calculate EMA
    calculateEMA(prices, period) {
        if (prices.length < period) return null;

        const multiplier = 2 / (period + 1);

        // Start with SMA for first EMA value
        let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

        // Calculate EMA for remaining prices
        for (let i = period; i < prices.length; i++) {
            ema = (prices[i] - ema) * multiplier + ema;
        }

        return ema;
    },

    // Calculate RSI
    calculateRSI(prices, period = 14) {
        if (prices.length < period + 1) return 50;

        let gains = 0;
        let losses = 0;

        // Calculate initial average gain/loss
        for (let i = 1; i <= period; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) gains += change;
            else losses -= change;
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        // Calculate smoothed RSI for remaining prices
        for (let i = period + 1; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];

            if (change > 0) {
                avgGain = (avgGain * (period - 1) + change) / period;
                avgLoss = (avgLoss * (period - 1)) / period;
            } else {
                avgGain = (avgGain * (period - 1)) / period;
                avgLoss = (avgLoss * (period - 1) - change) / period;
            }
        }

        if (avgLoss === 0) return 100;

        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    },

    // Calculate ATR (Average True Range)
    calculateATR(candles, period = 14) {
        if (candles.length < period + 1) return 0;

        const trueRanges = [];

        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;

            const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            );

            trueRanges.push(tr);
        }

        // Calculate ATR as EMA of true ranges
        const multiplier = 2 / (period + 1);
        let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;

        for (let i = period; i < trueRanges.length; i++) {
            atr = (trueRanges[i] - atr) * multiplier + atr;
        }

        return atr;
    },

    // Main update function
    async updateSignal() {
        try {
            console.log('📊 Updating Smart Money Signal...');

            const candles = await this.fetchKlines();
            if (!candles || candles.length < this.config.emaHTF) {
                throw new Error('Insufficient candle data');
            }

            const closePrices = candles.map(c => c.close);
            const currentPrice = closePrices[closePrices.length - 1];

            // Calculate indicators
            const emaFast = this.calculateEMA(closePrices, this.config.emaFast);
            const emaSlow = this.calculateEMA(closePrices, this.config.emaSlow);
            const emaHTF = this.calculateEMA(closePrices, this.config.emaHTF);
            const rsi = this.calculateRSI(closePrices, this.config.rsiPeriod);
            const atr = this.calculateATR(candles, this.config.atrPeriod);

            // Update state
            this.state.currentPrice = currentPrice;
            this.state.emaFast = emaFast;
            this.state.emaSlow = emaSlow;
            this.state.emaHTF = emaHTF;
            this.state.rsi = rsi;
            this.state.atr = atr;
            this.state.lastCandle = candles[candles.length - 1];
            this.state.lastUpdate = new Date();
            this.state.error = null;

            // Check conditions
            this.state.goldenCross = emaFast > emaSlow;
            this.state.htfFilter = currentPrice > emaHTF;
            this.state.rsiInZone = rsi >= this.config.rsiMin && rsi <= this.config.rsiMax;

            // Calculate signal strength (0-3)
            this.state.signalStrength =
                (this.state.goldenCross ? 1 : 0) +
                (this.state.htfFilter ? 1 : 0) +
                (this.state.rsiInZone ? 1 : 0);

            // Determine signal
            const previousSignal = this.state.signal;

            if (this.state.goldenCross && this.state.htfFilter && this.state.rsiInZone) {
                this.state.signal = 'LONG';
            } else if (!this.state.goldenCross) {
                // Death Cross = Exit signal if we were in a trade
                this.state.signal = previousSignal === 'LONG' ? 'EXIT' : 'NEUTRAL';
            } else {
                this.state.signal = 'NEUTRAL';
            }

            // Calculate trade levels
            this.state.stopLoss = currentPrice - (atr * this.config.atrMultiplier);

            // Notify if signal changed
            if (previousSignal !== this.state.signal && previousSignal !== null) {
                this.onSignalChange(previousSignal, this.state.signal);
            }

            // Update UI
            this.updateUI();

            console.log('✅ Signal updated:', this.state.signal, `(${this.state.signalStrength}/3 conditions)`);

            return this.state;

        } catch (error) {
            console.error('Error updating signal:', error);
            this.state.error = error.message;
            this.updateUI();
            return this.state;
        }
    },

    // Handle signal change
    onSignalChange(oldSignal, newSignal) {
        console.log(`🔔 Signal changed: ${oldSignal} → ${newSignal}`);

        if (typeof NotificationSystem !== 'undefined') {
            if (newSignal === 'LONG') {
                NotificationSystem.playSound('long');
                NotificationSystem.sendNotification(
                    '🟢 SMART MONEY LONG Signal!',
                    `Alle Bedingungen erfüllt! Entry: $${this.state.currentPrice.toLocaleString()} | SL: $${this.state.stopLoss.toLocaleString()}`,
                    'long'
                );
                NotificationSystem.showInPageAlert('long', 100, this.state.currentPrice);
            } else if (newSignal === 'EXIT') {
                NotificationSystem.playSound('short');
                NotificationSystem.sendNotification(
                    '🔴 EXIT Signal - Death Cross!',
                    `EMA(15) unter EMA(300) gefallen. Position schließen!`,
                    'short'
                );
            }
        }
    },

    // Update UI elements
    updateUI() {
        // Calculate distances/gaps for each condition
        const emaGap = this.state.emaSlow - this.state.emaFast;
        const emaGapPercent = ((this.state.emaSlow - this.state.emaFast) / this.state.emaSlow * 100);
        const priceToHTF = this.state.emaHTF - this.state.currentPrice;
        const priceToHTFPercent = ((this.state.emaHTF - this.state.currentPrice) / this.state.currentPrice * 100);
        const rsiToMin = this.config.rsiMin - this.state.rsi;
        const rsiToMax = this.state.rsi - this.config.rsiMax;

        // Golden Cross condition
        let gcExplanation, gcProgress;
        if (this.state.goldenCross) {
            gcExplanation = `✓ EMA(15) ist $${Math.abs(emaGap).toFixed(0)} ÜBER EMA(300)`;
            gcProgress = `Bullish Trend aktiv!`;
        } else {
            gcExplanation = `EMA(15): $${this.state.emaFast?.toFixed(0)} muss über $${this.state.emaSlow?.toFixed(0)} steigen`;
            gcProgress = `⏳ Noch $${Math.abs(emaGap).toFixed(0)} (${Math.abs(emaGapPercent).toFixed(1)}%) Abstand`;
        }
        this.updateConditionUI('goldenCross', this.state.goldenCross, gcExplanation, gcProgress,
            'EMA(15) muss über EMA(300) kreuzen = Trendwechsel zu bullish');

        // HTF Filter condition
        let htfExplanation, htfProgress;
        if (this.state.htfFilter) {
            htfExplanation = `✓ Preis ist $${Math.abs(priceToHTF).toFixed(0)} ÜBER EMA(800)`;
            htfProgress = `Langfristiger Aufwärtstrend bestätigt!`;
        } else {
            htfExplanation = `Preis: $${this.state.currentPrice?.toLocaleString()} muss über $${this.state.emaHTF?.toFixed(0)} steigen`;
            htfProgress = `⏳ Noch $${Math.abs(priceToHTF).toFixed(0)} (+${Math.abs(priceToHTFPercent).toFixed(1)}%) nötig`;
        }
        this.updateConditionUI('htfFilter', this.state.htfFilter, htfExplanation, htfProgress,
            'Preis muss über EMA(800) sein = Wir handeln nur im Aufwärtstrend');

        // RSI Zone condition
        let rsiExplanation, rsiProgress;
        if (this.state.rsiInZone) {
            rsiExplanation = `✓ RSI bei ${this.state.rsi?.toFixed(1)} ist in der optimalen Zone`;
            rsiProgress = `Perfekter Momentum-Bereich!`;
        } else if (this.state.rsi < this.config.rsiMin) {
            rsiExplanation = `RSI: ${this.state.rsi?.toFixed(1)} ist unter 45 (überverkauft)`;
            rsiProgress = `⏳ Noch ${rsiToMin.toFixed(1)} Punkte bis Zone 45-70`;
        } else {
            rsiExplanation = `RSI: ${this.state.rsi?.toFixed(1)} ist über 70 (überkauft)`;
            rsiProgress = `⚠️ ${rsiToMax.toFixed(1)} Punkte über der Zone - Überhitzt!`;
        }
        this.updateConditionUI('rsiZone', this.state.rsiInZone, rsiExplanation, rsiProgress,
            'RSI muss zwischen 45-70 sein = Nicht überkauft, nicht überverkauft');

        // Update signal display
        const signalEl = document.getElementById('smartMoneySignal');
        if (signalEl) {
            signalEl.textContent = this.state.signal;
            signalEl.className = `sm-signal sm-signal-${this.state.signal.toLowerCase()}`;
        }

        // Update strength meter
        const strengthEl = document.getElementById('signalStrength');
        if (strengthEl) {
            strengthEl.textContent = `${this.state.signalStrength}/3`;
            strengthEl.style.color = this.state.signalStrength === 3 ? '#10b981' :
                this.state.signalStrength >= 2 ? '#f59e0b' : '#ef4444';
        }

        // Update stop loss display
        const slEl = document.getElementById('smartMoneySL');
        if (slEl) {
            slEl.textContent = `$${this.state.stopLoss?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
        }

        // Update ATR display
        const atrEl = document.getElementById('smartMoneyATR');
        if (atrEl) {
            atrEl.textContent = `$${this.state.atr?.toFixed(0)}`;
        }

        // Update last update time
        const updateEl = document.getElementById('smartMoneyUpdate');
        if (updateEl && this.state.lastUpdate) {
            updateEl.textContent = this.state.lastUpdate.toLocaleTimeString('de-DE');
        }

        // Update error display
        const errorEl = document.getElementById('smartMoneyError');
        if (errorEl) {
            if (this.state.error) {
                errorEl.textContent = `⚠️ ${this.state.error}`;
                errorEl.style.display = 'block';
            } else {
                errorEl.style.display = 'none';
            }
        }
    },

    updateConditionUI(id, isMet, status, progress, explanation) {
        const el = document.getElementById(`condition-${id}`);
        if (!el) return;

        const icon = el.querySelector('.condition-icon');
        const statusEl = el.querySelector('.condition-status');
        const progressEl = el.querySelector('.condition-progress');
        const explanationEl = el.querySelector('.condition-explanation');

        if (icon) icon.textContent = isMet ? '✅' : '❌';
        if (statusEl) {
            statusEl.textContent = status;
            statusEl.className = `condition-status ${isMet ? 'met' : 'not-met'}`;
        }
        if (progressEl) {
            progressEl.textContent = progress;
            progressEl.className = `condition-progress ${isMet ? 'met' : 'pending'}`;
        }
        if (explanationEl) {
            explanationEl.textContent = explanation;
        }

        el.className = `condition-item ${isMet ? 'condition-met' : 'condition-not-met'}`;
    },

    // Get current state for external use
    getState() {
        return { ...this.state };
    },

    // Check if we should enter a trade
    shouldEnterLong() {
        return this.state.signal === 'LONG';
    },

    // Check if we should exit
    shouldExit() {
        return this.state.signal === 'EXIT' || !this.state.goldenCross;
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SmartMoneySignal.init());
} else {
    SmartMoneySignal.init();
}
