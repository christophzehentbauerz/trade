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
        tpMultipliers: [1.5, 2.5, 4.0],
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
        takeProfit1: 0,
        takeProfit2: 0,
        takeProfit3: 0,

        // Metadata
        lastCandle: null,
        priceChange24h: null,
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
            const candle24hAgo = candles.length >= 25 ? candles[candles.length - 25] : null;
            const priceChange24h = candle24hAgo && candle24hAgo.close
                ? ((currentPrice - candle24hAgo.close) / candle24hAgo.close) * 100
                : null;

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
            this.state.priceChange24h = priceChange24h;
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

            const riskDistance = Math.max(0, currentPrice - this.state.stopLoss);
            this.state.takeProfit1 = currentPrice + (riskDistance * this.config.tpMultipliers[0]);
            this.state.takeProfit2 = currentPrice + (riskDistance * this.config.tpMultipliers[1]);
            this.state.takeProfit3 = currentPrice + (riskDistance * this.config.tpMultipliers[2]);

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
                    `Alle Bedingungen erfüllt! Entry: $${this.state.currentPrice.toLocaleString()} | SL: $${this.state.stopLoss.toLocaleString()} | TP1: $${this.state.takeProfit1.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                    'long'
                );
                NotificationSystem.showInPageAlert('long', 100, this.state.currentPrice, 'Smart Money Strategy');
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

        const tp1El = document.getElementById('smartMoneyTP1');
        if (tp1El) {
            tp1El.textContent = `$${this.state.takeProfit1?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
        }

        const tp2El = document.getElementById('smartMoneyTP2');
        if (tp2El) {
            tp2El.textContent = `$${this.state.takeProfit2?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
        }

        const tp3El = document.getElementById('smartMoneyTP3');
        if (tp3El) {
            tp3El.textContent = `$${this.state.takeProfit3?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
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
    },

    // Generate Telegram Signal Check message
    generateSignalCheckMessage() {
        const s = this.state;
        const now = new Date().toLocaleString('de-DE');

        let message = `🤖 *BTC Smart Money Signal*\n`;
        message += `📅 ${now}\n\n`;

        // Signal Status
        if (s.signal === 'LONG') {
            message += `🟢 *LONG SIGNAL AKTIV!*\n\n`;
        } else if (s.signal === 'EXIT') {
            message += `🔴 *EXIT SIGNAL!*\n`;
            message += `Death Cross erkannt - Position schließen!\n\n`;
        } else {
            message += `⚪ *NEUTRAL* - Keine Position\n\n`;
        }

        message += `💰 Preis: $${s.currentPrice?.toLocaleString()}\n\n`;

        // Conditions
        message += `📋 *Entry Bedingungen (${s.signalStrength}/3):*\n`;
        message += `${s.goldenCross ? '✅' : '❌'} Golden Cross: EMA(15) $${s.emaFast?.toFixed(0)} ${s.goldenCross ? '>' : '<'} EMA(300) $${s.emaSlow?.toFixed(0)}\n`;
        message += `${s.htfFilter ? '✅' : '❌'} HTF Filter: Preis ${s.htfFilter ? '>' : '<'} EMA(800) $${s.emaHTF?.toFixed(0)}\n`;
        message += `${s.rsiInZone ? '✅' : '❌'} RSI Zone: ${s.rsi?.toFixed(1)} ${s.rsiInZone ? '✓' : '✗'} [45-70]\n\n`;

        if (s.signal === 'LONG') {
            message += `📊 *Trade Levels:*\n`;
            message += `📍 Entry: $${s.currentPrice?.toLocaleString()}\n`;
            message += `🛑 Stop Loss: $${s.stopLoss?.toLocaleString(undefined, { maximumFractionDigits: 0 })} (ATR×2.5)\n`;
            message += `🎯 TP1: $${s.takeProfit1?.toLocaleString(undefined, { maximumFractionDigits: 0 })} (1.5R)\n`;
            message += `🎯 TP2: $${s.takeProfit2?.toLocaleString(undefined, { maximumFractionDigits: 0 })} (2.5R)\n`;
            message += `🎯 TP3: $${s.takeProfit3?.toLocaleString(undefined, { maximumFractionDigits: 0 })} (4.0R)\n`;
        }

        return message;
    },

    // Generate Telegram Daily Update message (Rich Format)
    async generateDailyUpdateMessage() {
        const s = this.state;
        const now = new Date();
        const dateStr = now.toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Fetch external data if needed (Browser side)
        let fearGreed = { value: 0, text: 'Neutral' };
        try {
            const fgRes = await fetch('https://api.alternative.me/fng/');
            const fgData = await fgRes.json();
            fearGreed = {
                value: fgData.data[0].value,
                text: fgData.data[0].value_classification
            };
        } catch (e) { console.error('F&G Error', e); }

        // Fetch News
        let newsItems = [];
        try {
            const newsRes = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN');
            const newsData = await newsRes.json();
            newsItems = newsData.Data.slice(0, 3);
        } catch (e) { console.error('News Error', e); }

        // Determine Score & Analysis Text
        // Note: In a full app we would use the calculated score from app.js
        // Here we approximate based on SM Signal for the standalone module
        let score = 5.0;
        let analysisText = "Der Markt zeigt sich unentschlossen.";
        let trendScore = 5;
        let diff = (s.emaFast - s.emaSlow) / s.emaSlow * 100;

        if (s.goldenCross) {
            score = 7.5;
            analysisText = "Das Golden Cross ist aktiv. Langfristige Indikatoren zeigen einen Aufwärtstrend.";
            trendScore = 8;
        } else if (diff < -5) {
            score = 2.5;
            analysisText = "Der Markt ist im Bärenmodus. Wir warten auf Bodenbildung.";
            trendScore = 2;
        }

        // Adjust score by F&G (Contrarian)
        if (fearGreed.value < 20) score += 1; // Buy fear

        score = Math.min(10, Math.max(0, score));

        // Build Message
        let message = `🌅 *Guten Morgen! Dein BTC Update*\n`;
        message += `📅 ${dateStr}\n\n`;

        message += `💰 *Marktübersicht:*\n`;
        const priceChangeText = Number.isFinite(s.priceChange24h)
            ? `${s.priceChange24h >= 0 ? '+' : ''}${s.priceChange24h.toFixed(2)}%`
            : 'n/a';
        message += `BTC Preis: $${s.currentPrice?.toLocaleString()} (${priceChangeText})\n`;
        message += `Fear & Greed: ${fearGreed.value} (${fearGreed.text})\n`;
        message += `Score: ${score.toFixed(1)}/10\n\n`;

        message += `🔬 *Analyse & Bewertung:*\n`;
        message += `"${analysisText}"\n\n`;

        message += `📊 *Die Faktoren heute:*\n`;
        message += `• Technik (35%): ${trendScore.toFixed(1)}/10\n`;
        message += `• Momentum (25%): ${(s.rsi / 10).toFixed(1)}/10\n`;
        message += `• Sentiment (20%): ${(fearGreed.value / 10).toFixed(1)}/10\n`;
        message += `• Macro (20%): ${(s.htfFilter ? 7 : 3).toFixed(1)}/10\n\n`;

        message += `🎯 *Tages-Fazit:*\n`;
        if (s.signal === 'LONG') {
            message += `🟢 *LONG* - Aufwärtstrend aktiv.\n`;
            message += `Gute Bedingungen für Entries. Stop Loss bei $${s.stopLoss?.toFixed(0)} beachten.\n\n`;
        } else if (s.signal === 'EXIT') {
            message += `🔴 *EXIT* - Gefahrenzone.\n`;
            message += `Risiko rausnehmen. Death Cross aktiv.\n\n`;
        } else {
            message += `⚪ *Neutral* - Abwarten.\n`;
            message += `Keine klare Richtung erkennbar. Kapital schützen und auf besseres Signal warten.\n\n`;
        }

        message += `Viel Erfolg heute! ☕\n\n`;

        if (newsItems.length > 0) {
            message += `📰 *Crypto News:*\n`;
            newsItems.forEach(n => {
                message += `• [${n.source}] ${n.title}\n`;
            });
        }

        return message;
    },

    // Get Telegram credentials from config file or localStorage
    getTelegramCredentials() {
        // Priority 1: config file (telegram-config.js)
        if (window.TELEGRAM_CONFIG) {
            const cfg = window.TELEGRAM_CONFIG;
            if (cfg.botToken && cfg.chatId) {
                return { token: cfg.botToken, chatId: cfg.chatId, source: 'config' };
            }
        }
        // Priority 2: localStorage
        const token = localStorage.getItem('telegram_bot_token');
        const chatId = localStorage.getItem('telegram_chat_id');
        if (token && chatId) {
            return { token, chatId, source: 'localStorage' };
        }
        return null;
    },

    // Send message to Telegram API
    async sendTelegramMessage(text) {
        const creds = this.getTelegramCredentials();

        if (!creds) {
            return { success: false, error: 'credentials_missing' };
        }

        const token = creds.token;
        const chatId = creds.chatId;

        try {
            const url = `https://api.telegram.org/bot${token}/sendMessage`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                })
            });

            const data = await response.json();
            return { success: data.ok, error: data.description };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Initialize Telegram preview buttons with "Send" functionality
    initTelegramPreview() {
        const signalBtn = document.getElementById('testSignalCheck');
        const dailyBtn = document.getElementById('testDailyUpdate');
        const preview = document.getElementById('telegramPreview');
        const content = document.getElementById('telegramPreviewContent');
        const closeBtn = document.getElementById('closeTelegramPreview');

        // Add Send Button and Config Form to Modal if not exists
        let footer = preview.querySelector('.telegram-preview-footer');
        if (!footer) {
            footer = document.createElement('div');
            footer.className = 'telegram-preview-footer';
            footer.innerHTML = `
                <div id="telegramConfigForm" style="display: none; margin-bottom: 15px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 4px;">
                    <input type="password" id="tgTokenInput" placeholder="Bot Token (123:ABC...)" style="width: 100%; margin-bottom: 5px; padding: 5px;">
                    <input type="text" id="tgChatIdInput" placeholder="Chat ID (-123...)" style="width: 100%; margin-bottom: 5px; padding: 5px;">
                    <button id="tgSaveCreds" style="width: 100%; padding: 5px; background: #10b981; border: none; color: white; cursor: pointer;">Speichern & Senden</button>
                    <div style="font-size: 0.8rem; color: #aaa; margin-top: 5px;">Tipp: Erstelle eine <strong>telegram-config.js</strong> Datei (siehe telegram-config.example.js) um die Eingabe dauerhaft zu speichern.</div>
                </div>
                <div class="qt-actions">
                    <span id="tgStatusMsg" style="margin-right: 10px; font-size: 0.9rem;"></span>
                    <button id="sendToTelegramBtn" class="telegram-btn">🚀 Senden</button>
                </div>
            `;
            preview.querySelector('.telegram-preview-modal').appendChild(footer);
        }

        const sendBtn = document.getElementById('sendToTelegramBtn');
        const configForm = document.getElementById('telegramConfigForm');
        const saveBtn = document.getElementById('tgSaveCreds');
        const statusMsg = document.getElementById('tgStatusMsg');

        let currentMessage = '';

        const openPreview = async (msgPromise) => {
            content.textContent = '⏳ Generiere Report...';
            preview.style.display = 'flex'; // Overlay uses flex
            statusMsg.textContent = '';
            configForm.style.display = 'none';

            // Check if msgPromise is a promise (for daily update) or string
            let msg;
            if (msgPromise instanceof Promise) {
                msg = await msgPromise;
            } else {
                msg = msgPromise;
            }

            currentMessage = msg;
            content.textContent = msg;
        };

        if (signalBtn) {
            signalBtn.addEventListener('click', () => {
                openPreview(this.generateSignalCheckMessage());
            });
        }

        if (dailyBtn) {
            dailyBtn.addEventListener('click', () => {
                openPreview(this.generateDailyUpdateMessage());
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                preview.style.display = 'none';
            });
        }

        // Helper: pre-fill inputs from saved credentials
        const prefillInputs = () => {
            const tokenInput = document.getElementById('tgTokenInput');
            const chatIdInput = document.getElementById('tgChatIdInput');
            const creds = this.getTelegramCredentials();
            if (creds && tokenInput && chatIdInput) {
                tokenInput.value = creds.token;
                chatIdInput.value = creds.chatId;
            }
        };

        // Send Button Logic
        if (sendBtn) {
            sendBtn.addEventListener('click', async () => {
                const creds = this.getTelegramCredentials();
                if (!creds) {
                    prefillInputs();
                    configForm.style.display = 'block';
                    return;
                }

                statusMsg.textContent = '⏳ Sende...';
                const res = await this.sendTelegramMessage(currentMessage);
                if (res.success) {
                    statusMsg.textContent = '✅ Gesendet!';
                    statusMsg.style.color = '#10b981';
                } else {
                    if (res.error === 'credentials_missing') {
                        prefillInputs();
                        configForm.style.display = 'block';
                        statusMsg.textContent = '';
                    } else {
                        statusMsg.textContent = '❌ Fehler: ' + res.error;
                        statusMsg.style.color = '#ef4444';
                    }
                }
            });
        }

        // Save Credentials Logic
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const token = document.getElementById('tgTokenInput').value.trim();
                const chatId = document.getElementById('tgChatIdInput').value.trim();

                if (token && chatId) {
                    localStorage.setItem('telegram_bot_token', token);
                    localStorage.setItem('telegram_chat_id', chatId);
                    configForm.style.display = 'none';

                    // Retry sending
                    statusMsg.textContent = '⏳ Sende...';
                    const res = await this.sendTelegramMessage(currentMessage);
                    if (res.success) {
                        statusMsg.textContent = '✅ Gesendet!';
                    } else {
                        statusMsg.textContent = '❌ Fehler: ' + res.error;
                        statusMsg.style.color = '#ef4444';
                    }
                }
            });
        }
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        SmartMoneySignal.init();
        SmartMoneySignal.initTelegramPreview();
    });
} else {
    SmartMoneySignal.init();
    SmartMoneySignal.initTelegramPreview();
}
