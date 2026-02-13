/**
 * Smart Accumulator v3 - Long Term Spot Strategy
 * 
 * Buy Logic (unchanged, 76% accuracy over 8 years):
 * 1. Price vs SMA 200 (Daily): 35pts max
 * 2. RSI (Daily 14): 25pts max
 * 3. Fear & Greed Index: 20pts max - Contrarian
 * 4. ATH Discount: 10pts max
 * 5. Weekly RSI (Momentum): 10pts max
 * 
 * Sell Logic v3 (improved, with bull market dampener):
 * - Stricter RSI thresholds (85/78/72 instead of 80/70)
 * - SMA50 parabolic extension check
 * - Bull market age dampener (young bull = lower sell score)
 * 
 * DCA Cooldown: Recommends max 1 buy per 7 days
 */

const SpotStrategy = {
    config: {
        candleLimit: 1000,  // ~2.7 years of daily data for robust ATH
        refreshInterval: 600000, // 10 min
    },

    state: {
        price: 0,
        sma200: 0,
        sma50: 0,
        rsiDaily: 0,
        rsiWeekly: 0,
        fearGreed: 0,
        athPrice: 0,
        athDown: 0,
        score: 0,
        sellScore: 0,
        sellWarning: '',
        daysAboveSMA: 0,
        signal: 'LOADING',
        zone: 'LOADING',
        action: '',
        lastUpdate: null,
        lastBuyDate: null,
        _closes: [],  // stored for bull-age calculation
        scores: {
            sma: 0,
            rsi: 0,
            sentiment: 0,
            discount: 0,
            momentum: 0
        }
    },

    init() {
        console.log('🏦 Smart Accumulator v2 initialized');
        // Load last buy date from localStorage
        const saved = localStorage.getItem('spot-last-buy');
        if (saved) this.state.lastBuyDate = new Date(saved);

        this.update();
        setInterval(() => this.update(), this.config.refreshInterval);
    },

    async update() {
        try {
            console.log('🔄 Updating Spot Strategy v2...');

            // 1. Fetch Daily Candles (1000 days)
            const candles = await this.fetchDailyCandles();
            if (candles.length < 200) {
                console.warn('Not enough candle data');
                return;
            }

            // 2. Fetch Fear & Greed
            await this.fetchFearGreed();

            // 3. Calculate Indicators
            const closes = candles.map(c => c.close);
            this.state._closes = closes;
            this.state.price = closes[closes.length - 1];
            this.state.sma200 = this.calculateSMA(closes, 200);
            this.state.sma50 = this.calculateSMA(closes, 50);
            this.state.rsiDaily = this.calculateRSI(closes, 14);

            // Weekly RSI (approximate: use every 7th close)
            const weeklies = [];
            for (let i = 6; i < closes.length; i += 7) {
                weeklies.push(closes[i]);
            }
            this.state.rsiWeekly = weeklies.length > 15 ? this.calculateRSI(weeklies, 14) : 50;

            // ATH from full candle history
            const allHighs = candles.map(c => c.high);
            this.state.athPrice = Math.max(...allHighs);
            this.state.athDown = ((this.state.athPrice - this.state.price) / this.state.athPrice) * 100;

            // Bull Market Age: how many consecutive days above SMA200
            let daysAbove = 0;
            for (let j = closes.length - 1; j >= Math.max(0, closes.length - 365); j--) {
                const s200 = this.calculateSMA(closes.slice(0, j + 1), 200);
                if (s200 > 0 && closes[j] > s200) daysAbove++;
                else break;
            }
            this.state.daysAboveSMA = daysAbove;

            // 4. Evaluate
            this.evaluateSignal();

            // 5. Update UI
            this.state.lastUpdate = new Date();
            this.updateUI();

            console.log(`🏦 Score: ${this.state.score}/100 | Zone: ${this.state.zone} | Signal: ${this.state.signal}`);

        } catch (e) {
            console.error('Spot Strategy Error:', e);
        }
    },

    async fetchDailyCandles() {
        const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=${this.config.candleLimit}`;
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
            const el = document.getElementById('fearGreedValue');
            if (el && !isNaN(parseInt(el.textContent))) {
                this.state.fearGreed = parseInt(el.textContent);
            } else {
                const res = await fetch('https://api.alternative.me/fng/');
                const data = await res.json();
                this.state.fearGreed = parseInt(data.data[0].value);
            }
        } catch (e) {
            this.state.fearGreed = 50;
        }
    },

    calculateSMA(data, period) {
        if (data.length < period) return 0;
        const slice = data.slice(data.length - period);
        return slice.reduce((a, b) => a + b, 0) / period;
    },

    calculateRSI(data, period) {
        if (data.length < period + 1) return 50;
        let gains = 0, losses = 0;

        for (let i = 1; i <= period; i++) {
            const diff = data[i] - data[i - 1];
            if (diff > 0) gains += diff;
            else losses -= diff;
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

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
        return 100 - (100 / (1 + avgGain / avgLoss));
    },

    evaluateSignal() {
        const s = this.state;
        let buyScore = 0;
        let sellScore = 0;

        // ═══════════════════════════════════════════
        // BUY SCORING (0-100, higher = better buy)
        // ═══════════════════════════════════════════

        // 1. Price vs SMA 200 (Max 35pts)
        const smaRatio = s.price / s.sma200;
        if (smaRatio < 0.85) { buyScore += 35; }       // Deep under SMA → Best buy
        else if (smaRatio < 1.0) { buyScore += 30; }   // Under SMA → Great buy
        else if (smaRatio < 1.1) { buyScore += 20; }   // Slightly above → OK
        else if (smaRatio < 1.3) { buyScore += 10; }   // Moderately above → Meh
        else if (smaRatio < 1.5) { buyScore += 0; }    // Far above → No points
        else { buyScore -= 10; }                         // Way above → Negative
        s.scores.sma = Math.max(0, buyScore);

        // 2. Daily RSI (Max 25pts) - Realistic thresholds for BTC
        const prevBuy = buyScore;
        if (s.rsiDaily < 30) { buyScore += 25; }       // Genuinely oversold (rare!)
        else if (s.rsiDaily < 40) { buyScore += 20; }  // Getting oversold
        else if (s.rsiDaily < 50) { buyScore += 12; }  // Below midline
        else if (s.rsiDaily < 60) { buyScore += 5; }   // Neutral zone
        else if (s.rsiDaily < 70) { buyScore += 0; }   // Getting warm
        else { buyScore -= 5; }                          // Overbought → Negative
        s.scores.rsi = Math.max(0, buyScore - prevBuy);

        // 3. Fear & Greed (Max 20pts) - Contrarian
        const prevBuy2 = buyScore;
        if (s.fearGreed < 15) { buyScore += 20; }      // Extreme Fear → Buy signal
        else if (s.fearGreed < 25) { buyScore += 15; }  // Fear
        else if (s.fearGreed < 40) { buyScore += 8; }   // Moderate Fear
        else if (s.fearGreed < 55) { buyScore += 3; }   // Neutral
        else if (s.fearGreed < 75) { buyScore += 0; }   // Greed → No buy
        else { buyScore -= 5; }                           // Extreme Greed → Negative
        s.scores.sentiment = Math.max(0, buyScore - prevBuy2);

        // 4. Discount from ATH (Max 10pts)
        const prevBuy3 = buyScore;
        if (s.athDown > 60) { buyScore += 10; }         // 60%+ crash → Buy everything
        else if (s.athDown > 40) { buyScore += 8; }     // 40-60% → Very good
        else if (s.athDown > 25) { buyScore += 5; }     // 25-40% → Decent
        else if (s.athDown > 15) { buyScore += 2; }     // 15-25% → Small correction
        // Near ATH = 0pts, which is fine
        s.scores.discount = Math.max(0, buyScore - prevBuy3);

        // 5. Weekly Momentum Confirmation (Max 10pts)
        const prevBuy4 = buyScore;
        if (s.rsiWeekly < 35) { buyScore += 10; }       // Weekly oversold → strong confirm
        else if (s.rsiWeekly < 45) { buyScore += 7; }
        else if (s.rsiWeekly < 55) { buyScore += 3; }
        else if (s.rsiWeekly > 80) { buyScore -= 5; }   // Weekly overbought
        s.scores.momentum = Math.max(0, buyScore - prevBuy4);

        // ═══════════════════════════════════════════
        // SELL SCORING v3 (with bull market dampener)
        // ═══════════════════════════════════════════

        // 1. SMA200 Extension (Max 25) - How stretched above SMA?
        if (smaRatio > 2.0) sellScore += 25;
        else if (smaRatio > 1.6) sellScore += 20;
        else if (smaRatio > 1.4) sellScore += 12;
        else if (smaRatio > 1.3) sellScore += 5;

        // 2. Daily RSI (Max 20) - stricter thresholds
        if (s.rsiDaily > 85) sellScore += 20;
        else if (s.rsiDaily > 78) sellScore += 12;
        else if (s.rsiDaily > 72) sellScore += 5;

        // 3. Weekly RSI (Max 20) - most reliable overbought signal
        if (s.rsiWeekly > 85) sellScore += 20;
        else if (s.rsiWeekly > 78) sellScore += 12;
        else if (s.rsiWeekly > 72) sellScore += 5;

        // 4. Near ATH (Max 10)
        if (s.athDown < 3) sellScore += 10;
        else if (s.athDown < 8) sellScore += 5;

        // 5. Parabolic Extension (Max 15) - price way above SMA50
        const sma50ratio = s.price / s.sma50;
        if (sma50ratio > 1.3) sellScore += 15;
        else if (sma50ratio > 1.2) sellScore += 8;
        else if (sma50ratio > 1.15) sellScore += 3;

        // 6. DAMPENER: Bull Market Age
        // Young bull market → dampen sell score (don't sell too early!)
        if (s.daysAboveSMA < 30) sellScore = Math.round(sellScore * 0.3);
        else if (s.daysAboveSMA < 60) sellScore = Math.round(sellScore * 0.5);
        else if (s.daysAboveSMA < 120) sellScore = Math.round(sellScore * 0.7);
        // Mature bull (120+ days) → no dampening

        // ═══════════════════════════════════════════
        // FINAL SCORING
        // ═══════════════════════════════════════════
        s.score = Math.max(0, Math.min(100, buyScore));
        s.sellScore = Math.max(0, Math.min(100, sellScore));

        // Sell Warning Tier
        if (s.sellScore >= 60) {
            s.sellWarning = '🚨 Stark überhitzt! Gewinne sichern (20-30%)';
        } else if (s.sellScore >= 45) {
            s.sellWarning = '🔴 Teilverkauf empfohlen (10-20%)';
        } else if (s.sellScore >= 30) {
            s.sellWarning = '⚠️ Vorsicht – evtl. Position etwas reduzieren';
        } else {
            s.sellWarning = '';
        }

        // DCA Cooldown Check
        let cooldownActive = false;
        if (s.lastBuyDate) {
            const daysSince = (Date.now() - s.lastBuyDate.getTime()) / (1000 * 60 * 60 * 24);
            cooldownActive = daysSince < 7;
        }

        // Determine Zone & Signal
        if (s.sellScore >= 60) {
            s.zone = '🚨 EUPHORIA';
            s.signal = 'SELL';
            s.action = 'Markt ist parabolisch überhitzt. Gewinne sichern! Verkaufe 20-30%.';
        } else if (s.sellScore >= 45) {
            s.zone = '🔴 ÜBERHITZT';
            s.signal = 'SELL SOME';
            s.action = 'Mehrere Indikatoren überhitzt. Teilverkauf empfohlen (10-20%).';
        } else if (s.sellScore >= 30) {
            s.zone = '⚠️ WARM';
            s.signal = 'CAUTION';
            s.action = 'Markt wird teuer. Keine Käufe, evtl. Position leicht reduzieren.';
        } else if (s.score >= 75) {
            s.zone = '🔥 FIRE SALE';
            s.signal = cooldownActive ? 'COOLDOWN' : 'BUY HEAVY';
            s.action = cooldownActive
                ? 'Top-Kaufzone aber Cooldown aktiv. Warte noch auf nächste Woche.'
                : 'Alle Indikatoren perfekt! Kaufe 3-5% deines Portfolios.';
        } else if (s.score >= 50) {
            s.zone = '🟢 ACCUMULATION';
            s.signal = cooldownActive ? 'COOLDOWN' : 'BUY DCA';
            s.action = cooldownActive
                ? 'Gute Zone aber Cooldown aktiv. Warte auf nächste Woche.'
                : 'Gute Kaufzone. Standard DCA Kauf (1-2% Portfolio).';
        } else if (s.score >= 25) {
            s.zone = '⚖️ FAIR VALUE';
            s.signal = 'HOLD';
            s.action = 'Fairer Preis. Nichts tun oder nur minimales DCA.';
        } else {
            s.zone = '⚠️ EXPENSIVE';
            s.signal = 'WAIT';
            s.action = 'Zu teuer für Käufe. Warte auf einen Rücksetzer.';
        }
    },

    updateUI() {
        const signalEl = document.getElementById('spotSignal');
        if (!signalEl) return;

        const s = this.state;

        // Signal Display
        signalEl.textContent = s.signal;
        let statusClass = 'neutral';
        if (s.signal.includes('BUY')) statusClass = 'long';
        else if (s.signal === 'SELL' || s.signal === 'SELL SOME') statusClass = 'short';
        else if (s.signal === 'CAUTION') statusClass = 'neutral';
        signalEl.className = `sm-signal sm-signal-${statusClass}`;

        // Zone & Score
        const zoneEl = document.getElementById('spotZone');
        const scoreEl = document.getElementById('spotScore');
        if (zoneEl) zoneEl.textContent = s.zone;
        if (scoreEl) scoreEl.textContent = `${Math.round(s.score)}/100`;

        // Action Recommendation (include sell warning if active)
        const actionEl = document.getElementById('spotAction');
        if (actionEl) {
            let actionText = s.action;
            if (s.sellWarning) actionText = s.sellWarning + '\n' + actionText;
            actionEl.textContent = actionText;
        }

        // Sell Score
        const sellEl = document.getElementById('spotSellScore');
        if (sellEl) {
            sellEl.textContent = `${Math.round(s.sellScore)}/100`;
            sellEl.className = s.sellScore >= 60 ? 'text-bearish' : s.sellScore >= 45 ? 'text-bearish' : s.sellScore >= 30 ? 'text-warning' : 'text-bullish';
        }

        // Price info
        const priceEl = document.getElementById('spotPrice');
        if (priceEl) priceEl.textContent = `$${Math.round(s.price).toLocaleString()}`;

        // Metrics
        const smaRatio = ((s.price / s.sma200 - 1) * 100).toFixed(1);
        const smaText = s.price < s.sma200
            ? `${Math.abs(smaRatio)}% unter SMA → Kaufzone!`
            : `${smaRatio}% über SMA`;
        this.updateMetric('sma',
            `$${Math.round(s.sma200).toLocaleString()}`,
            smaText,
            s.price < s.sma200 ? 'bullish' : smaRatio > 30 ? 'bearish' : 'neutral'
        );

        this.updateMetric('rsi',
            s.rsiDaily.toFixed(1),
            s.rsiDaily < 30 ? '🔥 Stark Überverkauft' :
                s.rsiDaily < 40 ? '📉 Überverkauft' :
                    s.rsiDaily < 60 ? '⚖️ Neutral' :
                        s.rsiDaily < 70 ? '📈 Wird Warm' : '🔴 Überkauft!',
            s.rsiDaily < 40 ? 'bullish' : s.rsiDaily > 70 ? 'bearish' : 'neutral'
        );

        this.updateMetric('discount',
            `-${s.athDown.toFixed(1)}%`,
            s.athDown > 40 ? '🔥 Starker Rabatt!' :
                s.athDown > 20 ? '📉 Moderate Korrektur' :
                    s.athDown > 5 ? '📊 Nahe ATH' : '🏔️ Am All-Time High!',
            s.athDown > 40 ? 'bullish' : s.athDown < 5 ? 'bearish' : 'neutral'
        );

        this.updateMetric('weekly',
            s.rsiWeekly.toFixed(1),
            s.rsiWeekly < 40 ? '📉 Wöchentlich Überverkauft' :
                s.rsiWeekly < 60 ? '⚖️ Neutral' : '📈 Overbought',
            s.rsiWeekly < 40 ? 'bullish' : s.rsiWeekly > 70 ? 'bearish' : 'neutral'
        );

        // Score Breakdown
        this.updateScoreBar('smaScore', s.scores.sma, 35);
        this.updateScoreBar('rsiScore', s.scores.rsi, 25);
        this.updateScoreBar('sentimentScore2', s.scores.sentiment, 20);
        this.updateScoreBar('discountScore', s.scores.discount, 10);
        this.updateScoreBar('momentumScore', s.scores.momentum, 10);

        // Update time
        const timeEl = document.getElementById('spotUpdate');
        if (timeEl) timeEl.textContent = s.lastUpdate.toLocaleTimeString('de-DE');
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
    },

    updateScoreBar(id, value, max) {
        const el = document.getElementById(id);
        if (!el) return;
        const pct = Math.round((value / max) * 100);
        const fill = el.querySelector('.score-fill');
        const val = el.querySelector('.score-value');
        if (fill) {
            fill.style.width = `${pct}%`;
            fill.style.background = pct > 60 ? 'var(--accent-green)' : pct > 30 ? 'var(--accent-blue)' : 'var(--text-secondary)';
        }
        if (val) val.textContent = `${value}/${max}`;
    },

    // Called from UI when user confirms a buy
    recordBuy() {
        this.state.lastBuyDate = new Date();
        localStorage.setItem('spot-last-buy', this.state.lastBuyDate.toISOString());
        this.evaluateSignal();
        this.updateUI();
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
