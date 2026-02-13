/**
 * Smart Accumulator - Long Term Spot Strategy
 * 
 * Logic:
 * 1. Price vs SMA 200 (Daily): Buy when price is below or near 200D SMA.
 * 2. RSI (Daily): Buy when RSI < 40 (Oversold).
 * 3. Fear & Greed: Buy when < 30 (Extreme Fear).
 * 4. Discount from ATH: Buy when > 40% down.
 */

const SpotStrategy = {
    config: {
        smaPeriod: 200,
        rsiPeriod: 14,
        // Scoring weights
        weights: {
            sma: 0.4,
            rsi: 0.3,
            sentiment: 0.2,
            discount: 0.1
        }
    },

    state: {
        price: 0,
        sma200: 0,
        rsi: 0,
        fearGreed: 0,
        athDown: 0,
        score: 0,
        signal: 'WAIT', // BUY | WAIT | SELL_SOME
        zone: 'NEUTRAL', // ACCUMULATION | FAIR_VALUE | OVERHEATED
        lastUpdate: null
    },

    init() {
        console.log('🏦 Smart Accumulator initialized');
        this.update();
        setInterval(() => this.update(), 600000); // Refresh every 10 mins
    },

    async update() {
        try {
            console.log('🔄 Updating Spot Strategy...');

            // 1. Fetch Daily Candles (for SMA 200 & RSI)
            const candles = await this.fetchDailyCandles();

            // 2. Fetch Fear & Greed
            await this.fetchFearGreed();

            // 3. Calculate Indicators
            const closes = candles.map(c => c.close);
            this.state.price = closes[closes.length - 1]; // Current Daily Close (Live)
            this.state.sma200 = this.calculateSMA(closes, 200);
            this.state.rsi = this.calculateRSI(closes, 14);

            // ATH Data (approx from candles or external)
            const allHighs = candles.map(c => c.high);
            const globalHigh = Math.max(...allHighs);
            this.state.athDown = ((globalHigh - this.state.price) / globalHigh) * 100;

            // 4. Evaluate Logic
            this.evaluateSignal();

            // 5. Update UI
            this.state.lastUpdate = new Date();
            this.updateUI();

        } catch (e) {
            console.error('Spot Strategy Error:', e);
        }
    },

    async fetchDailyCandles() {
        // Binance API: 1 Day candles, limit 1000 to get good SMA/ATH
        const url = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000';
        const res = await fetch(url);
        const data = await res.json();
        return data.map(c => ({
            time: c[0],
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4])
        }));
    },

    async fetchFearGreed() {
        try {
            // Try reading from app global state first if available to save API calls
            const el = document.getElementById('fearGreedValue');
            if (el && !isNaN(parseInt(el.textContent))) {
                this.state.fearGreed = parseInt(el.textContent);
            } else {
                const res = await fetch('https://api.alternative.me/fng/');
                const data = await res.json();
                this.state.fearGreed = parseInt(data.data[0].value);
            }
        } catch (e) {
            this.state.fearGreed = 50; // Default
        }
    },

    calculateSMA(data, period) {
        if (data.length < period) return 0;
        const slice = data.slice(data.length - period);
        const sum = slice.reduce((a, b) => a + b, 0);
        return sum / period;
    },

    calculateRSI(data, period) {
        if (data.length < period + 1) return 50;
        let gains = 0, losses = 0;

        // Initial SRI
        for (let i = 1; i <= period; i++) {
            const diff = data[i] - data[i - 1];
            if (diff > 0) gains += diff;
            else losses -= diff;
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        // Smooth
        for (let i = period + 1; i < data.length; i++) {
            const diff = data[i] - data[i - 1];
            if (diff > 0) {
                avgGain = (avgGain * (period - 1) + diff) / period;
                avgLoss = (avgLoss * (period - 1)) / period;
            } else {
                avgGain = (avgGain * (period - 1)) / period;
                avgLoss = (avgLoss * (period - 1) - diff) / period;
            }
        }

        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    },

    evaluateSignal() {
        let score = 0;

        // 1. SMA 200 Logic (Max 40pts)
        const smaRatio = this.state.price / this.state.sma200;
        if (smaRatio < 1.0) score += 40; // Under 200 SMA -> Excellent buy
        else if (smaRatio < 1.1) score += 30;
        else if (smaRatio < 1.3) score += 15;
        else if (smaRatio > 1.6) score -= 10; // Overheated

        // 2. RSI Logic (Max 30pts)
        if (this.state.rsi < 35) score += 30;
        else if (this.state.rsi < 45) score += 20;
        else if (this.state.rsi < 55) score += 10;
        else if (this.state.rsi > 75) score -= 10;

        // 3. Fear & Greed (Max 20pts) -> Contrarian
        if (this.state.fearGreed < 20) score += 20;
        else if (this.state.fearGreed < 40) score += 10;
        else if (this.state.fearGreed > 75) score -= 10;

        // 4. Discount ATH (Max 10pts)
        if (this.state.athDown > 50) score += 10;
        else if (this.state.athDown > 30) score += 5;

        this.state.score = Math.max(0, Math.min(100, score));

        // Determine Zone & Signal
        if (this.state.score >= 75) {
            this.state.zone = 'FIRE SALE 🔥';
            this.state.signal = 'BUY AGGRESSIVE';
        } else if (this.state.score >= 50) {
            this.state.zone = 'ACCUMULATION 🟢';
            this.state.signal = 'BUY DCA';
        } else if (this.state.score >= 30) {
            this.state.zone = 'FAIR VALUE ⚖️';
            this.state.signal = 'HOLD / DCA';
        } else {
            this.state.zone = 'OVERHEATED ⚠️';
            this.state.signal = 'WAIT / SELL';
        }
    },

    updateUI() {
        const signalEl = document.getElementById('spotSignal');
        if (!signalEl) return;

        signalEl.textContent = this.state.signal;
        // Classes: long, neutral, short
        let statusClass = 'neutral';
        if (this.state.signal.includes('BUY')) statusClass = 'long';
        if (this.state.signal.includes('SELL')) statusClass = 'short';

        signalEl.className = `sm-signal sm-signal-${statusClass}`;

        document.getElementById('spotZone').textContent = this.state.zone;
        document.getElementById('spotScore').textContent = `${Math.round(this.state.score)}/100`;

        // Metrics
        this.updateMetric('sma',
            `$${Math.round(this.state.sma200).toLocaleString()}`,
            this.state.price < this.state.sma200 ? 'Price < 200 SMA' : 'Price > 200 SMA',
            this.state.price < this.state.sma200 ? 'bullish' : 'neutral'
        );

        this.updateMetric('rsi',
            this.state.rsi.toFixed(1),
            this.state.rsi < 40 ? 'Oversold (<40)' : 'Neutral',
            this.state.rsi < 40 ? 'bullish' : this.state.rsi > 70 ? 'bearish' : 'neutral'
        );

        this.updateMetric('discount',
            `-${this.state.athDown.toFixed(1)}%`,
            'From All-Time High',
            this.state.athDown > 40 ? 'bullish' : 'neutral'
        );

        const timeEl = document.getElementById('spotUpdate');
        if (timeEl) timeEl.textContent = this.state.lastUpdate.toLocaleTimeString('de-DE');
    },

    updateMetric(id, value, sub, status) {
        const el = document.getElementById(`metric-${id}`);
        if (el) {
            const valEl = el.querySelector('.metric-value');
            const subEl = el.querySelector('.metric-sub');
            if (valEl) {
                valEl.textContent = value;
                valEl.className = `metric-value text-${status}`;
            }
            if (subEl) subEl.textContent = sub;
        }
    }
};

// Auto Init
try {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => SpotStrategy.init());
    } else {
        SpotStrategy.init();
    }
} catch (e) {
    console.error('Spot Strategy Init Error:', e);
}
