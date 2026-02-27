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
        binanceFutures: 'https://fapi.binance.com/fapi/v1',
        cryptoCompareNews: 'https://min-api.cryptocompare.com/data/v2/news/'
    },
    weights: {
        technical: 0.32,
        onchain: 0.22,
        sentiment: 0.18,
        macro: 0.18,
        news: 0.10
    },
    riskDefaults: {
        enabled: true,
        riskPercent: 1.0,
        dailyPnl: 0.0,
        dailyLossLimit: -2.0,
        minScore: 6.5
    },
    paperDefaults: {
        enabled: true,
        autoExecute: false,
        startingBalance: 10000,
        feeRate: 0.0004
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
    openInterestChangePct: 0,
    openInterestHistory: [],
    longShortRatio: { long: 50, short: 50 },
    priceHistory: [],
    volumeHistory: [],
    marketCandles1h: [],
    macd: { value: 0, signal: 0, histogram: 0, trend: 'neutral' },
    onchainMetrics: {
        whaleTrades: 0,
        whaleBuySellBias: 0,
        whaleVolumeUsd: 0,
        exchangeFlowPct: 0,
        exchangeFlowSignal: 'neutral'
    },
    cycle: {
        phase: 'Unknown',
        progressPct: 0,
        daysToNextHalving: null,
        score: 5
    },
    newsItems: [],
    newsSentiment: {
        score: 5,
        bullish: 0,
        bearish: 0,
        highImpact: 0
    },
    scores: {
        technical: 5,
        onchain: 5,
        sentiment: 5,
        macro: 5,
        news: 5
    },
    signal: 'NEUTRAL',
    confidence: 50,
    riskGateBlocked: false,
    riskGateReason: '',
    riskSettings: { ...CONFIG.riskDefaults },
    paper: {
        ...CONFIG.paperDefaults,
        balance: CONFIG.paperDefaults.startingBalance,
        equity: CONFIG.paperDefaults.startingBalance,
        openPnl: 0,
        dailyPnlPct: 0,
        totalPnlPct: 0,
        dayKey: '',
        dayStartEquity: CONFIG.paperDefaults.startingBalance,
        position: null,
        trades: [],
        signalStats: {
            total: 0,
            wins: 0,
            losses: 0
        }
    },
    dataFlags: {
        priceLive: false,
        fearGreedLive: false,
        fundingLive: false,
        oiLive: false,
        lsLive: false,
        newsLive: false,
        candlesLive: false,
        onchainProxyLive: false
    },
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

async function fetchWithTimeout(url, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

async function fetchPriceData() {
    try {
        const data = await fetchWithTimeout(
            `${CONFIG.apis.coinGecko}/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false`
        );

        state.price = data.market_data.current_price.usd;
        state.priceChange24h = data.market_data.price_change_percentage_24h;
        state.marketCap = data.market_data.market_cap.usd;
        state.volume24h = data.market_data.total_volume.usd;
        state.ath = data.market_data.ath.usd;
        state.athChange = data.market_data.ath_change_percentage.usd;
        state.dataFlags.priceLive = true;

        return true;
    } catch (error) {
        console.error('Error fetching price data:', error);
        state.dataFlags.priceLive = false;
        return false;
    }
}

async function fetchPriceHistory() {
    try {
        const data = await fetchWithTimeout(
            `${CONFIG.apis.coinGecko}/coins/bitcoin/market_chart?vs_currency=usd&days=14&interval=daily`
        );

        state.priceHistory = data.prices.map(p => p[1]);

        // Store full historical data for advanced analysis (Volume, OBV, etc.)
        window.historicalData = data;
        if (data.total_volumes) {
            state.volumeHistory = data.total_volumes.map(v => v[1]);
        }

        return true;
    } catch (error) {
        console.error('Error fetching price history:', error);
        return false;
    }
}

async function fetchFearGreedIndex() {
    try {
        const data = await fetchWithTimeout(`${CONFIG.apis.fearGreed}?limit=8`);

        if (data.data && data.data.length > 0) {
            state.fearGreedIndex = parseInt(data.data[0].value);
            state.fearGreedHistory = data.data.slice(0, 7).map(d => ({
                value: parseInt(d.value),
                classification: d.value_classification,
                timestamp: d.timestamp
            }));
        }
        state.dataFlags.fearGreedLive = true;
        return true;
    } catch (error) {
        console.error('Error fetching Fear & Greed:', error);
        state.dataFlags.fearGreedLive = false;
        return false;
    }
}

async function fetchFundingRate() {
    try {
        const data = await fetchWithTimeout(
            `${CONFIG.apis.binanceFutures}/fundingRate?symbol=BTCUSDT&limit=1`
        );

        if (data && data.length > 0) {
            state.fundingRate = parseFloat(data[0].fundingRate) * 100;
        }
        state.dataFlags.fundingLive = true;
        return true;
    } catch (error) {
        console.error('Error fetching funding rate:', error);
        // Set a mock value for demo
        state.fundingRate = -0.005;
        state.dataFlags.fundingLive = false;
        return false;
    }
}

async function fetchOpenInterest() {
    try {
        const [oiNow, oiHist] = await Promise.all([
            fetchWithTimeout(`${CONFIG.apis.binanceFutures}/openInterest?symbol=BTCUSDT`),
            fetchWithTimeout(`${CONFIG.apis.binanceFutures.replace('/fapi/v1', '')}/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=24`)
        ]);

        if (oiNow) {
            state.openInterest = parseFloat(oiNow.openInterest) * state.price;
        }

        if (Array.isArray(oiHist) && oiHist.length >= 2) {
            state.openInterestHistory = oiHist.map(item => parseFloat(item.sumOpenInterestValue || item.sumOpenInterest || 0));
            const first = state.openInterestHistory[0];
            const last = state.openInterestHistory[state.openInterestHistory.length - 1];
            state.openInterestChangePct = first > 0 ? ((last - first) / first) * 100 : 0;
        } else {
            state.openInterestChangePct = 0;
        }
        state.dataFlags.oiLive = true;
        return true;
    } catch (error) {
        console.error('Error fetching open interest:', error);
        state.openInterestChangePct = 0;
        state.dataFlags.oiLive = false;
        return false;
    }
}

async function fetchLongShortRatio() {
    try {
        const data = await fetchWithTimeout(
            `${CONFIG.apis.binanceFutures}/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1`
        );

        if (data && data.length > 0) {
            const ratio = parseFloat(data[0].longShortRatio);
            const longPercent = (ratio / (1 + ratio)) * 100;
            state.longShortRatio = {
                long: longPercent,
                short: 100 - longPercent
            };
        }
        state.dataFlags.lsLive = true;
        return true;
    } catch (error) {
        console.error('Error fetching L/S ratio:', error);
        // Mock data
        state.longShortRatio = { long: 48.5, short: 51.5 };
        state.dataFlags.lsLive = false;
        return false;
    }
}

async function fetchOnChainProxies() {
    try {
        const aggTrades = await fetchWithTimeout(`${CONFIG.apis.binance}/aggTrades?symbol=BTCUSDT&limit=1000`);
        const whaleThresholdUsd = 1500000;
        let whaleTrades = 0;
        let whaleVolumeUsd = 0;
        let whaleBias = 0;

        for (const t of (aggTrades || [])) {
            const notional = (parseFloat(t.p) || 0) * (parseFloat(t.q) || 0);
            if (notional >= whaleThresholdUsd) {
                whaleTrades += 1;
                whaleVolumeUsd += notional;
                whaleBias += t.m ? -1 : 1;
            }
        }

        let buyQuote = 0;
        let totalQuote = 0;
        for (const candle of state.marketCandles1h.slice(-24)) {
            totalQuote += candle.quoteVolume || 0;
            buyQuote += candle.takerBuyQuoteVolume || 0;
        }
        const sellQuote = Math.max(0, totalQuote - buyQuote);
        const flowPct = totalQuote > 0 ? ((buyQuote - sellQuote) / totalQuote) * 100 : 0;

        state.onchainMetrics = {
            whaleTrades,
            whaleBuySellBias: whaleBias,
            whaleVolumeUsd,
            exchangeFlowPct: flowPct,
            exchangeFlowSignal: flowPct > 4 ? 'bullish' : flowPct < -4 ? 'bearish' : 'neutral'
        };
        state.dataFlags.onchainProxyLive = true;
        return true;
    } catch (error) {
        console.error('Error fetching on-chain proxies:', error);
        state.onchainMetrics = {
            whaleTrades: 0,
            whaleBuySellBias: 0,
            whaleVolumeUsd: 0,
            exchangeFlowPct: 0,
            exchangeFlowSignal: 'neutral'
        };
        state.dataFlags.onchainProxyLive = false;
        return false;
    }
}

async function fetchMarketStructureData() {
    try {
        const klines = await fetchWithTimeout(
            `${CONFIG.apis.binance}/klines?symbol=BTCUSDT&interval=1h&limit=300`
        );

        state.marketCandles1h = (klines || []).map(k => ({
            openTime: k[0],
            close: parseFloat(k[4]),
            quoteVolume: parseFloat(k[7]),
            takerBuyQuoteVolume: parseFloat(k[10])
        }));
        state.dataFlags.candlesLive = true;
        return true;
    } catch (error) {
        console.error('Error fetching market structure candles:', error);
        state.marketCandles1h = [];
        state.dataFlags.candlesLive = false;
        return false;
    }
}

function analyzeNewsSentiment(newsItems) {
    const bullishKeywords = [
        'etf inflow', 'institutional buy', 'accumulation', 'adoption',
        'approval', 'upgrade', 'surge', 'bullish', 'record high'
    ];
    const bearishKeywords = [
        'etf outflow', 'sell-off', 'hack', 'exploit', 'ban',
        'lawsuit', 'sec action', 'liquidation', 'bearish', 'crash'
    ];
    const highImpactKeywords = [
        'fed', 'fomc', 'cpi', 'sec', 'etf', 'interest rate',
        'regulation', 'blackrock', 'grayscale', 'treasury'
    ];

    let bullish = 0;
    let bearish = 0;
    let highImpact = 0;

    for (const item of newsItems) {
        const title = (item?.title || '').toLowerCase();

        if (bullishKeywords.some(k => title.includes(k))) bullish += 1;
        if (bearishKeywords.some(k => title.includes(k))) bearish += 1;
        if (highImpactKeywords.some(k => title.includes(k))) highImpact += 1;
    }

    const balance = bullish - bearish;
    const impactBoost = Math.min(1.5, highImpact * 0.25);
    const score = Math.max(0, Math.min(10, 5 + (balance * 1.2) + impactBoost));

    return { score, bullish, bearish, highImpact };
}

async function fetchNewsEvents() {
    try {
        const data = await fetchWithTimeout(
            `${CONFIG.apis.cryptoCompareNews}?lang=EN&categories=BTC,Regulation,Market&excludeCategories=Sponsored`
        );

        const rawItems = data?.Data || [];
        state.newsItems = rawItems.slice(0, 8).map(item => ({
            title: item.title,
            url: item.url,
            source: item.source_info?.name || 'Unknown',
            publishedOn: item.published_on
        }));
        state.newsSentiment = analyzeNewsSentiment(state.newsItems);
        state.dataFlags.newsLive = true;
        return true;
    } catch (error) {
        console.error('Error fetching BTC news:', error);
        state.newsItems = [];
        state.newsSentiment = { score: 5, bullish: 0, bearish: 0, highImpact: 0 };
        state.dataFlags.newsLive = false;
        return false;
    }
}

function loadRiskSettings() {
    const saved = localStorage.getItem('btc-risk-settings');
    if (!saved) {
        state.riskSettings = { ...CONFIG.riskDefaults };
        return;
    }

    try {
        const parsed = JSON.parse(saved);
        state.riskSettings = {
            ...CONFIG.riskDefaults,
            ...parsed
        };
    } catch (error) {
        console.warn('Risk settings could not be parsed. Using defaults.', error);
        state.riskSettings = { ...CONFIG.riskDefaults };
    }
}

function saveRiskSettings() {
    localStorage.setItem('btc-risk-settings', JSON.stringify(state.riskSettings));
}

function getDayKey(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function loadPaperState() {
    const saved = localStorage.getItem('btc-paper-state');
    if (!saved) {
        state.paper.dayKey = getDayKey();
        state.paper.dayStartEquity = state.paper.equity;
        return;
    }

    try {
        const parsed = JSON.parse(saved);
        state.paper = {
            ...state.paper,
            ...parsed
        };
    } catch (error) {
        console.warn('Paper state could not be parsed. Using defaults.', error);
    }

    if (!state.paper.dayKey) {
        state.paper.dayKey = getDayKey();
        state.paper.dayStartEquity = state.paper.equity;
    }
}

function savePaperState() {
    localStorage.setItem('btc-paper-state', JSON.stringify(state.paper));
}

function resetPaperState(startingBalance = CONFIG.paperDefaults.startingBalance) {
    state.paper = {
        ...state.paper,
        balance: startingBalance,
        equity: startingBalance,
        openPnl: 0,
        dailyPnlPct: 0,
        totalPnlPct: 0,
        dayKey: getDayKey(),
        dayStartEquity: startingBalance,
        position: null,
        trades: [],
        signalStats: { total: 0, wins: 0, losses: 0 }
    };
    savePaperState();
}

function updatePaperDayBoundary() {
    const today = getDayKey();
    if (state.paper.dayKey !== today) {
        state.paper.dayKey = today;
        state.paper.dayStartEquity = state.paper.equity;
        state.paper.dailyPnlPct = 0;
    }
}

function calculateTradeLevelsForSignal(signal, price) {
    if (signal === 'LONG') {
        return {
            stopLoss: price * 0.94,
            takeProfit: price * 1.08
        };
    }
    if (signal === 'SHORT') {
        return {
            stopLoss: price * 1.06,
            takeProfit: price * 0.92
        };
    }
    return null;
}

function updatePaperOpenPnl() {
    if (!state.paper.position || !state.price) {
        state.paper.openPnl = 0;
        state.paper.equity = state.paper.balance;
        return;
    }

    const p = state.paper.position;
    const direction = p.side === 'LONG' ? 1 : -1;
    const raw = (state.price - p.entryPrice) * p.sizeBtc * direction;
    state.paper.openPnl = raw;
    state.paper.equity = state.paper.balance + raw;
}

function closePaperPosition(reason, exitPrice = state.price) {
    const p = state.paper.position;
    if (!p || !exitPrice) return;

    const direction = p.side === 'LONG' ? 1 : -1;
    const grossPnl = (exitPrice - p.entryPrice) * p.sizeBtc * direction;
    const fee = (p.notionalUsd + (Math.abs(exitPrice * p.sizeBtc))) * state.paper.feeRate;
    const netPnl = grossPnl - fee;

    state.paper.balance += netPnl;
    state.paper.position = null;
    state.paper.openPnl = 0;
    state.paper.equity = state.paper.balance;

    const trade = {
        id: Date.now(),
        side: p.side,
        entryPrice: p.entryPrice,
        exitPrice,
        sizeBtc: p.sizeBtc,
        pnlUsd: netPnl,
        pnlPct: p.notionalUsd > 0 ? (netPnl / p.notionalUsd) * 100 : 0,
        score: p.entryScore,
        reason,
        openedAt: p.openedAt,
        closedAt: new Date().toISOString()
    };

    state.paper.trades.unshift(trade);
    state.paper.trades = state.paper.trades.slice(0, 200);
    state.paper.signalStats.total += 1;
    if (netPnl >= 0) state.paper.signalStats.wins += 1;
    else state.paper.signalStats.losses += 1;
}

function openPaperPosition(side, score) {
    if (!state.price) return;
    const levels = calculateTradeLevelsForSignal(side, state.price);
    if (!levels) return;

    const riskPct = Math.max(0.1, state.riskSettings.riskPercent) / 100;
    const riskUsd = state.paper.equity * riskPct;
    const slDistance = Math.abs((state.price - levels.stopLoss) / state.price);
    if (slDistance <= 0) return;

    const notionalUsd = riskUsd / slDistance;
    const sizeBtc = notionalUsd / state.price;
    if (!Number.isFinite(sizeBtc) || sizeBtc <= 0) return;

    state.paper.position = {
        side,
        entryPrice: state.price,
        stopLoss: levels.stopLoss,
        takeProfit: levels.takeProfit,
        sizeBtc,
        notionalUsd,
        entryScore: score,
        openedAt: new Date().toISOString()
    };
}

function evaluatePaperPositionByPrice() {
    const p = state.paper.position;
    if (!p || !state.price) return;

    if (p.side === 'LONG') {
        if (state.price <= p.stopLoss) {
            closePaperPosition('Stop Loss');
            return;
        }
        if (state.price >= p.takeProfit) {
            closePaperPosition('Take Profit');
            return;
        }
    } else {
        if (state.price >= p.stopLoss) {
            closePaperPosition('Stop Loss');
            return;
        }
        if (state.price <= p.takeProfit) {
            closePaperPosition('Take Profit');
            return;
        }
    }
}

function syncPaperRiskMetrics() {
    updatePaperDayBoundary();
    updatePaperOpenPnl();
    state.paper.dailyPnlPct = state.paper.dayStartEquity > 0
        ? ((state.paper.equity - state.paper.dayStartEquity) / state.paper.dayStartEquity) * 100
        : 0;
    state.paper.totalPnlPct = state.paper.startingBalance > 0
        ? ((state.paper.equity - state.paper.startingBalance) / state.paper.startingBalance) * 100
        : 0;

    // Keep risk gate in sync with live paper performance when paper execution is enabled.
    if (state.paper.enabled) {
        state.riskSettings.dailyPnl = state.paper.dailyPnlPct;
    }
}

function runPaperTradingCycle(weightedScore) {
    if (!state.paper.enabled) {
        return;
    }

    evaluatePaperPositionByPrice();
    syncPaperRiskMetrics();

    if (!state.paper.autoExecute) {
        savePaperState();
        return;
    }

    if (state.paper.position) {
        if ((state.paper.position.side === 'LONG' && state.signal === 'SHORT') ||
            (state.paper.position.side === 'SHORT' && state.signal === 'LONG')) {
            closePaperPosition('Signal Flip');
        }
        syncPaperRiskMetrics();
        savePaperState();
        return;
    }

    if (!state.riskGateBlocked && (state.signal === 'LONG' || state.signal === 'SHORT')) {
        openPaperPosition(state.signal, weightedScore);
        syncPaperRiskMetrics();
    }

    savePaperState();
}

function calculateHalvingCycle() {
    const halvingDates = [
        new Date('2012-11-28T00:00:00Z'),
        new Date('2016-07-09T00:00:00Z'),
        new Date('2020-05-11T00:00:00Z'),
        new Date('2024-04-20T00:00:00Z'),
        new Date('2028-04-20T00:00:00Z') // Estimated window.
    ];

    const now = new Date();
    let lastHalving = halvingDates[0];
    let nextHalving = halvingDates[halvingDates.length - 1];

    for (let i = 0; i < halvingDates.length - 1; i++) {
        if (now >= halvingDates[i] && now < halvingDates[i + 1]) {
            lastHalving = halvingDates[i];
            nextHalving = halvingDates[i + 1];
            break;
        }
    }

    const cycleDays = Math.max(1, Math.round((nextHalving - lastHalving) / 86400000));
    const elapsedDays = Math.max(0, Math.round((now - lastHalving) / 86400000));
    const daysToNext = Math.max(0, Math.round((nextHalving - now) / 86400000));
    const progressPct = Math.max(0, Math.min(100, (elapsedDays / cycleDays) * 100));

    let phase = 'Early Cycle';
    let cycleScore = 5;
    if (progressPct < 25) {
        phase = 'Post-Halving Expansion';
        cycleScore = 6.5;
    } else if (progressPct < 55) {
        phase = 'Mid-Cycle Trend';
        cycleScore = 7.2;
    } else if (progressPct < 80) {
        phase = 'Late Cycle / Distribution Risk';
        cycleScore = 4.5;
    } else {
        phase = 'Pre-Halving Reset';
        cycleScore = 5.8;
    }

    return {
        phase,
        progressPct,
        daysToNextHalving: daysToNext,
        score: cycleScore
    };
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

function calculateEMAArray(prices, period) {
    if (!prices || prices.length === 0) return [];
    const multiplier = 2 / (period + 1);
    const result = [prices[0]];
    for (let i = 1; i < prices.length; i++) {
        result.push((prices[i] - result[i - 1]) * multiplier + result[i - 1]);
    }
    return result;
}

function calculateMACD(prices, fast = 12, slow = 26, signal = 9) {
    if (!prices || prices.length < slow + signal) {
        return { value: 0, signal: 0, histogram: 0, trend: 'neutral' };
    }

    const fastEma = calculateEMAArray(prices, fast);
    const slowEma = calculateEMAArray(prices, slow);
    const macdLine = prices.map((_, i) => (fastEma[i] || 0) - (slowEma[i] || 0));
    const signalLine = calculateEMAArray(macdLine, signal);

    const value = macdLine[macdLine.length - 1];
    const signalValue = signalLine[signalLine.length - 1];
    const histogram = value - signalValue;

    let trend = 'neutral';
    if (value > signalValue && histogram > 0) trend = 'bullish';
    if (value < signalValue && histogram < 0) trend = 'bearish';

    return { value, signal: signalValue, histogram, trend };
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

function applyRiskGates(baseSignal, weightedScore) {
    state.riskGateBlocked = false;
    state.riskGateReason = '';

    if (!state.riskSettings.enabled) {
        return baseSignal;
    }

    if (state.riskSettings.dailyPnl <= state.riskSettings.dailyLossLimit) {
        state.riskGateBlocked = true;
        state.riskGateReason = `Daily-Loss-Limit erreicht (${formatNumber(state.riskSettings.dailyPnl, 2)}%)`;
        return 'NEUTRAL';
    }

    const minLong = state.riskSettings.minScore;
    const maxShort = 10 - state.riskSettings.minScore;

    if (baseSignal === 'LONG' && weightedScore < minLong) {
        state.riskGateBlocked = true;
        state.riskGateReason = `Min-Score LONG nicht erreicht (${formatNumber(weightedScore, 2)} < ${formatNumber(minLong, 2)})`;
        return 'NEUTRAL';
    }

    if (baseSignal === 'SHORT' && weightedScore > maxShort) {
        state.riskGateBlocked = true;
        state.riskGateReason = `Min-Score SHORT nicht erreicht (${formatNumber(weightedScore, 2)} > ${formatNumber(maxShort, 2)})`;
        return 'NEUTRAL';
    }

    return baseSignal;
}

function calculateScores() {
    // Technical Score
    const rsi = calculateRSI(state.priceHistory);
    let techScore = 5;
    const macdPrices = state.marketCandles1h.length > 60
        ? state.marketCandles1h.map(c => c.close)
        : state.priceHistory;
    state.macd = calculateMACD(macdPrices);

    // RSI scoring
    if (rsi < 30) techScore += 2.5; // Oversold = bullish
    else if (rsi > 70) techScore -= 2.5; // Overbought = bearish
    else if (rsi < 40) techScore += 1;
    else if (rsi > 60) techScore -= 1;

    // Trend scoring
    const trend = determineTrend(state.priceHistory);
    if (trend === 'up') techScore += 1.5;
    else if (trend === 'down') techScore -= 1.5;

    // ATH distance
    if (state.athChange > -20) techScore += 0.5;
    else if (state.athChange < -40) techScore -= 1;

    // MACD confirmation
    if (state.macd.trend === 'bullish') techScore += 1.2;
    if (state.macd.trend === 'bearish') techScore -= 1.2;

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
    if (state.longShortRatio.short > 55) sentimentScore += 1; // More shorts = bullish
    else if (state.longShortRatio.long > 55) sentimentScore -= 1; // More longs = bearish

    state.scores.sentiment = Math.max(0, Math.min(10, sentimentScore));

    // On-Chain Score (whale/exchange-flow proxies + OI trend)
    let onchainScore = 5;

    if (state.priceChange24h > 5) onchainScore += 1;
    else if (state.priceChange24h < -5) onchainScore -= 1;

    if (state.onchainMetrics.whaleTrades >= 10) onchainScore += 0.7;
    if (state.onchainMetrics.whaleBuySellBias > 2) onchainScore += 0.8;
    else if (state.onchainMetrics.whaleBuySellBias < -2) onchainScore -= 0.8;

    if (state.onchainMetrics.exchangeFlowSignal === 'bullish') onchainScore += 1.0;
    else if (state.onchainMetrics.exchangeFlowSignal === 'bearish') onchainScore -= 1.0;

    if (state.openInterestChangePct > 8 && state.priceChange24h > 0) onchainScore += 0.7;
    else if (state.openInterestChangePct > 8 && state.priceChange24h < 0) onchainScore -= 0.7;
    else if (state.openInterestChangePct < -6) onchainScore -= 0.3;

    state.scores.onchain = Math.max(0, Math.min(10, onchainScore));

    // Macro & Volume Score (adds cycle and OI regime)
    let macroScore = 5;
    state.cycle = calculateHalvingCycle();

    // Price relative to ATH (Macro Context)
    if (state.athChange > -15) macroScore += 1;
    else if (state.athChange < -50) macroScore -= 1.5;
    else if (state.athChange < -30) macroScore -= 0.5;

    // Cycle context
    macroScore += (state.cycle.score - 5) * 0.8;

    // Open interest regime
    if (state.openInterestChangePct > 5) macroScore += 0.6;
    if (state.openInterestChangePct < -5) macroScore -= 0.4;

    // Volume Analysis (if available)
    if (window.historicalData && window.historicalData.total_volumes && typeof calculateOBV === 'function') {
        const volumes = window.historicalData.total_volumes.map(v => v[1]);
        const obvPrices = state.priceHistory.slice(-30);
        const obvVols = volumes.slice(-30);

        const obvResult = calculateOBV(obvPrices, obvVols);

        // OBV Trend Impact
        if (obvResult.trend === 'up') macroScore += 1.5;
        else if (obvResult.trend === 'down') macroScore -= 1.5;

        // RVOL Impact (Intensity)
        const currentVol = state.volume24h;
        const rvolResult = calculateRVOL(currentVol, volumes);

        if (rvolResult.ratio > 1.5) {
            // High volume validates the move
            if (state.priceChange24h > 0) macroScore += 1;
            else macroScore -= 1;
        }
    }

    state.scores.macro = Math.max(0, Math.min(10, macroScore));

    // News Score
    let newsScore = state.newsSentiment.score;
    if (state.newsSentiment.highImpact >= 2) {
        // Slightly reduce confidence during heavy news flow to account for event volatility.
        newsScore -= 0.4;
    }
    state.scores.news = Math.max(0, Math.min(10, newsScore));

    // Calculate weighted total
    const weightedScore =
        state.scores.technical * CONFIG.weights.technical +
        state.scores.onchain * CONFIG.weights.onchain +
        state.scores.sentiment * CONFIG.weights.sentiment +
        state.scores.macro * CONFIG.weights.macro +
        state.scores.news * CONFIG.weights.news;

    const longThreshold = state.riskSettings.minScore;
    const shortThreshold = 10 - state.riskSettings.minScore;

    let baseSignal = 'NEUTRAL';
    if (weightedScore >= longThreshold) {
        baseSignal = 'LONG';
    } else if (weightedScore <= shortThreshold) {
        baseSignal = 'SHORT';
    }

    state.signal = applyRiskGates(baseSignal, weightedScore);

    const confidenceRaw = 50 + Math.abs(weightedScore - 5) * 8;
    const gatePenalty = state.riskGateBlocked ? 15 : 0;
    state.confidence = Math.max(30, Math.min(85, confidenceRaw - gatePenalty));

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

    // Volume Flow (New)
    const volValueEl = document.getElementById('volumeDashValue');
    const volVisualEl = document.getElementById('volumeDashVisual');

    if (window.historicalData && window.historicalData.total_volumes) {
        // Ensure we have volumes
        const volumes = window.historicalData.total_volumes.map(v => v[1]);
        const currentVol = state.volume24h;

        // Check if functions exist (safe guard)
        if (typeof calculateOBV === 'function' && typeof calculateRVOL === 'function') {
            // Calculate metrics
            // Use last 30 periods for OBV to match modal
            const obvPrices = state.priceHistory.slice(-30);
            const obvVols = volumes.slice(-30);
            const obvResult = calculateOBV(obvPrices, obvVols);

            const rvolResult = calculateRVOL(currentVol, volumes);

            // Text
            let trendText = obvResult.trend === 'up' ? 'BULLISH' : obvResult.trend === 'down' ? 'BEARISH' : 'NEUTRAL';
            volValueEl.textContent = `${trendText} (RVOL ${rvolResult.ratio.toFixed(1)})`;
            volValueEl.className = `indicator-value ${obvResult.trend === 'up' ? 'text-bullish' : obvResult.trend === 'down' ? 'text-bearish' : 'text-neutral'}`;

            // Visual Arrow
            const arrow = volVisualEl.querySelector('.trend-arrow');
            if (arrow) {
                arrow.className = 'trend-arrow ' + (obvResult.trend === 'up' ? 'up' : obvResult.trend === 'down' ? 'down' : 'sideways');
            }
        }
    }

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
    const oiChangeEl = document.getElementById('oiChange');
    if (oiChangeEl) {
        const sign = state.openInterestChangePct >= 0 ? '+' : '';
        oiChangeEl.textContent = `${sign}${formatNumber(state.openInterestChangePct, 2)}% (24h)`;
        oiChangeEl.className = `derivative-status ${state.openInterestChangePct > 3 ? 'text-bullish' : state.openInterestChangePct < -3 ? 'text-bearish' : ''}`;
    }

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

function updateOnchainCard() {
    const whaleTradesEl = document.getElementById('whaleTrades');
    const whaleBiasEl = document.getElementById('whaleBias');
    const exchangeFlowEl = document.getElementById('exchangeFlow');
    const macdSignalEl = document.getElementById('macdSignal');
    const cyclePhaseEl = document.getElementById('cyclePhase');
    const cycleDaysEl = document.getElementById('daysToHalving');
    const onchainBadgeEl = document.getElementById('onchainBadge');

    if (!whaleTradesEl || !onchainBadgeEl) return;

    whaleTradesEl.textContent = `${state.onchainMetrics.whaleTrades} / 24h`;
    const whaleBiasText = state.onchainMetrics.whaleBuySellBias > 0
        ? `Net Buy (${state.onchainMetrics.whaleBuySellBias})`
        : state.onchainMetrics.whaleBuySellBias < 0
            ? `Net Sell (${state.onchainMetrics.whaleBuySellBias})`
            : 'Neutral';
    whaleBiasEl.textContent = whaleBiasText;
    whaleBiasEl.className = `onchain-sub ${state.onchainMetrics.whaleBuySellBias > 0 ? 'text-bullish' : state.onchainMetrics.whaleBuySellBias < 0 ? 'text-bearish' : ''}`;

    const flowSign = state.onchainMetrics.exchangeFlowPct >= 0 ? '+' : '';
    exchangeFlowEl.textContent = `${flowSign}${formatNumber(state.onchainMetrics.exchangeFlowPct, 2)}%`;
    exchangeFlowEl.className = `onchain-value ${state.onchainMetrics.exchangeFlowSignal === 'bullish' ? 'text-bullish' : state.onchainMetrics.exchangeFlowSignal === 'bearish' ? 'text-bearish' : ''}`;

    const macdTrend = state.macd.trend === 'bullish' ? 'Bullish' : state.macd.trend === 'bearish' ? 'Bearish' : 'Neutral';
    macdSignalEl.textContent = `${macdTrend} (${formatNumber(state.macd.histogram, 2)})`;
    macdSignalEl.className = `onchain-value ${state.macd.trend === 'bullish' ? 'text-bullish' : state.macd.trend === 'bearish' ? 'text-bearish' : ''}`;

    cyclePhaseEl.textContent = state.cycle.phase;
    cycleDaysEl.textContent = state.cycle.daysToNextHalving === null ? '--' : `${state.cycle.daysToNextHalving} Tage`;
    onchainBadgeEl.textContent = `${formatNumber(state.scores.onchain, 1)}/10`;
}

function updateRiskSettingsPanel(weightedScore) {
    const enabledEl = document.getElementById('riskGateEnabled');
    const riskPctEl = document.getElementById('riskPercentInput');
    const dailyPnlEl = document.getElementById('dailyPnlInput');
    const dailyLimitEl = document.getElementById('dailyLossLimitInput');
    const minScoreEl = document.getElementById('minScoreInput');
    const gateStatusEl = document.getElementById('riskGateStatus');

    if (!enabledEl || !riskPctEl || !dailyPnlEl || !dailyLimitEl || !minScoreEl || !gateStatusEl) {
        return;
    }

    enabledEl.checked = !!state.riskSettings.enabled;
    riskPctEl.value = state.riskSettings.riskPercent;
    dailyPnlEl.value = state.riskSettings.dailyPnl;
    dailyLimitEl.value = state.riskSettings.dailyLossLimit;
    minScoreEl.value = state.riskSettings.minScore;

    const status = state.riskGateBlocked
        ? `BLOCKIERT: ${state.riskGateReason}`
        : `AKTIV: Score ${formatNumber(weightedScore, 2)} | Risk ${formatNumber(state.riskSettings.riskPercent, 2)}%`;
    gateStatusEl.textContent = status;
    gateStatusEl.className = `risk-gate-status ${state.riskGateBlocked ? 'blocked' : 'active'}`;
}

function setupRiskSettingsControls() {
    const enabledEl = document.getElementById('riskGateEnabled');
    const riskPctEl = document.getElementById('riskPercentInput');
    const dailyPnlEl = document.getElementById('dailyPnlInput');
    const dailyLimitEl = document.getElementById('dailyLossLimitInput');
    const minScoreEl = document.getElementById('minScoreInput');

    if (!enabledEl || !riskPctEl || !dailyPnlEl || !dailyLimitEl || !minScoreEl) {
        return;
    }

    const clamp = (val, min, max) => Math.min(max, Math.max(min, val));
    const onChange = () => {
        state.riskSettings.enabled = enabledEl.checked;
        state.riskSettings.riskPercent = clamp(parseFloat(riskPctEl.value) || 1, 0.1, 5);
        state.riskSettings.dailyPnl = clamp(parseFloat(dailyPnlEl.value) || 0, -30, 30);
        state.riskSettings.dailyLossLimit = clamp(parseFloat(dailyLimitEl.value) || -2, -30, -0.1);
        state.riskSettings.minScore = clamp(parseFloat(minScoreEl.value) || 6.5, 5.2, 8.5);
        saveRiskSettings();
        updateDashboard();
    };

    enabledEl.addEventListener('change', onChange);
    riskPctEl.addEventListener('change', onChange);
    dailyPnlEl.addEventListener('change', onChange);
    dailyLimitEl.addEventListener('change', onChange);
    minScoreEl.addEventListener('change', onChange);
}

function updatePaperTradingPanel() {
    const enabledEl = document.getElementById('paperEnabled');
    const autoEl = document.getElementById('paperAutoExecute');
    const startBalEl = document.getElementById('paperStartingBalance');
    const statusEl = document.getElementById('paperStatus');
    const equityEl = document.getElementById('paperEquity');
    const dailyEl = document.getElementById('paperDailyPnl');
    const totalEl = document.getElementById('paperTotalPnl');
    const openEl = document.getElementById('paperOpenPnl');
    const posEl = document.getElementById('paperPosition');
    const qualityEl = document.getElementById('signalQuality');
    const listEl = document.getElementById('paperTradeList');

    if (!enabledEl || !listEl) return;

    enabledEl.checked = !!state.paper.enabled;
    autoEl.checked = !!state.paper.autoExecute;
    startBalEl.value = state.paper.startingBalance;

    statusEl.textContent = state.paper.position
        ? `Position offen: ${state.paper.position.side} @ $${formatNumber(state.paper.position.entryPrice, 0)}`
        : 'Keine offene Position';
    statusEl.className = `paper-status ${state.paper.position ? 'active' : 'idle'}`;

    equityEl.textContent = `$${formatNumber(state.paper.equity, 2)}`;
    dailyEl.textContent = `${state.paper.dailyPnlPct >= 0 ? '+' : ''}${formatNumber(state.paper.dailyPnlPct, 2)}%`;
    totalEl.textContent = `${state.paper.totalPnlPct >= 0 ? '+' : ''}${formatNumber(state.paper.totalPnlPct, 2)}%`;
    openEl.textContent = `$${formatNumber(state.paper.openPnl, 2)}`;
    posEl.textContent = state.paper.position
        ? `${state.paper.position.side} | Size ${formatNumber(state.paper.position.sizeBtc, 4)} BTC`
        : '--';

    const winRate = state.paper.signalStats.total > 0
        ? (state.paper.signalStats.wins / state.paper.signalStats.total) * 100
        : 0;
    qualityEl.textContent = `Signals: ${state.paper.signalStats.total} | Winrate: ${formatNumber(winRate, 1)}%`;

    listEl.innerHTML = state.paper.trades.slice(0, 8).map(t => {
        const cls = t.pnlUsd >= 0 ? 'text-bullish' : 'text-bearish';
        const date = new Date(t.closedAt).toLocaleString('de-DE');
        return `<li><span>${date} ${t.side}</span><span class="${cls}">$${formatNumber(t.pnlUsd, 2)}</span><span>${t.reason}</span></li>`;
    }).join('') || '<li><span>Noch keine Trades</span></li>';
}

function updateDataSourceAudit() {
    const listEl = document.getElementById('sourceAuditList');
    if (!listEl) return;

    const rows = [
        { name: 'BTC Preis', status: state.dataFlags.priceLive ? 'live' : 'static', note: state.dataFlags.priceLive ? 'CoinGecko' : 'Fallback' },
        { name: 'Fear & Greed', status: state.dataFlags.fearGreedLive ? 'live' : 'static', note: state.dataFlags.fearGreedLive ? 'alternative.me' : 'Fallback' },
        { name: 'Funding Rate', status: state.dataFlags.fundingLive ? 'live' : 'static', note: state.dataFlags.fundingLive ? 'Binance Futures' : 'Mock Fallback' },
        { name: 'Open Interest', status: state.dataFlags.oiLive ? 'live' : 'static', note: state.dataFlags.oiLive ? 'Binance Futures' : 'Fallback' },
        { name: 'Long/Short Ratio', status: state.dataFlags.lsLive ? 'live' : 'static', note: state.dataFlags.lsLive ? 'Binance Futures' : 'Mock Fallback' },
        { name: 'News', status: state.dataFlags.newsLive ? 'live' : 'static', note: state.dataFlags.newsLive ? 'CryptoCompare' : 'Fallback' },
        { name: 'MACD', status: state.dataFlags.candlesLive ? 'live' : 'static', note: state.dataFlags.candlesLive ? 'Binance 1h Candles' : 'No candles' },
        { name: 'On-Chain (Whale/Flow)', status: state.dataFlags.onchainProxyLive ? 'proxy' : 'static', note: state.dataFlags.onchainProxyLive ? 'Proxy from Binance prints/flow' : 'Fallback' },
        { name: 'Halving/Zyklus', status: 'static', note: 'Calculated schedule model' }
    ];

    listEl.innerHTML = rows.map(r =>
        `<li><span>${r.name} <small style="opacity:.7">${r.note}</small></span><span class="source-chip ${r.status}">${r.status.toUpperCase()}</span></li>`
    ).join('');
}

function setupPaperTradingControls() {
    const enabledEl = document.getElementById('paperEnabled');
    const autoEl = document.getElementById('paperAutoExecute');
    const startBalEl = document.getElementById('paperStartingBalance');
    const resetEl = document.getElementById('paperResetBtn');
    const closeEl = document.getElementById('paperCloseBtn');

    if (!enabledEl || !autoEl || !startBalEl || !resetEl || !closeEl) {
        return;
    }

    enabledEl.addEventListener('change', () => {
        state.paper.enabled = enabledEl.checked;
        savePaperState();
        updateDashboard();
    });

    autoEl.addEventListener('change', () => {
        state.paper.autoExecute = autoEl.checked;
        savePaperState();
        updateDashboard();
    });

    startBalEl.addEventListener('change', () => {
        const value = Math.max(100, parseFloat(startBalEl.value) || CONFIG.paperDefaults.startingBalance);
        state.paper.startingBalance = value;
        if (!state.paper.position && state.paper.trades.length === 0) {
            state.paper.balance = value;
            state.paper.equity = value;
            state.paper.dayStartEquity = value;
        }
        savePaperState();
        updateDashboard();
    });

    resetEl.addEventListener('click', () => {
        resetPaperState(Math.max(100, parseFloat(startBalEl.value) || CONFIG.paperDefaults.startingBalance));
        updateDashboard();
    });

    closeEl.addEventListener('click', () => {
        if (state.paper.position) {
            closePaperPosition('Manual Close');
            syncPaperRiskMetrics();
            savePaperState();
            updateDashboard();
        }
    });
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

    const newsSignal = document.getElementById('newsSignal');
    const newsIcon = document.getElementById('newsIcon');
    if (newsSignal && newsIcon) {
        if (state.newsSentiment.bullish > state.newsSentiment.bearish) {
            newsSignal.textContent = 'Bullish';
            newsSignal.className = 'factor-signal bullish';
            newsIcon.textContent = '📰';
        } else if (state.newsSentiment.bearish > state.newsSentiment.bullish) {
            newsSignal.textContent = 'Bearish';
            newsSignal.className = 'factor-signal bearish';
            newsIcon.textContent = '🗞️';
        } else {
            newsSignal.textContent = 'Neutral';
            newsSignal.className = 'factor-signal neutral';
            newsIcon.textContent = '📰';
        }
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
    const positionSize = `${formatNumber(state.riskSettings.riskPercent, 1)}%`;
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

    if (state.riskGateBlocked && state.riskGateReason) {
        invalidations.unshift(`Risk-Gate aktiv: ${state.riskGateReason}`);
    }

    document.getElementById('invalidationList').innerHTML = invalidations.map(i =>
        `<li>${i}</li>`
    ).join('');

    // Upcoming / current events from live news headlines
    let events = [];
    if (state.newsItems.length > 0) {
        events = state.newsItems.slice(0, 4).map(item => {
            const ts = item.publishedOn ? new Date(item.publishedOn * 1000) : null;
            const dateLabel = ts && !Number.isNaN(ts.getTime())
                ? ts.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
                : '--';
            const source = item.source || 'News';
            return `${dateLabel} | ${source}: ${item.title}`;
        });
    }
    if (events.length === 0) {
        events = [
            'FOMC Meeting - Zinsentscheid',
            'US CPI Daten - Inflation',
            'ETF Flow Report - Wöchentlich'
        ];
    }

    document.getElementById('eventsList').innerHTML = events.map(e =>
        `<li>${e}</li>`
    ).join('');
}

function updateScoreCard(weightedScore = null) {
    const resolvedScore = weightedScore === null ? calculateScores() : weightedScore;

    // Individual scores
    const scores = [
        { id: 'tech', value: state.scores.technical },
        { id: 'onchain', value: state.scores.onchain },
        { id: 'sentiment', value: state.scores.sentiment },
        { id: 'macro', value: state.scores.macro },
        { id: 'news', value: state.scores.news }
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
    document.getElementById('totalScore').textContent = `${formatNumber(resolvedScore, 1)}/10`;
    return resolvedScore;
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

    const longThreshold = state.riskSettings.minScore;
    const shortThreshold = 10 - state.riskSettings.minScore;

    if (state.signal === 'LONG') {
        summaryText = `Überverkaufte Bedingungen (RSI, F&G: ${state.fearGreedIndex}), Futures-Daten und News-Flow signalisieren Rebound-Potenzial.`;
        explanationText = `<strong>LONG bedeutet:</strong> Die Daten deuten auf steigende Preise hin. 
            Der Gesamtscore liegt bei ${formatNumber(calculateWeightedScore(), 1)}/10 (≥${formatNumber(longThreshold, 1)} = LONG). 
            <br><br><strong>Warum LONG?</strong><br>
            • Fear & Greed ist bei ${state.fearGreedIndex} - ${state.fearGreedIndex < 35 ? 'Angst im Markt ist historisch ein Kaufsignal (Kontraindikator)' : 'nicht extrem, aber andere Faktoren sind bullish'}<br>
            • RSI zeigt ${calculateRSI(state.priceHistory) < 40 ? 'überverkaufte Bedingungen' : 'neutralen bis bullischen Trend'}<br>
            • Funding Rate ist ${state.fundingRate < 0 ? 'negativ → Shorts zahlen → bullish' : 'neutral'}<br>
            • News-Bias: ${state.newsSentiment.bullish > state.newsSentiment.bearish ? 'bullish' : state.newsSentiment.bearish > state.newsSentiment.bullish ? 'bearish' : 'neutral'} (${state.newsSentiment.highImpact} High-Impact Headlines)`;
    } else if (state.signal === 'SHORT') {
        summaryText = `Überkaufte Bedingungen, hohe Gier und negativer News-Flow deuten auf Korrektur-Risiko hin.`;
        explanationText = `<strong>SHORT bedeutet:</strong> Die Daten deuten auf fallende Preise hin. 
            Der Gesamtscore liegt bei ${formatNumber(calculateWeightedScore(), 1)}/10 (≤${formatNumber(shortThreshold, 1)} = SHORT). 
            <br><br><strong>Warum SHORT?</strong><br>
            • Fear & Greed ist bei ${state.fearGreedIndex} - ${state.fearGreedIndex > 65 ? 'Extreme Gier ist historisch ein Verkaufssignal (Kontraindikator)' : 'andere Faktoren sind bearish'}<br>
            • RSI zeigt ${calculateRSI(state.priceHistory) > 60 ? 'überkaufte Bedingungen' : 'neutralen bis bearischen Trend'}<br>
            • Viele Trader sind long positioniert → Kontraindikator<br>
            • News-Bias: ${state.newsSentiment.bullish > state.newsSentiment.bearish ? 'bullish' : state.newsSentiment.bearish > state.newsSentiment.bullish ? 'bearish' : 'neutral'} (${state.newsSentiment.highImpact} High-Impact Headlines)`;
    } else {
        summaryText = state.riskGateBlocked
            ? `Risk-Gate blockiert neue Trades: ${state.riskGateReason}`
            : `Gemischte Signale - kein klarer Vorteil für Long oder Short. Abwarten empfohlen.`;
        explanationText = `<strong>NEUTRAL bedeutet:</strong> Kein Trade empfohlen. 
            Der Gesamtscore liegt bei ${formatNumber(calculateWeightedScore(), 1)}/10 (zwischen ${formatNumber(shortThreshold, 1)} und ${formatNumber(longThreshold, 1)} = NEUTRAL).
            <br><br><strong>Warum kein Trade?</strong><br>
            ${state.riskGateBlocked ? `Risk-Filter aktiv: ${state.riskGateReason}.` : 'Die Indikatoren und News-Daten geben widersprüchliche Signale. Ein Trade ohne klaren Edge ist Glücksspiel.'}`;
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
        state.scores.macro * CONFIG.weights.macro +
        state.scores.news * CONFIG.weights.news;
}

function updateNoTradeWarning() {
    const warningBox = document.getElementById('noTradeWarning');
    const reasonsEl = document.getElementById('noTradeReasons');

    if (state.signal === 'NEUTRAL') {
        warningBox.style.display = 'flex';

        const reasons = [];
        const score = calculateWeightedScore();
        const rsi = calculateRSI(state.priceHistory);
        const longThreshold = state.riskSettings.minScore;
        const shortThreshold = 10 - state.riskSettings.minScore;

        // Collect all the reasons why no trade is recommended
        reasons.push(`<strong>Score ist ${formatNumber(score, 1)}/10</strong> - liegt zwischen ${formatNumber(shortThreshold, 1)} und ${formatNumber(longThreshold, 1)}, also im neutralen Bereich`);

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

        if (state.riskGateBlocked) {
            reasons.push(`<strong>Risk-Gate blockiert Entry</strong> - ${state.riskGateReason}`);
        }

        if (state.newsSentiment.highImpact >= 2) {
            reasons.push(`<strong>Erhöhte News-Volatilität</strong> - ${state.newsSentiment.highImpact} wichtige Headlines können schnelle Richtungswechsel auslösen`);
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
    const longThreshold = state.riskSettings.minScore;
    const shortThreshold = 10 - state.riskSettings.minScore;

    let html = '';
    let cssClass = '';

    if (score >= longThreshold) {
        cssClass = 'bullish';
        html = `<strong>Score ≥ ${formatNumber(longThreshold, 1)} = LONG Signal</strong><br>
                Alle Faktoren zusammen ergeben einen bullischen Bias. 
                Je höher der Score, desto stärker das Signal.`;
    } else if (score <= shortThreshold) {
        cssClass = 'bearish';
        html = `<strong>Score ≤ ${formatNumber(shortThreshold, 1)} = SHORT Signal</strong><br>
                Alle Faktoren zusammen ergeben einen bearischen Bias. 
                Je niedriger der Score, desto stärker das Signal.`;
    } else {
        cssClass = 'neutral';
        html = `<strong>Score zwischen ${formatNumber(shortThreshold, 1)} und ${formatNumber(longThreshold, 1)} = KEIN TRADE</strong><br>
                Die Indikatoren sind zu gemischt für eine klare Empfehlung. 
                Warte auf extremere Werte (Score unter ${formatNumber(shortThreshold, 1)} oder über ${formatNumber(longThreshold, 1)}).`;
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
            fetchMarketStructureData(),
            fetchFearGreedIndex(),
            fetchFundingRate(),
            fetchOpenInterest(),
            fetchLongShortRatio(),
            fetchNewsEvents()
        ]);
        await fetchOnChainProxies();

        syncPaperRiskMetrics();
        const weightedScore = calculateScores();
        runPaperTradingCycle(weightedScore);
        const finalScore = calculateScores();

        // Update all UI components
        updatePriceCard();
        updateFearGreedCard();
        updateTechnicalCard();
        updateDerivativesCard();
        updateOnchainCard();
        updateSentimentCard();
        updateScoreCard(finalScore);
        updateRiskSettingsPanel(finalScore);
        updatePaperTradingPanel();
        updateDataSourceAudit();
        updateTradeSetup();
        updateKeyLevels();
        updateRiskFactors();
        updateSignalBanner();
        updateLastUpdate();

        console.log('Dashboard updated successfully');
    } catch (error) {
        console.error('Error updating dashboard:', error);
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
        // Run backtest with 30 trades
        const results = await Backtester.runBacktest(30);

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

    // Trade list (chronologically sorted - oldest first)
    const tradeListEl = document.getElementById('backtestTradeList');
    const sortedTrades = [...results.trades].sort((a, b) => new Date(a.date) - new Date(b.date));

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
    loadRiskSettings();
    loadPaperState();
    setupRiskSettingsControls();
    setupPaperTradingControls();

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

            // Restore Body Scroll (iOS Safe)
            const scrollY = document.body.dataset.scrollY;
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            window.scrollTo(0, parseInt(scrollY || '0'));
            document.body.style.overflow = '';
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
});

// Handle visibility change (refresh when tab becomes visible)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && remainingSeconds < 60) {
        updateDashboard();
    }
});

// =====================================================
// Initialize Smart Money Strategy Trade Lists
// =====================================================

function initSmartMoneyTrades() {
    if (typeof SmartMoneyStrategy === 'undefined') return;

    const years = ['2022', '2023', '2024', '2025', '2026'];

    years.forEach(year => {
        const container = document.getElementById(`trades${year}`);
        if (!container) return;

        const trades = SmartMoneyStrategy.getTradesByYear(year);

        container.innerHTML = trades.map(trade => {
            const isWin = trade.result === 'WIN';
            const returnClass = isWin ? 'text-bullish' : 'text-bearish';
            const returnSign = trade.return >= 0 ? '+' : '';

            // Calculate duration
            const entryDate = new Date(trade.entry);
            const exitDate = new Date(trade.exit);
            const days = Math.ceil((exitDate - entryDate) / (1000 * 60 * 60 * 24));
            const duration = days === 0 ? '< 1 Tag' : days === 1 ? '1 Tag' : `${days} Tage`;

            return `
                <div class="trade-item ${isWin ? 'win' : 'loss'}">
                    <span class="trade-rank">#${trade.id}</span>
                    <span class="trade-date">${trade.entry}</span>
                    <span class="trade-prices">$${trade.entryPrice.toLocaleString()} → $${trade.exitPrice.toLocaleString()}</span>
                    <span class="trade-return ${returnClass}">${returnSign}${trade.return.toFixed(2)}%</span>
                    <span class="trade-duration">${duration}</span>
                </div>
            `;
        }).join('');
    });
}

// Run after DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSmartMoneyTrades);
} else {
    initSmartMoneyTrades();
}
