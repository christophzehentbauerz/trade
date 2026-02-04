/**
 * BTC Market Intelligence Dashboard
 * Real-time Bitcoin market analysis with signal generation
 */

// =====================================================
// Configuration
// =====================================================

const CONFIG = {
    refreshInterval: 300000, // 5 minutes in ms
    apis: {
        coinGecko: 'https://api.coingecko.com/api/v3',
        fearGreed: 'https://api.alternative.me/fng/',
        binance: 'https://api.binance.com/api/v3',
        binanceFutures: 'https://fapi.binance.com',
        binanceFuturesData: 'https://fapi.binance.com/futures/data',
        news: 'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=BTC,Market',
        corsProxy: 'https://corsproxy.io/?'
    },
    weights: {
        technical: 0.35,
        onchain: 0.25,
        sentiment: 0.20,
        macro: 0.20
    },
    telegram: {
        botToken: '8373288870:AAFjnJdqdXGrMgyjVJjPNFT0YBtC7sz4lMA',
        chatId: '8237692575'
    }
};

// =====================================================
// State Management
// =====================================================

let state = {
    price: null,
    priceChange24h: null,
    marketCap: null,
    volume24h: null,
    ath: null,
    athChange: null,
    fearGreedIndex: null,
    fearGreedHistory: [],
    fundingRate: null,
    openInterest: null,
    openInterestRaw: null,
    longShortRatio: { long: 50, short: 50 },
    priceHistory: [],
    scores: {
        technical: 5,
        onchain: 5,
        sentiment: 5,
        macro: 5
    },
    signal: 'NEUTRAL',
    confidence: 50,
    lastUpdate: null
};

let countdownInterval = null;
let remainingSeconds = 300;
let previousSignal = 'NEUTRAL'; // Track signal changes for notifications

// =====================================================
// Notification System
// =====================================================

const NotificationSystem = {
    audioContext: null,
    notificationsEnabled: false,
    soundEnabled: true,

    // Initialize notification permissions
    async init() {
        // Check if browser supports notifications
        if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                this.notificationsEnabled = true;
            } else if (Notification.permission !== 'denied') {
                // Will request permission when user clicks the button
            }
        }

        // Load saved preferences
        const savedPrefs = localStorage.getItem('btc-notification-prefs');
        if (savedPrefs) {
            const prefs = JSON.parse(savedPrefs);
            this.soundEnabled = prefs.soundEnabled !== false;
            this.notificationsEnabled = prefs.notificationsEnabled && Notification.permission === 'granted';
        }

        this.updateUI();
    },

    // Request notification permission
    async requestPermission() {
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            this.notificationsEnabled = permission === 'granted';
            this.savePreferences();
            this.updateUI();
            return permission === 'granted';
        }
        return false;
    },

    // Toggle notifications
    toggleNotifications() {
        if (!this.notificationsEnabled && Notification.permission !== 'granted') {
            this.requestPermission();
        } else {
            this.notificationsEnabled = !this.notificationsEnabled;
            this.savePreferences();
            this.updateUI();
        }
    },

    // Toggle sound
    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        this.savePreferences();
        this.updateUI();
    },

    // Save preferences to localStorage
    savePreferences() {
        localStorage.setItem('btc-notification-prefs', JSON.stringify({
            soundEnabled: this.soundEnabled,
            notificationsEnabled: this.notificationsEnabled
        }));
    },

    // Update UI to reflect current state
    updateUI() {
        const notifBtn = document.getElementById('toggleNotifications');
        const soundBtn = document.getElementById('toggleSound');
        const statusEl = document.getElementById('notificationStatus');

        if (notifBtn) {
            notifBtn.classList.toggle('active', this.notificationsEnabled);
            notifBtn.textContent = this.notificationsEnabled ? '🔔 Benachrichtigungen AN' : '🔕 Benachrichtigungen AUS';
        }

        if (soundBtn) {
            soundBtn.classList.toggle('active', this.soundEnabled);
            soundBtn.textContent = this.soundEnabled ? '🔊 Sound AN' : '🔇 Sound AUS';
        }

        if (statusEl) {
            if (this.notificationsEnabled || this.soundEnabled) {
                statusEl.textContent = '✅ Du wirst benachrichtigt wenn ein Trade-Signal erscheint';
                statusEl.className = 'notification-status active';
            } else {
                statusEl.textContent = '⚠️ Aktiviere Benachrichtigungen um informiert zu werden';
                statusEl.className = 'notification-status inactive';
            }
        }
    },

    // Play alert sound
    playSound(type = 'signal') {
        if (!this.soundEnabled) return;

        try {
            // Create audio context on first use
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            if (type === 'long') {
                // Ascending tones for LONG
                oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
                oscillator.frequency.setValueAtTime(550, this.audioContext.currentTime + 0.1);
                oscillator.frequency.setValueAtTime(660, this.audioContext.currentTime + 0.2);
            } else if (type === 'short') {
                // Descending tones for SHORT
                oscillator.frequency.setValueAtTime(660, this.audioContext.currentTime);
                oscillator.frequency.setValueAtTime(550, this.audioContext.currentTime + 0.1);
                oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime + 0.2);
            } else {
                // Simple beep
                oscillator.frequency.setValueAtTime(520, this.audioContext.currentTime);
            }

            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.4);

            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.4);
        } catch (e) {
            console.log('Sound not available:', e);
        }
    },

    // Send browser notification
    sendNotification(title, body, type = 'signal') {
        if (!this.notificationsEnabled || Notification.permission !== 'granted') return;

        const icon = type === 'long' ? '🟢' : type === 'short' ? '🔴' : '📊';

        const notification = new Notification(title, {
            body: body,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">' + icon + '</text></svg>',
            badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">₿</text></svg>',
            tag: 'btc-signal',
            requireInteraction: true
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
        };

        // Auto close after 30 seconds
        setTimeout(() => notification.close(), 30000);
    },

    // Check for signal change and notify
    checkSignalChange(newSignal, confidence, price) {
        if (previousSignal === newSignal) return;

        const oldSignal = previousSignal;
        previousSignal = newSignal;

        // Only notify on first load if it's not neutral
        if (oldSignal === 'NEUTRAL' && newSignal === 'NEUTRAL') return;

        // Notify on LONG or SHORT signal
        if (newSignal === 'LONG') {
            const title = '🟢 LONG Signal erkannt!';
            const body = `BTC: $${price.toLocaleString()} | Konfidenz: ${Math.round(confidence)}%`;

            this.playSound('long');
            this.sendNotification(title, body, 'long');
            this.showInPageAlert('long', confidence, price);

        } else if (newSignal === 'SHORT') {
            const title = '🔴 SHORT Signal erkannt!';
            const body = `BTC: $${price.toLocaleString()} | Konfidenz: ${Math.round(confidence)}%`;

            this.playSound('short');
            this.sendNotification(title, body, 'short');
            this.showInPageAlert('short', confidence, price);

        } else if (newSignal === 'NEUTRAL' && (oldSignal === 'LONG' || oldSignal === 'SHORT')) {
            // Signal changed from active to neutral
            const title = '⚪ Signal zurückgesetzt';
            const body = 'Das aktive Signal ist wieder neutral geworden.';

            this.sendNotification(title, body, 'neutral');
        }
    },

    // Show in-page alert popup
    showInPageAlert(type, confidence, price) {
        const alertBox = document.getElementById('signalAlert');
        if (!alertBox) return;

        const emoji = type === 'long' ? '🟢' : '🔴';
        const signal = type === 'long' ? 'LONG' : 'SHORT';
        const color = type === 'long' ? 'bullish' : 'bearish';

        alertBox.className = `signal-alert ${color}`;
        alertBox.innerHTML = `
            <div class="alert-content">
                <div class="alert-icon">${emoji}</div>
                <div class="alert-text">
                    <div class="alert-title">Neues ${signal} Signal!</div>
                    <div class="alert-details">BTC: $${price.toLocaleString()} | Konfidenz: ${Math.round(confidence)}%</div>
                </div>
                <button class="alert-close" onclick="document.getElementById('signalAlert').classList.remove('show')">✕</button>
            </div>
        `;
        alertBox.classList.add('show');

        // Auto hide after 10 seconds
        setTimeout(() => {
            alertBox.classList.remove('show');
        }, 10000);
    }
};

// =====================================================
// API Fetch Functions
// =====================================================

async function fetchWithTimeout(url, timeout = 10000, headers = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, { signal: controller.signal, headers });
        clearTimeout(id);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

async function fetchPriceData() {
    const url = `${CONFIG.apis.coinGecko}/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false`;
    try {
        let data;
        try {
            data = await fetchWithTimeout(url);
        } catch (e) {
            // Fallback: try via CORS proxy
            console.warn('CoinGecko direct failed, trying CORS proxy...');
            data = await fetchWithTimeout(`${CONFIG.apis.corsProxy}${encodeURIComponent(url)}`);
        }

        state.price = data.market_data.current_price.usd;
        state.priceChange24h = data.market_data.price_change_percentage_24h;
        state.marketCap = data.market_data.market_cap.usd;
        state.volume24h = data.market_data.total_volume.usd;
        state.ath = data.market_data.ath.usd;
        state.athChange = data.market_data.ath_change_percentage.usd;

        return true;
    } catch (error) {
        console.error('Error fetching price data:', error);
        return false;
    }
}

async function fetchPriceHistory() {
    // Using hourly data for more accurate signals (7 days = ~168 hourly candles)
    const url = `${CONFIG.apis.coinGecko}/coins/bitcoin/market_chart?vs_currency=usd&days=7&interval=hourly`;
    try {
        let data;
        try {
            data = await fetchWithTimeout(url);
        } catch (e) {
            console.warn('CoinGecko history direct failed, trying CORS proxy...');
            data = await fetchWithTimeout(`${CONFIG.apis.corsProxy}${encodeURIComponent(url)}`);
        }

        state.priceHistory = data.prices.map(p => p[1]);
        return true;
    } catch (error) {
        console.error('Error fetching price history:', error);
        return false;
    }
}

async function fetchFearGreedIndex() {
    const url = `${CONFIG.apis.fearGreed}?limit=8`;
    try {
        let data;
        try {
            data = await fetchWithTimeout(url, 10000);
        } catch (e) {
            console.warn('Fear & Greed direct failed, trying CORS proxy...');
            data = await fetchWithTimeout(`${CONFIG.apis.corsProxy}${encodeURIComponent(url)}`, 10000);
        }

        if (data.data && data.data.length > 0) {
            state.fearGreedIndex = parseInt(data.data[0].value);
            state.fearGreedHistory = data.data.slice(0, 7).map(d => ({
                value: parseInt(d.value),
                classification: d.value_classification,
                timestamp: d.timestamp
            }));
        }
        return true;
    } catch (error) {
        console.error('Error fetching Fear & Greed:', error);
        state.fearGreedIndex = 50;
        return false;
    }
}

async function fetchFundingRate() {
    const url = `${CONFIG.apis.binanceFutures}/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1`;
    try {
        let data;
        try {
            data = await fetchWithTimeout(url);
        } catch (e) {
            console.warn('Binance funding direct failed, trying CORS proxy...');
            data = await fetchWithTimeout(`${CONFIG.apis.corsProxy}${encodeURIComponent(url)}`);
        }

        if (data && data.length > 0) {
            state.fundingRate = parseFloat(data[0].fundingRate) * 100;
        }
        return true;
    } catch (error) {
        console.error('Error fetching funding rate:', error);
        state.fundingRate = 0.01;
        return false;
    }
}

async function fetchOpenInterest() {
    const url = `${CONFIG.apis.binanceFutures}/fapi/v1/openInterest?symbol=BTCUSDT`;
    try {
        let data;
        try {
            data = await fetchWithTimeout(url);
        } catch (e) {
            console.warn('Binance OI direct failed, trying CORS proxy...');
            data = await fetchWithTimeout(`${CONFIG.apis.corsProxy}${encodeURIComponent(url)}`);
        }

        if (data) {
            state.openInterestRaw = parseFloat(data.openInterest);
            if (state.price) {
                state.openInterest = state.openInterestRaw * state.price;
            }
        }
        return true;
    } catch (error) {
        console.error('Error fetching open interest:', error);
        return false;
    }
}

async function fetchLongShortRatio() {
    const url = `${CONFIG.apis.binanceFuturesData}/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1`;
    try {
        let data;
        try {
            data = await fetchWithTimeout(url);
        } catch (e) {
            console.warn('Binance L/S direct failed, trying CORS proxy...');
            data = await fetchWithTimeout(`${CONFIG.apis.corsProxy}${encodeURIComponent(url)}`);
        }

        if (data && data.length > 0) {
            const ratio = parseFloat(data[0].longShortRatio);
            const longPercent = (ratio / (1 + ratio)) * 100;
            state.longShortRatio = {
                long: longPercent,
                short: 100 - longPercent
            };
        }
        return true;
    } catch (error) {
        console.error('Error fetching L/S ratio:', error);
        state.longShortRatio = { long: 48.5, short: 51.5 };
        return false;
    }
}

// =====================================================
// Technical Analysis Calculations
// =====================================================

function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = prices.length - period; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
    }

    if (losses === 0) return 100;

    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgGain / avgLoss;

    return 100 - (100 / (1 + rs));
}

function calculateEMA(prices, period) {
    if (prices.length === 0) return 0;

    const multiplier = 2 / (period + 1);
    let ema = prices[0];

    for (let i = 1; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
    }

    return ema;
}

function calculateVolatility(prices) {
    if (prices.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
        returns.push((prices[i] - prices[i - 1]) / prices[i - 1] * 100);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

    return Math.sqrt(variance);
}

function determineTrend(prices) {
    if (prices.length < 7) return 'sideways';

    const recent = prices.slice(-7);
    const older = prices.slice(-14, -7);

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    const change = ((recentAvg - olderAvg) / olderAvg) * 100;

    if (change > 3) return 'up';
    if (change < -3) return 'down';
    return 'sideways';
}

// =====================================================
// Score Calculation
// =====================================================

function calculateScores() {
    // Technical Score
    const rsi = calculateRSI(state.priceHistory);
    let techScore = 5;

    // RSI scoring
    if (rsi < 30) techScore += 2.5; // Oversold = bullish
    else if (rsi < 40) techScore += 1.5;
    else if (rsi > 70) techScore -= 2.5; // Overbought = bearish
    else if (rsi > 60) techScore -= 1.5;

    // Trend scoring
    const trend = determineTrend(state.priceHistory);
    if (trend === 'up') techScore += 1.5;
    else if (trend === 'down') techScore -= 1.5;

    // ATH distance
    if (state.athChange > -20) techScore += 0.5;
    else if (state.athChange < -40) techScore -= 1;

    state.scores.technical = Math.max(0, Math.min(10, techScore));

    // Sentiment Score (including Fear & Greed as contrarian)
    let sentimentScore = 5;

    // Fear & Greed as contrarian indicator
    if (state.fearGreedIndex <= 20) sentimentScore += 3; // Extreme fear = buy
    else if (state.fearGreedIndex <= 35) sentimentScore += 1.5;
    else if (state.fearGreedIndex >= 80) sentimentScore -= 3; // Extreme greed = sell
    else if (state.fearGreedIndex >= 65) sentimentScore -= 1.5;

    // Funding rate
    if (state.fundingRate < -0.01) sentimentScore += 1.5; // Negative = bullish
    else if (state.fundingRate > 0.05) sentimentScore -= 1.5; // High positive = bearish

    // Long/Short ratio (contrarian)
    if (state.longShortRatio.long > 60) sentimentScore -= 1; // More longs = bearish
    else if (state.longShortRatio.long < 40) sentimentScore += 1; // More shorts = bullish

    state.scores.sentiment = Math.max(0, Math.min(10, sentimentScore));

    // On-Chain Score (based on momentum)
    let onchainScore = 5;
    if (state.priceChange24h > 5) onchainScore += 2;
    else if (state.priceChange24h > 2) onchainScore += 1;
    else if (state.priceChange24h < -5) onchainScore -= 2;
    else if (state.priceChange24h < -2) onchainScore -= 1;

    state.scores.onchain = Math.max(0, Math.min(10, onchainScore));

    // Macro Score (contrarian - far from ATH is opportunity)
    let macroScore = 5;
    if (state.athChange < -30) macroScore += 2; // Far from ATH = buy opportunity
    else if (state.athChange < -15) macroScore += 1;
    else if (state.athChange > -5) macroScore -= 1; // Near ATH = sell pressure

    state.scores.macro = Math.max(0, Math.min(10, macroScore));

    // Calculate weighted total
    const weightedScore =
        state.scores.technical * CONFIG.weights.technical +
        state.scores.onchain * CONFIG.weights.onchain +
        state.scores.sentiment * CONFIG.weights.sentiment +
        state.scores.macro * CONFIG.weights.macro;

    // Determine signal and confidence
    if (weightedScore >= 6.5) {
        state.signal = 'LONG';
        state.confidence = 60 + (weightedScore - 6.5) * 10;
    } else if (weightedScore <= 3.5) {
        state.signal = 'SHORT';
        state.confidence = 60 + (3.5 - weightedScore) * 10;
    } else {
        state.signal = 'NEUTRAL';
        state.confidence = 40 + Math.random() * 20;
    }

    state.confidence = Math.min(85, Math.max(40, state.confidence));
    state.weightedScore = weightedScore;

    return weightedScore;
}

// =====================================================
// UI Update Functions
// =====================================================

function formatNumber(num, decimals = 2) {
    if (num === null || num === undefined) return '--';
    return num.toLocaleString('de-DE', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatCurrency(num) {
    if (num === null || num === undefined) return '$--';

    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;

    return `$${formatNumber(num)}`;
}

function updatePriceCard() {
    document.getElementById('btcPrice').textContent = formatNumber(state.price, 0);

    const changeEl = document.getElementById('priceChange');
    const changeValue = changeEl.querySelector('.change-value');
    changeValue.textContent = `${state.priceChange24h >= 0 ? '+' : ''}${formatNumber(state.priceChange24h)}%`;
    changeEl.className = `price-change ${state.priceChange24h >= 0 ? 'positive' : 'negative'}`;

    document.getElementById('marketCap').textContent = formatCurrency(state.marketCap);
    document.getElementById('volume24h').textContent = formatCurrency(state.volume24h);
    document.getElementById('ath').textContent = formatCurrency(state.ath);
    document.getElementById('athChange').textContent = `${formatNumber(state.athChange)}%`;
}

function updateFearGreedCard() {
    const value = state.fearGreedIndex;
    document.getElementById('fearGreedValue').textContent = value;

    // Determine label
    let label = 'Neutral';
    let color = 'var(--neutral)';

    if (value <= 20) { label = 'Extreme Fear'; color = 'var(--bearish)'; }
    else if (value <= 40) { label = 'Fear'; color = '#f97316'; }
    else if (value <= 60) { label = 'Neutral'; color = 'var(--neutral)'; }
    else if (value <= 80) { label = 'Greed'; color = '#84cc16'; }
    else { label = 'Extreme Greed'; color = 'var(--bullish)'; }

    document.getElementById('fearGreedLabel').textContent = label;

    const valueEl = document.getElementById('fearGreedValue');
    valueEl.style.color = color;
    valueEl.style.textShadow = '0 0 15px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 0, 0, 0.7), 0 2px 6px rgba(0, 0, 0, 0.6), 0 0 3px rgba(255, 255, 255, 0.3)';

    // Update gauge
    const rotation = (value / 100) * 180;
    document.getElementById('gaugeFill').style.transform = `rotate(${rotation}deg)`;

    // Update history
    const historyContainer = document.getElementById('fearGreedHistory');
    historyContainer.innerHTML = state.fearGreedHistory.slice(1, 6).map((item, i) => {
        const days = ['Gestern', 'Vor 2T', 'Vor 3T', 'Vor 4T', 'Vor 5T'];
        let itemColor = 'var(--text-secondary)';
        if (item.value <= 25) itemColor = 'var(--bearish)';
        else if (item.value <= 45) itemColor = '#f97316';
        else if (item.value >= 75) itemColor = 'var(--bullish)';
        else if (item.value >= 55) itemColor = '#84cc16';

        return `
            <div class="history-item">
                <div class="history-day">${days[i]}</div>
                <div class="history-value" style="color: ${itemColor}">${item.value}</div>
            </div>
        `;
    }).join('');

    // Interpretation
    let interpretation = '';
    if (value <= 20) {
        interpretation = '⚡ Extreme Angst = Historisch oft Kaufgelegenheit (Kontraindikator)';
    } else if (value <= 35) {
        interpretation = '📉 Angst im Markt - Potenzielle Akkumulationszone';
    } else if (value <= 65) {
        interpretation = '⚖️ Neutrales Sentiment - Keine klare Richtung';
    } else if (value <= 80) {
        interpretation = '📈 Gier im Markt - Vorsicht vor FOMO';
    } else {
        interpretation = '⚠️ Extreme Gier = Historisch oft Verkaufssignal (Kontraindikator)';
    }
    document.getElementById('fearGreedInterpretation').textContent = interpretation;
}

function updateTechnicalCard() {
    const rsi = calculateRSI(state.priceHistory);
    const trend = determineTrend(state.priceHistory);
    const volatility = calculateVolatility(state.priceHistory);
    const ema = calculateEMA(state.priceHistory, Math.min(20, state.priceHistory.length));

    // RSI
    document.getElementById('rsiValue').textContent = formatNumber(rsi, 1);
    document.getElementById('rsiMarker').style.left = `${rsi}%`;

    if (rsi < 30) {
        document.getElementById('rsiValue').className = 'indicator-value text-bullish';
    } else if (rsi > 70) {
        document.getElementById('rsiValue').className = 'indicator-value text-bearish';
    } else {
        document.getElementById('rsiValue').className = 'indicator-value';
    }

    // Trend
    const trendValue = document.getElementById('trendValue');
    const trendArrow = document.querySelector('.trend-arrow');

    trendArrow.className = 'trend-arrow ' + (trend === 'up' ? 'up' : trend === 'down' ? 'down' : 'sideways');
    trendValue.textContent = trend === 'up' ? 'Bullish' : trend === 'down' ? 'Bearish' : 'Seitwärts';
    trendValue.className = `indicator-value text-${trend === 'up' ? 'bullish' : trend === 'down' ? 'bearish' : 'neutral'}`;

    // EMA
    const emaPosition = document.getElementById('emaPosition');
    const aboveEma = state.price > ema;
    emaPosition.textContent = aboveEma ? 'ÜBER EMA' : 'UNTER EMA';
    emaPosition.className = `ema-position ${aboveEma ? 'above' : 'below'}`;
    document.getElementById('emaValue').textContent = formatCurrency(ema);

    // Volatility
    document.getElementById('volatilityValue').textContent = `${formatNumber(volatility, 1)}%`;
    document.getElementById('volatilityBar').style.width = `${Math.min(100, volatility * 20)}%`;

    // Badge
    const badge = document.getElementById('technicalBadge');
    badge.textContent = `${formatNumber(state.scores.technical, 1)}/10`;
    badge.className = `card-badge ${state.scores.technical >= 6 ? 'bullish' : state.scores.technical <= 4 ? 'bearish' : ''}`;
}

function updateDerivativesCard() {
    // Funding Rate
    const fundingEl = document.getElementById('fundingRate');
    fundingEl.textContent = `${state.fundingRate >= 0 ? '+' : ''}${formatNumber(state.fundingRate, 4)}%`;
    fundingEl.className = `derivative-value ${state.fundingRate < 0 ? 'positive' : state.fundingRate > 0.02 ? 'negative' : ''}`;

    const fundingStatus = document.getElementById('fundingStatus');
    if (state.fundingRate < -0.01) {
        fundingStatus.textContent = 'Shorts zahlen Longs → Bullish';
    } else if (state.fundingRate > 0.03) {
        fundingStatus.textContent = 'Longs zahlen Shorts → Bearish';
    } else {
        fundingStatus.textContent = 'Neutral';
    }

    // Open Interest
    document.getElementById('openInterest').textContent = formatCurrency(state.openInterest);

    // Long/Short Ratio
    document.getElementById('lsLong').style.width = `${state.longShortRatio.long}%`;
    document.getElementById('lsShort').style.width = `${state.longShortRatio.short}%`;
    document.getElementById('longPercent').textContent = `${formatNumber(state.longShortRatio.long, 1)}%`;
    document.getElementById('shortPercent').textContent = `${formatNumber(state.longShortRatio.short, 1)}%`;

    // Liquidation zones (estimated based on current price)
    const liqLongs = state.price * 0.95;
    const liqShorts = state.price * 1.05;
    document.getElementById('liqLongs').textContent = formatCurrency(liqLongs);
    document.getElementById('liqShorts').textContent = formatCurrency(liqShorts);

    // Badge
    const badge = document.getElementById('derivativesBadge');
    const derivScore = (state.fundingRate < 0 ? 6 : 4) + (state.longShortRatio.short > 50 ? 1 : -1);
    badge.textContent = `${formatNumber(derivScore, 1)}/10`;
}

function updateSentimentCard() {
    // Sentiment meter position (0-100)
    const sentimentPosition = state.scores.sentiment * 10;
    document.getElementById('sentimentMarker').style.left = `calc(${sentimentPosition}% - 4px)`;

    // Individual factors
    const fgSignal = document.getElementById('fgSignal');
    if (state.fearGreedIndex <= 25) {
        fgSignal.textContent = 'Bullish';
        fgSignal.className = 'factor-signal bullish';
        document.getElementById('fgIcon').textContent = '😱';
    } else if (state.fearGreedIndex >= 75) {
        fgSignal.textContent = 'Bearish';
        fgSignal.className = 'factor-signal bearish';
        document.getElementById('fgIcon').textContent = '🤑';
    } else {
        fgSignal.textContent = 'Neutral';
        fgSignal.className = 'factor-signal neutral';
        document.getElementById('fgIcon').textContent = '😐';
    }

    const fundingSignal = document.getElementById('fundingSignal');
    if (state.fundingRate < -0.005) {
        fundingSignal.textContent = 'Bullish';
        fundingSignal.className = 'factor-signal bullish';
    } else if (state.fundingRate > 0.03) {
        fundingSignal.textContent = 'Bearish';
        fundingSignal.className = 'factor-signal bearish';
    } else {
        fundingSignal.textContent = 'Neutral';
        fundingSignal.className = 'factor-signal neutral';
    }

    const lsSignal = document.getElementById('lsSignal');
    if (state.longShortRatio.short > 55) {
        lsSignal.textContent = 'Bullish';
        lsSignal.className = 'factor-signal bullish';
    } else if (state.longShortRatio.long > 55) {
        lsSignal.textContent = 'Bearish';
        lsSignal.className = 'factor-signal bearish';
    } else {
        lsSignal.textContent = 'Neutral';
        lsSignal.className = 'factor-signal neutral';
    }

    // Badge
    const badge = document.getElementById('sentimentBadge');
    badge.textContent = `${formatNumber(state.scores.sentiment, 1)}/10`;
    badge.className = `card-badge ${state.scores.sentiment >= 6 ? 'bullish' : state.scores.sentiment <= 4 ? 'bearish' : ''}`;
}

function updateTradeSetup() {
    const direction = document.getElementById('tradeDirection');
    const directionValue = direction.querySelector('.direction-value');

    direction.className = `trade-direction ${state.signal.toLowerCase()}`;
    directionValue.textContent = state.signal === 'LONG' ? '🟢 LONG' :
        state.signal === 'SHORT' ? '🔴 SHORT' :
            '⚪ NEUTRAL';

    // Calculate levels based on signal
    const price = state.price;

    if (state.signal === 'LONG') {
        const entry = [price * 0.98, price * 1.00];
        const sl = price * 0.94;
        const tp1 = price * 1.04;
        const tp2 = price * 1.08;
        const tp3 = price * 1.12;
        const risk = ((entry[1] - sl) / entry[1]) * 100;

        document.getElementById('entryZone').textContent = `$${formatNumber(entry[0], 0)} - $${formatNumber(entry[1], 0)}`;
        document.getElementById('stopLoss').textContent = `$${formatNumber(sl, 0)}`;
        document.getElementById('slPercent').textContent = `(-${formatNumber(risk, 1)}%)`;
        document.getElementById('tp1').textContent = `$${formatNumber(tp1, 0)}`;
        document.getElementById('tp1rr').textContent = 'R:R 1:1';
        document.getElementById('tp2').textContent = `$${formatNumber(tp2, 0)}`;
        document.getElementById('tp2rr').textContent = 'R:R 1:2';
        document.getElementById('tp3').textContent = `$${formatNumber(tp3, 0)}`;
        document.getElementById('tp3rr').textContent = 'R:R 1:3';
    } else if (state.signal === 'SHORT') {
        const entry = [price * 1.00, price * 1.02];
        const sl = price * 1.06;
        const tp1 = price * 0.96;
        const tp2 = price * 0.92;
        const tp3 = price * 0.88;
        const risk = ((sl - entry[0]) / entry[0]) * 100;

        document.getElementById('entryZone').textContent = `$${formatNumber(entry[0], 0)} - $${formatNumber(entry[1], 0)}`;
        document.getElementById('stopLoss').textContent = `$${formatNumber(sl, 0)}`;
        document.getElementById('slPercent').textContent = `(+${formatNumber(risk, 1)}%)`;
        document.getElementById('tp1').textContent = `$${formatNumber(tp1, 0)}`;
        document.getElementById('tp1rr').textContent = 'R:R 1:1';
        document.getElementById('tp2').textContent = `$${formatNumber(tp2, 0)}`;
        document.getElementById('tp2rr').textContent = 'R:R 1:2';
        document.getElementById('tp3').textContent = `$${formatNumber(tp3, 0)}`;
        document.getElementById('tp3rr').textContent = 'R:R 1:3';
    } else {
        document.getElementById('entryZone').textContent = 'Kein Trade empfohlen';
        document.getElementById('stopLoss').textContent = '--';
        document.getElementById('slPercent').textContent = '';
        document.getElementById('tp1').textContent = '--';
        document.getElementById('tp1rr').textContent = '';
        document.getElementById('tp2').textContent = '--';
        document.getElementById('tp2rr').textContent = '';
        document.getElementById('tp3').textContent = '--';
        document.getElementById('tp3rr').textContent = '';
    }

    // Recommendations
    const positionSize = state.confidence > 70 ? '3%' : state.confidence > 55 ? '2%' : '1%';
    const maxLeverage = state.confidence > 70 ? '5x' : state.confidence > 55 ? '3x' : '2x';

    document.getElementById('positionSize').textContent = positionSize;
    document.getElementById('maxLeverage').textContent = maxLeverage;
}

function updateKeyLevels() {
    const price = state.price;

    // Resistances
    const resistances = [
        { price: price * 1.03, desc: 'Kurzfristig' },
        { price: price * 1.06, desc: 'Psychologisch' },
        { price: price * 1.10, desc: 'Wöchentlich' },
        { price: state.ath, desc: 'ATH' }
    ].sort((a, b) => a.price - b.price);

    document.getElementById('resistancesList').innerHTML = resistances.map(r =>
        `<li><span class="level-price">$${formatNumber(r.price, 0)}</span><span class="level-desc">${r.desc}</span></li>`
    ).join('');

    // Supports
    const supports = [
        { price: price * 0.97, desc: 'Kurzfristig' },
        { price: price * 0.94, desc: 'Täglich' },
        { price: price * 0.90, desc: 'Wöchentlich' },
        { price: price * 0.85, desc: 'Major Support' }
    ].sort((a, b) => b.price - a.price);

    document.getElementById('supportsList').innerHTML = supports.map(s =>
        `<li><span class="level-price">$${formatNumber(s.price, 0)}</span><span class="level-desc">${s.desc}</span></li>`
    ).join('');
}

function updateRiskFactors() {
    const price = state.price;

    // Invalidation factors
    const invalidations = [];

    if (state.signal === 'LONG') {
        invalidations.push(`Daily Close unter $${formatNumber(price * 0.94, 0)}`);
        invalidations.push('Fear & Greed steigt über 60 ohne Preisanstieg');
        invalidations.push('Funding Rate wird stark positiv (>0.05%)');
    } else if (state.signal === 'SHORT') {
        invalidations.push(`Daily Close über $${formatNumber(price * 1.06, 0)}`);
        invalidations.push('Fear & Greed fällt unter 25');
        invalidations.push('Massive ETF-Zuflüsse');
    } else {
        invalidations.push('Klarer Ausbruch aus der Range');
        invalidations.push('Extreme Sentiment-Veränderung');
    }

    document.getElementById('invalidationList').innerHTML = invalidations.map(i =>
        `<li>${i}</li>`
    ).join('');

    // Upcoming events
    const events = [
        'FOMC Meeting - Zinsentscheid',
        'US CPI Daten - Inflation',
        'ETF Flow Report - Wöchentlich'
    ];

    document.getElementById('eventsList').innerHTML = events.map(e =>
        `<li>${e}</li>`
    ).join('');
}

function updateScoreCard() {
    const weightedScore = calculateScores();

    // Individual scores
    const scores = [
        { id: 'tech', value: state.scores.technical },
        { id: 'onchain', value: state.scores.onchain },
        { id: 'sentiment', value: state.scores.sentiment },
        { id: 'macro', value: state.scores.macro }
    ];

    scores.forEach(s => {
        const fill = document.getElementById(`${s.id}ScoreFill`);
        const valueEl = document.getElementById(`${s.id}Score`);

        fill.style.width = `${s.value * 10}%`;
        fill.style.background = s.value >= 6 ? 'var(--bullish)' :
            s.value <= 4 ? 'var(--bearish)' :
                'var(--neutral)';
        valueEl.textContent = `${formatNumber(s.value, 1)}/10`;
    });

    // Total score
    document.getElementById('totalScore').textContent = `${formatNumber(weightedScore, 1)}/10`;
}

function updateSignalBanner() {
    const banner = document.getElementById('signalBanner');
    const signalValue = document.getElementById('primarySignal');
    const confidenceFill = document.getElementById('confidenceFill');
    const confidenceValue = document.getElementById('confidenceValue');
    const summary = document.getElementById('signalSummary');
    const explanation = document.getElementById('signalExplanationContent');

    banner.className = `signal-banner ${state.signal.toLowerCase()}`;
    signalValue.textContent = state.signal;
    confidenceFill.style.width = `${state.confidence}%`;
    confidenceValue.textContent = `${Math.round(state.confidence)}%`;

    // Generate summary and explanation
    let summaryText = '';
    let explanationText = '';

    if (state.signal === 'LONG') {
        summaryText = `Überverkaufte Bedingungen (RSI, F&G: ${state.fearGreedIndex}) und negative Funding Rates signalisieren Rebound-Potenzial.`;
        explanationText = `<strong>LONG bedeutet:</strong> Die Daten deuten auf steigende Preise hin. 
            Der Gesamtscore liegt bei ${formatNumber(calculateWeightedScore(), 1)}/10 (≥6.5 = LONG). 
            <br><br><strong>Warum LONG?</strong><br>
            • Fear & Greed ist bei ${state.fearGreedIndex} - ${state.fearGreedIndex < 35 ? 'Angst im Markt ist historisch ein Kaufsignal (Kontraindikator)' : 'nicht extrem, aber andere Faktoren sind bullish'}<br>
            • RSI zeigt ${calculateRSI(state.priceHistory) < 40 ? 'überverkaufte Bedingungen' : 'neutralen bis bullischen Trend'}<br>
            • Funding Rate ist ${state.fundingRate < 0 ? 'negativ → Shorts zahlen → bullish' : 'neutral'}`;
    } else if (state.signal === 'SHORT') {
        summaryText = `Überkaufte Bedingungen und hohe Gier im Markt deuten auf Korrektur-Risiko hin.`;
        explanationText = `<strong>SHORT bedeutet:</strong> Die Daten deuten auf fallende Preise hin. 
            Der Gesamtscore liegt bei ${formatNumber(calculateWeightedScore(), 1)}/10 (≤3.5 = SHORT). 
            <br><br><strong>Warum SHORT?</strong><br>
            • Fear & Greed ist bei ${state.fearGreedIndex} - ${state.fearGreedIndex > 65 ? 'Extreme Gier ist historisch ein Verkaufssignal (Kontraindikator)' : 'andere Faktoren sind bearish'}<br>
            • RSI zeigt ${calculateRSI(state.priceHistory) > 60 ? 'überkaufte Bedingungen' : 'neutralen bis bearischen Trend'}<br>
            • Viele Trader sind long positioniert → Kontraindikator`;
    } else {
        summaryText = `Gemischte Signale - kein klarer Vorteil für Long oder Short. Abwarten empfohlen.`;
        explanationText = `<strong>NEUTRAL bedeutet:</strong> Kein Trade empfohlen. 
            Der Gesamtscore liegt bei ${formatNumber(calculateWeightedScore(), 1)}/10 (zwischen 3.5 und 6.5 = NEUTRAL).
            <br><br><strong>Warum kein Trade?</strong><br>
            Die Indikatoren geben widersprüchliche Signale. Ein Trade ohne klaren Edge ist Glücksspiel.`;
    }

    summary.textContent = summaryText;
    explanation.innerHTML = explanationText;

    // Update no-trade warning box
    updateNoTradeWarning();

    // Update score interpretation
    updateScoreInterpretation();

    // Check for signal change and notify user
    NotificationSystem.checkSignalChange(state.signal, state.confidence, state.price);
}

function calculateWeightedScore() {
    return state.scores.technical * CONFIG.weights.technical +
        state.scores.onchain * CONFIG.weights.onchain +
        state.scores.sentiment * CONFIG.weights.sentiment +
        state.scores.macro * CONFIG.weights.macro;
}

function updateNoTradeWarning() {
    const warningBox = document.getElementById('noTradeWarning');
    const reasonsEl = document.getElementById('noTradeReasons');

    if (state.signal === 'NEUTRAL') {
        warningBox.style.display = 'flex';

        const reasons = [];
        const score = calculateWeightedScore();
        const rsi = calculateRSI(state.priceHistory);

        // Collect all the reasons why no trade is recommended
        reasons.push(`<strong>Score ist ${formatNumber(score, 1)}/10</strong> - liegt zwischen 3.5 und 6.5, also im neutralen Bereich`);

        if (rsi >= 40 && rsi <= 60) {
            reasons.push(`<strong>RSI ist bei ${formatNumber(rsi, 0)}</strong> - weder überkauft noch überverkauft (neutral Zone)`);
        }

        if (state.fearGreedIndex >= 35 && state.fearGreedIndex <= 65) {
            reasons.push(`<strong>Fear & Greed ist bei ${state.fearGreedIndex}</strong> - weder extreme Angst noch extreme Gier`);
        }

        if (Math.abs(state.fundingRate) < 0.01) {
            reasons.push(`<strong>Funding Rate ist bei ${formatNumber(state.fundingRate, 4)}%</strong> - kein klares Signal von den Futures-Märkten`);
        }

        const trend = determineTrend(state.priceHistory);
        if (trend === 'sideways') {
            reasons.push(`<strong>Trend ist seitwärts</strong> - keine klare Richtung im Preisverlauf`);
        }

        if (state.longShortRatio.long >= 45 && state.longShortRatio.long <= 55) {
            reasons.push(`<strong>Long/Short Ratio ist ausgeglichen</strong> (${formatNumber(state.longShortRatio.long, 0)}/${formatNumber(state.longShortRatio.short, 0)}) - keine extreme Positionierung`);
        }

        reasons.push(`<strong>Empfehlung:</strong> Warte auf eindeutigere Signale. Ein guter Trade hat einen klaren statistischen Vorteil.`);

        reasonsEl.innerHTML = '<ul>' + reasons.map(r => `<li>${r}</li>`).join('') + '</ul>';
    } else {
        warningBox.style.display = 'none';
    }
}

function updateScoreInterpretation() {
    const interpretEl = document.getElementById('scoreInterpretation');
    const score = calculateWeightedScore();

    let html = '';
    let cssClass = '';

    if (score >= 6.5) {
        cssClass = 'bullish';
        html = `<strong>Score ≥ 6.5 = LONG Signal</strong><br>
                Alle Faktoren zusammen ergeben einen bullischen Bias. 
                Je höher der Score, desto stärker das Signal.`;
    } else if (score <= 3.5) {
        cssClass = 'bearish';
        html = `<strong>Score ≤ 3.5 = SHORT Signal</strong><br>
                Alle Faktoren zusammen ergeben einen bearischen Bias. 
                Je niedriger der Score, desto stärker das Signal.`;
    } else {
        cssClass = 'neutral';
        html = `<strong>Score zwischen 3.5 und 6.5 = KEIN TRADE</strong><br>
                Die Indikatoren sind zu gemischt für eine klare Empfehlung. 
                Warte auf extremere Werte (Score unter 3.5 oder über 6.5).`;
    }

    interpretEl.className = `score-interpretation ${cssClass}`;
    interpretEl.innerHTML = html;
}

function updateLastUpdate() {
    state.lastUpdate = new Date();
    const timeStr = state.lastUpdate.toLocaleTimeString('de-DE');
    document.getElementById('lastUpdate').textContent = timeStr;
}

// =====================================================
// Main Update Function
// =====================================================

async function updateDashboard() {
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn.classList.add('loading');

    try {
        // Fetch all data in parallel
        await Promise.all([
            fetchPriceData(),
            fetchPriceHistory(),
            fetchFearGreedIndex(),
            fetchFundingRate(),
            fetchOpenInterest(),
            fetchLongShortRatio()
        ]);

        // Recalculate OI with price now available (fixes race condition)
        if (state.price && state.openInterestRaw && !state.openInterest) {
            state.openInterest = state.openInterestRaw * state.price;
        }

        // If price failed, show error but don't block entire UI
        if (!state.price) {
            console.warn('Price data unavailable');
            document.getElementById('primarySignal').textContent = 'FEHLER';
            document.getElementById('signalSummary').textContent =
                'API-Daten konnten nicht geladen werden. Versuche es in 1 Minute erneut (Klick auf Refresh oder Taste R).';
            document.getElementById('btcPrice').textContent = 'API Fehler';
            updateLastUpdate();
        } else {
            // Calculate scores
            calculateScores();

            // Update all UI components
            updatePriceCard();
            updateFearGreedCard();
            updateTechnicalCard();
            updateDerivativesCard();
            updateSentimentCard();
            updateTradeSetup();
            updateKeyLevels();
            updateRiskFactors();
            updateScoreCard();
            updateSignalBanner();
            updateLastUpdate();

            console.log('Dashboard updated successfully');
        }
    } catch (error) {
        console.error('Error updating dashboard:', error);
        document.getElementById('primarySignal').textContent = 'FEHLER';
        document.getElementById('signalSummary').textContent =
            'Ein Fehler ist aufgetreten. Versuche es in 1 Minute erneut.';
    } finally {
        refreshBtn.classList.remove('loading');
        resetCountdown();
    }
}

// =====================================================
// Countdown Timer
// =====================================================

function resetCountdown() {
    remainingSeconds = 300;
    updateCountdownDisplay();
}

function updateCountdownDisplay() {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    document.getElementById('countdown').textContent =
        `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
        remainingSeconds--;
        updateCountdownDisplay();

        if (remainingSeconds <= 0) {
            updateDashboard();
        }
    }, 1000);
}

// =====================================================
// Backtest Display Functions
// =====================================================

async function runBacktestAndDisplay() {
    const loadingEl = document.getElementById('backtestLoading');
    const resultsEl = document.getElementById('backtestResults');
    const emptyEl = document.getElementById('backtestEmpty');
    const btnEl = document.getElementById('runBacktestBtn');

    // Show loading
    loadingEl.style.display = 'block';
    resultsEl.style.display = 'none';
    emptyEl.style.display = 'none';
    btnEl.disabled = true;
    btnEl.textContent = '⏳ Läuft...';

    try {
        // Run backtest with 60 trades over 1 year
        const results = await Backtester.runBacktest(60);

        if (!results) {
            throw new Error('Backtest failed');
        }

        // Log all signal dates to console
        console.log('📊 Backtest Signal History:');
        results.trades.forEach((trade, i) => {
            const icon = trade.direction === 'LONG' ? '🟢' : '🔴';
            const outcome = trade.outcome === 'WIN' ? '✅' : trade.outcome === 'LOSS' ? '❌' : '⏱️';
            console.log(`${i + 1}. ${icon} ${trade.direction} am ${trade.date} → ${outcome} ${trade.profit.toFixed(2)}%`);
        });

        // Hide loading, show results
        loadingEl.style.display = 'none';
        resultsEl.style.display = 'block';

        // Display results
        displayBacktestResults(results);

    } catch (error) {
        console.error('Backtest error:', error);
        alert('Backtest fehlgeschlagen. Bitte versuche es später erneut.');
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
    } finally {
        btnEl.disabled = false;
        btnEl.textContent = '🔬 Backtest Starten';
    }
}

function displayBacktestResults(results) {
    // Win rate and rating
    const winRate = results.winRate.toFixed(1);
    document.getElementById('backtestWinRate').textContent = `${results.wins}/${results.totalTrades} (${winRate}%)`;

    const rating = Backtester.getPerformanceRating(results.winRate);
    const ratingEl = document.getElementById('backtestRating');
    ratingEl.textContent = `${rating.emoji} ${rating.rating}`;
    ratingEl.style.color = rating.color;

    // Summary stats
    document.getElementById('backtestTotalTrades').textContent = results.totalTrades;
    document.getElementById('backtestAvgWin').textContent = `+${results.avgWin.toFixed(2)}%`;
    document.getElementById('backtestAvgLoss').textContent = `${results.avgLoss.toFixed(2)}%`;

    const totalReturn = results.totalReturn.toFixed(1);
    const totalReturnEl = document.getElementById('backtestTotalReturn');
    totalReturnEl.textContent = `${totalReturn > 0 ? '+' : ''}${totalReturn}%`;
    totalReturnEl.className = `summary-value ${totalReturn > 0 ? 'text-bullish' : 'text-bearish'}`;

    // Breakdown
    document.getElementById('backtestWins').textContent = results.wins;
    document.getElementById('backtestLosses').textContent = results.losses;

    if (results.bestTrade) {
        document.getElementById('backtestBestTrade').textContent =
            `+${results.bestTrade.profit.toFixed(2)}% (${results.bestTrade.date}, ${results.bestTrade.direction})`;
    }

    if (results.worstTrade) {
        document.getElementById('backtestWorstTrade').textContent =
            `${results.worstTrade.profit.toFixed(2)}% (${results.worstTrade.date}, ${results.worstTrade.direction})`;
    }

    // Failure analysis
    document.getElementById('failureStopLoss').textContent = results.failureReasons.stopLossHit;
    document.getElementById('failureTimeout').textContent = results.failureReasons.timeout;

    // Trade list (newest first - #1 is the most recent trade)
    const tradeListEl = document.getElementById('backtestTradeList');
    const sortedTrades = [...results.trades].sort((a, b) => new Date(b.date) - new Date(a.date));

    tradeListEl.innerHTML = sortedTrades.map((trade, i) => {
        const profitClass = trade.profit > 0 ? 'text-bullish' : 'text-bearish';
        const outcomeIcon = trade.outcome === 'WIN' ? '✅' : trade.outcome === 'LOSS' ? '❌' : '⏱️';
        const confScore = trade.confluenceScore || 0;
        const confClass = confScore >= 7 ? 'text-bullish' : confScore >= 5 ? 'text-secondary' : 'text-muted';

        return `
            <div class="trade-item">
                <div class="trade-number">#${i + 1}</div>
                <div class="trade-info">
                    <div class="trade-main">
                        <span class="trade-direction ${trade.direction.toLowerCase()}">${trade.direction}</span>
                        <span class="trade-date">${trade.date}</span>
                        <span class="${confClass}" style="font-size: 0.7rem; font-weight: 600;">⭐${confScore}/10</span>
                    </div>
                    <div class="trade-levels" style="font-size: 0.75rem; color: var(--text-secondary); margin: 4px 0;">
                        <span>📍 Entry: $${formatNumber(trade.entryPrice, 0)}</span>
                        <span style="margin-left: 12px;">🛑 SL: $${formatNumber(trade.stopLoss, 0)}</span>
                        <span style="margin-left: 12px;">🎯 TP: $${formatNumber(trade.tp1, 0)}</span>
                    </div>
                    <div class="trade-result">
                        <span class="trade-outcome">${outcomeIcon} ${trade.outcome}</span>
                        <span class="trade-profit ${profitClass}">${trade.profit > 0 ? '+' : ''}${trade.profit.toFixed(2)}%</span>
                        <span class="trade-days">${trade.exitDay}d</span>
                        ${trade.exitPrice ? `<span style="font-size: 0.7rem; color: var(--text-muted);">Exit: $${formatNumber(trade.exitPrice, 0)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// Event Listeners & Initialization
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize notification system
    NotificationSystem.init();

    // Initial load
    updateDashboard();
    startCountdown();

    // Manual refresh button
    document.getElementById('refreshBtn').addEventListener('click', () => {
        updateDashboard();
    });

    // Notification toggle buttons
    const notifBtn = document.getElementById('toggleNotifications');
    if (notifBtn) {
        notifBtn.addEventListener('click', () => NotificationSystem.toggleNotifications());
    }

    const soundBtn = document.getElementById('toggleSound');
    if (soundBtn) {
        soundBtn.addEventListener('click', () => NotificationSystem.toggleSound());
    }

    // Test notification button
    const testBtn = document.getElementById('testNotification');
    if (testBtn) {
        testBtn.addEventListener('click', () => {
            NotificationSystem.playSound('long');
            NotificationSystem.showInPageAlert('long', 75, state.price || 100000);
        });
    }

    // Telegram Test button
    const telegramTestBtn = document.getElementById('testTelegram');
    if (telegramTestBtn) {
        telegramTestBtn.addEventListener('click', async () => {
            telegramTestBtn.disabled = true;
            telegramTestBtn.innerHTML = '⏳ Sende...';

            try {
                const lastUpdate = document.getElementById('lastUpdate')?.textContent || 'Unbekannt';
                const signalEmoji = state.signal === 'LONG' ? '🟢' : state.signal === 'SHORT' ? '🔴' : '⚪';
                const price = state.price ? `$${state.price.toLocaleString()}` : 'Laden...';
                const score = state.weightedScore ? state.weightedScore.toFixed(1) : '?';
                const confidence = state.confidence ? state.confidence.toFixed(0) : '?';
                const fearGreed = state.fearGreedIndex || '?';

                const message = `✅ <b>Telegram Test erfolgreich!</b>\n\n📊 <b>Aktueller Status:</b>\n💰 Preis: ${price}\n${signalEmoji} Signal: ${state.signal || 'NEUTRAL'}\n📈 Score: ${score}/10\n🎯 Konfidenz: ${confidence}%\n😱 Fear & Greed: ${fearGreed}\n\n⏰ <b>Letztes Update:</b> ${lastUpdate}\n🌐 <b>Gesendet von:</b> Dashboard\n\n✅ Bot verbunden und funktioniert!`;

                const response = await fetch(`https://api.telegram.org/bot${CONFIG.telegram.botToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: CONFIG.telegram.chatId,
                        text: message,
                        parse_mode: 'HTML'
                    })
                });

                const result = await response.json();

                if (result.ok) {
                    telegramTestBtn.innerHTML = '✅ Gesendet!';
                    setTimeout(() => {
                        telegramTestBtn.innerHTML = '📱 Telegram Test';
                        telegramTestBtn.disabled = false;
                    }, 2000);
                } else {
                    throw new Error(result.description || 'Telegram API Fehler');
                }
            } catch (error) {
                console.error('Telegram test failed:', error);
                telegramTestBtn.innerHTML = '❌ Fehler';
                setTimeout(() => {
                    telegramTestBtn.innerHTML = '📱 Telegram Test';
                    telegramTestBtn.disabled = false;
                }, 2000);
            }
        });
    }

    // Daily Report button
    const dailyReportBtn = document.getElementById('sendDailyReport');
    if (dailyReportBtn) {
        dailyReportBtn.addEventListener('click', async () => {
            dailyReportBtn.disabled = true;
            dailyReportBtn.innerHTML = '⏳ Generiere...';

            try {
                // Helpers for report generation (local scope)
                const calcRSI = (prices) => {
                    if (!prices || prices.length < 14) return 50;
                    let gains = 0, losses = 0;
                    for (let i = 1; i < 14; i++) {
                        const change = prices[i] - prices[i - 1];
                        if (change > 0) gains += change;
                        else losses -= change;
                    }
                    const avgGain = gains / 14;
                    const avgLoss = losses / 14;
                    if (avgLoss === 0) return 100;
                    const rs = avgGain / avgLoss;
                    return 100 - (100 / (1 + rs));
                };

                const getTrend = (prices) => {
                    if (!prices || prices.length < 7) return 'sideways';
                    const recent = prices.slice(-7);
                    const older = prices.slice(-14, -7);
                    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
                    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
                    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
                    if (change > 3) return 'bullish';
                    if (change < -3) return 'bearish';
                    return 'sideways';
                };

                // Generate Report
                const rsi = calcRSI(state.priceHistory);
                const trend = getTrend(state.priceHistory);
                const date = new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

                let sentimentText = "";
                const fg = state.fearGreedIndex || 50;
                if (fg < 25) sentimentText = "Extreme Angst herrscht im Markt. Historisch oft gute Kaufgelegenheiten, aber Vorsicht ist geboten.";
                else if (fg < 45) sentimentText = "Der Markt ist ängstlich. Investoren sind zurückhaltend.";
                else if (fg > 75) sentimentText = "Extreme Gier dominiert. Der Markt könnte überhitzt sein (Korrekturgefahr).";
                else sentimentText = "Die Marktstimmung ist neutral ausgeglichen.";

                let technicalAnalysis = "";
                if (trend === 'bullish') technicalAnalysis = "Der Trend ist aufwärts gerichtet (Bullish).";
                else if (trend === 'bearish') technicalAnalysis = "Der Trend ist abwärts gerichtet (Bearish).";
                else technicalAnalysis = "Der Markt bewegt sich seitwärts ohne klare Richtung.";

                if (rsi < 30) technicalAnalysis += " Der RSI deutet auf einen überverkauften Zustand hin (Rebound möglich).";
                else if (rsi > 70) technicalAnalysis += " Der RSI signalisiert einen überkauften Markt (Rücksetzer möglich).";

                let message = `🌅 <b>Manuelles BTC Update</b>\n`;
                message += `📅 ${date}\n\n`;

                message += `<b>💰 Marktübersicht:</b>\n`;
                message += `BTC Pries: <b>$${(state.price || 0).toLocaleString()}</b> (${(state.priceChange24h || 0) > 0 ? '+' : ''}${(state.priceChange24h || 0).toFixed(2)}%)\n`;
                message += `Fear & Greed: <b>${fg}</b> (${fg < 35 ? 'Angst' : fg > 65 ? 'Gier' : 'Neutral'})\n`;
                message += `Score: <b>${(state.weightedScore || 0).toFixed(1)}/10</b>\n\n`;

                message += `<b>🔬 Analyse & Bewertung:</b>\n`;
                message += `<i>"${sentimentText} ${technicalAnalysis}"</i>\n\n`;

                message += `<b>📊 Die Faktoren heute:</b>\n`;
                message += `• Technik (${(CONFIG.weights.technical * 100).toFixed(0)}%): <b>${(state.scores.technical || 5).toFixed(1)}/10</b>\n`;
                message += `• On-Chain (${(CONFIG.weights.onchain * 100).toFixed(0)}%): <b>${(state.scores.onchain || 5).toFixed(1)}/10</b>\n`;
                message += `• Sentiment (${(CONFIG.weights.sentiment * 100).toFixed(0)}%): <b>${(state.scores.sentiment || 5).toFixed(1)}/10</b>\n`;
                message += `• Macro (${(CONFIG.weights.macro * 100).toFixed(0)}%): <b>${(state.scores.macro || 5).toFixed(1)}/10</b>\n\n`;

                message += `<b>🎯 Tages-Fazit:</b>\n`;
                if (state.signal === 'LONG') {
                    message += `🟢 <b>Guter Tag für Longs!</b>\n`;
                    message += `Die Indikatoren sprechen für steigende Kurse. Der Markt zeigt Stärke. Suche nach Entries bei Rücksetzern.\n`;
                } else if (state.signal === 'SHORT') {
                    message += `🔴 <b>Vorsicht - Eher Short!</b>\n`;
                    message += `Der Trend ist schwach und Risiken überwiegen. Es könnten weitere Abverkäufe drohen.\n`;
                } else {
                    message += `⚪ <b>Neutral - Abwarten.</b>\n`;
                    message += `Keine klare Richtung erkennbar. Kapital schützen und auf besseres Signal warten.\n`;
                }

                message += `\n<i>Manueller Report vom Dashboard</i> 📡`;

                // Send to Telegram
                const response = await fetch(`https://api.telegram.org/bot${CONFIG.telegram.botToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: CONFIG.telegram.chatId,
                        text: message,
                        parse_mode: 'HTML'
                    })
                });

                const result = await response.json();

                if (result.ok) {
                    dailyReportBtn.innerHTML = '✅ Gesendet!';
                    setTimeout(() => {
                        dailyReportBtn.innerHTML = '📰 Daily Report';
                        dailyReportBtn.disabled = false;
                    }, 2000);
                } else {
                    throw new Error(result.description || 'Telegram API Fehler');
                }
            } catch (error) {
                console.error('Report generation failed:', error);
                dailyReportBtn.innerHTML = '❌ Fehler';
                setTimeout(() => {
                    dailyReportBtn.innerHTML = '📰 Daily Report';
                    dailyReportBtn.disabled = false;
                }, 2000);
            }
        });
    }

    // Trade Analysis button
    const tradeAnalysisBtn = document.getElementById('tradeAnalysisBtn');
    if (tradeAnalysisBtn) {
        tradeAnalysisBtn.addEventListener('click', async () => {
            await showLiveAnalysis();
        });
    }

    // Close Analysis button
    const closeAnalysisBtn = document.getElementById('closeAnalysisBtn');
    if (closeAnalysisBtn) {
        closeAnalysisBtn.addEventListener('click', () => {
            document.getElementById('analysisCardContainer').style.display = 'none';
        });
    }

    // Backtest button
    const backtestBtn = document.getElementById('runBacktestBtn');
    if (backtestBtn) {
        backtestBtn.addEventListener('click', async () => {
            await runBacktestAndDisplay();
        });
    }

    // Keyboard shortcut (R to refresh)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'r' || e.key === 'R') {
            if (!e.ctrlKey && !e.metaKey) {
                updateDashboard();
            }
        }
    });

    // =====================================================
    // News Integration with Sentiment Analysis
    // =====================================================

    // Sentiment keywords for analysis
    const SENTIMENT_KEYWORDS = {
        bullish: [
            // English
            'surge', 'surges', 'soar', 'soars', 'rally', 'rallies', 'bullish', 'breakout',
            'all-time high', 'ath', 'record high', 'gain', 'gains', 'pump', 'pumping',
            'adoption', 'institutional', 'etf approval', 'etf approved', 'spot etf',
            'buy signal', 'accumulation', 'accumulating', 'whales buying', 'inflow', 'inflows',
            'upgrade', 'upgraded', 'growth', 'growing', 'moon', 'mooning', 'explode', 'explodes',
            'milestone', 'breakthrough', 'partnership', 'integration', 'launch', 'launches',
            'recovery', 'recovers', 'rebounds', 'rebound', 'positive', 'optimistic', 'confident',
            'support', 'supporting', 'backed', 'backs', 'endorses', 'endorsement',
            'bitcoin reserve', 'strategic reserve', 'nation adopts', 'country adopts',
            // German
            'steigt', 'anstieg', 'rallye', 'durchbruch', 'allzeithoch', 'rekord',
            'kursgewinne', 'aufwärts', 'bullenmarkt', 'kaufsignal', 'zuflüsse'
        ],
        bearish: [
            // English
            'crash', 'crashes', 'plunge', 'plunges', 'dump', 'dumps', 'dumping',
            'bearish', 'breakdown', 'sell-off', 'selloff', 'selling', 'capitulation',
            'fear', 'panic', 'collapse', 'collapses', 'drop', 'drops', 'fall', 'falls',
            'decline', 'declines', 'loss', 'losses', 'risk', 'risky', 'warning',
            'ban', 'bans', 'banned', 'regulation', 'crackdown', 'lawsuit', 'sue', 'sued',
            'hack', 'hacked', 'exploit', 'vulnerability', 'scam', 'fraud', 'ponzi',
            'bankruptcy', 'bankrupt', 'insolvent', 'liquidation', 'liquidated',
            'outflow', 'outflows', 'withdraw', 'withdrawals', 'flee', 'fleeing',
            'bearish', 'correction', 'bubble', 'overvalued', 'concern', 'concerns',
            'fud', 'uncertainty', 'doubt', 'skeptic', 'skeptical',
            // German
            'absturz', 'einbruch', 'verlust', 'fällt', 'sinkt', 'bärenmarkt',
            'verkaufsdruck', 'panik', 'warnung', 'verbot', 'regulierung'
        ]
    };

    function analyzeSentiment(text) {
        if (!text) return { sentiment: 'neutral', score: 0, keywords: [] };

        const lowerText = text.toLowerCase();
        let bullishScore = 0;
        let bearishScore = 0;
        const foundKeywords = [];

        // Check for bullish keywords
        SENTIMENT_KEYWORDS.bullish.forEach(keyword => {
            if (lowerText.includes(keyword.toLowerCase())) {
                bullishScore++;
                foundKeywords.push({ word: keyword, type: 'bullish' });
            }
        });

        // Check for bearish keywords
        SENTIMENT_KEYWORDS.bearish.forEach(keyword => {
            if (lowerText.includes(keyword.toLowerCase())) {
                bearishScore++;
                foundKeywords.push({ word: keyword, type: 'bearish' });
            }
        });

        // Determine overall sentiment
        const netScore = bullishScore - bearishScore;
        let sentiment = 'neutral';

        if (netScore >= 2) {
            sentiment = 'bullish';
        } else if (netScore <= -2) {
            sentiment = 'bearish';
        } else if (netScore === 1) {
            sentiment = 'bullish';
        } else if (netScore === -1) {
            sentiment = 'bearish';
        }

        return {
            sentiment,
            score: netScore,
            bullishCount: bullishScore,
            bearishCount: bearishScore,
            keywords: foundKeywords
        };
    }

    function getSentimentIcon(sentiment) {
        switch (sentiment) {
            case 'bullish': return '🟢';
            case 'bearish': return '🔴';
            default: return '⚪';
        }
    }

    function getSentimentLabel(sentiment) {
        switch (sentiment) {
            case 'bullish': return 'Bullish';
            case 'bearish': return 'Bearish';
            default: return 'Neutral';
        }
    }

    async function fetchNewsWithSentiment() {
        try {
            const url = CONFIG.apis.news;
            console.log('Fetching news with sentiment analysis...');
            let data;

            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                data = await response.json();
            } catch (e) {
                console.warn('Direct news fetch failed, trying proxy...', e);
                const proxyUrl = `${CONFIG.apis.corsProxy}${encodeURIComponent(url)}`;
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error(`Proxy error! status: ${response.status}`);
                data = await response.json();
            }

            if (data && data.Data && data.Data.length > 0) {
                const newsWithSentiment = data.Data.slice(0, 6).map(item => {
                    const combinedText = `${item.title} ${item.body}`;
                    const sentiment = analyzeSentiment(combinedText);
                    return { ...item, sentiment };
                });

                console.log(`News fetched with sentiment: ${newsWithSentiment.length} items`);
                renderNewsWithSentiment(newsWithSentiment);

                // Also update the old news grid if it exists
                renderNews(data.Data.slice(0, 4));
            } else {
                console.warn('No news data found in response:', data);
                showNewsError('Keine Nachrichten verfügbar');
            }
        } catch (error) {
            console.error('Error fetching news:', error);
            showNewsError(error.message);
        }
    }

    function showNewsError(message) {
        const newsGridMain = document.getElementById('news-grid-main');
        if (newsGridMain) {
            newsGridMain.innerHTML = `
                <div class="error-message" style="grid-column: 1/-1; padding: 40px; color: #ff6b6b; text-align: center; background: rgba(255,107,107,0.1); border-radius: 12px;">
                    ⚠️ News konnten nicht geladen werden.<br>
                    <small style="opacity: 0.7; margin-top: 8px; display: block;">${message}</small>
                    <button onclick="fetchNewsWithSentiment()" style="margin-top: 16px; padding: 8px 20px; background: var(--accent-primary); border: none; border-radius: 6px; color: white; cursor: pointer;">
                        🔄 Erneut versuchen
                    </button>
                </div>
            `;
        }

        // Also handle old grid
        const newsGrid = document.getElementById('news-grid');
        if (newsGrid) {
            newsGrid.innerHTML = `
                <div class="error-message" style="grid-column: 1/-1; padding: 20px; color: #ff6b6b; text-align: center; background: rgba(255,107,107,0.1); border-radius: 8px;">
                    ⚠️ News konnten nicht geladen werden.
                </div>
            `;
        }
    }

    function renderNewsWithSentiment(newsItems) {
        const newsContainer = document.getElementById('news-grid-main');
        const overallSentimentEl = document.getElementById('overallNewsSentiment');
        const newsUpdateTimeEl = document.getElementById('newsUpdateTime');

        if (!newsContainer) return;

        // Calculate overall sentiment
        let totalBullish = 0;
        let totalBearish = 0;
        newsItems.forEach(item => {
            if (item.sentiment.sentiment === 'bullish') totalBullish++;
            else if (item.sentiment.sentiment === 'bearish') totalBearish++;
        });

        let overallSentiment = 'neutral';
        let overallText = '⚪ Neutral';
        let overallClass = 'neutral';

        if (totalBullish > totalBearish + 1) {
            overallSentiment = 'bullish';
            overallText = `🟢 Bullish (${totalBullish}/${newsItems.length})`;
            overallClass = 'bullish';
        } else if (totalBearish > totalBullish + 1) {
            overallSentiment = 'bearish';
            overallText = `🔴 Bearish (${totalBearish}/${newsItems.length})`;
            overallClass = 'bearish';
        } else {
            overallText = `⚪ Gemischt (${totalBullish}↑ ${totalBearish}↓)`;
        }

        if (overallSentimentEl) {
            overallSentimentEl.textContent = overallText;
            overallSentimentEl.className = `sentiment-value ${overallClass}`;
        }

        // Update timestamp
        if (newsUpdateTimeEl) {
            newsUpdateTimeEl.textContent = `Letztes Update: ${new Date().toLocaleTimeString('de-DE')}`;
        }

        // Render news cards
        newsContainer.innerHTML = newsItems.map(item => {
            const date = new Date(item.published_on * 1000).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });

            const sentimentIcon = getSentimentIcon(item.sentiment.sentiment);
            const sentimentLabel = getSentimentLabel(item.sentiment.sentiment);
            const sentimentClass = item.sentiment.sentiment;

            // Get first found keyword for display
            const keywordInfo = item.sentiment.keywords.length > 0
                ? `Erkannt: "${item.sentiment.keywords[0].word}"`
                : 'Keine klaren Signale';

            return `
                <div class="news-card-main ${sentimentClass}-news" onclick="window.open('${item.url}', '_blank')">
                    <div class="news-card-image" style="background-image: url('${item.imageurl}')">
                        <span class="news-sentiment-badge ${sentimentClass}">${sentimentIcon} ${sentimentLabel}</span>
                    </div>
                    <div class="news-card-content">
                        <div class="news-card-meta">
                            <span class="news-card-source">${item.source_info.name}</span>
                            <span class="news-card-time">${date}</span>
                        </div>
                        <h4 class="news-card-title">${item.title}</h4>
                        <p class="news-card-body">${item.body.substring(0, 150)}...</p>
                        <div class="news-card-sentiment-info">
                            <span class="sentiment-icon">${sentimentIcon}</span>
                            <span class="sentiment-reason">${keywordInfo}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderNews(newsItems) {
        const newsContainer = document.getElementById('news-grid');
        if (!newsContainer) return;

        newsContainer.innerHTML = newsItems.map(item => {
            const date = new Date(item.published_on * 1000).toLocaleDateString('de-DE', {
                hour: '2-digit',
                minute: '2-digit'
            });

            return `
                <div class="news-card" onclick="window.open('${item.url}', '_blank')">
                    <div class="news-image" style="background-image: url('${item.imageurl}')"></div>
                    <div class="news-content">
                        <div class="news-meta">
                            <span class="news-source">${item.source_info.name}</span>
                            <span class="news-time">${date}</span>
                        </div>
                        <h4 class="news-title">${item.title}</h4>
                        <p class="news-body">${item.body.substring(0, 100)}...</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Make fetchNewsWithSentiment globally available for retry button
    window.fetchNewsWithSentiment = fetchNewsWithSentiment;

    // Initial news fetch with sentiment
    fetchNewsWithSentiment();

    // Refresh news every 30 minutes
    setInterval(fetchNewsWithSentiment, 1800000);
});

// Handle visibility change (refresh when tab becomes visible)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && remainingSeconds < 60) {
        updateDashboard();
    }
});

