/**
 * BTC Smart Money Strategy - Telegram Bot
 * Sends LONG/EXIT signals based on Asymmetric Golden Cross Trading System
 *
 * Strategy Rules:
 * - LONG Entry: Golden Cross (EMA15 > EMA300) + HTF Filter (Price > EMA800) + RSI Zone (45-70)
 * - EXIT: Trailing Stop, Death Cross (profit < 5%), Time Stop (72h, profit < 0.5%)
 * - Stop Loss: Entry - (ATR × 2.5)
 * - Trailing Stop: 0-3 ATR = 2.5 ATR, 3-5 ATR = 2.0 ATR, 5+ ATR = 4.0 ATR
 *
 * Features:
 * - Real-time signal detection from 1H candles
 * - Full position tracking with entry price, trailing stop, profit
 * - Asymmetric trailing stop system (3 tiers)
 * - Death Cross exit only when profit < 5%
 * - Time stop: exit after 72h if profit < 0.5%
 * - Daily market update
 * - Instant notification on signal change
 *
 * Setup:
 * 1. Create a bot with @BotFather on Telegram
 * 2. Get your Chat ID from @userinfobot
 * 3. Set environment variables: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
 */

const https = require('https');
const fs = require('fs');

// =====================================================
// Configuration
// =====================================================

const CONFIG = {
    // Strategy Parameters (Asymmetric Golden Cross)
    strategy: {
        emaFast: 15,
        emaSlow: 300,
        emaHTF: 800,
        rsiPeriod: 14,
        rsiMin: 45,
        rsiMax: 70,
        atrPeriod: 14,
        atrMultiplier: 2.5,
        // Trailing Stop Tiers
        trail: {
            tier1: { triggerATR: 0, distanceATR: 2.5 },  // 0-3 ATR profit
            tier2: { triggerATR: 3, distanceATR: 2.0 },  // 3-5 ATR profit
            tier3: { triggerATR: 5, distanceATR: 4.0 }   // 5+ ATR profit
        },
        // Death Cross exit only if profit below this threshold
        deathCrossMaxProfit: 0.05, // 5%
        // Time Stop
        timeStopHours: 72,
        timeStopMinProfit: 0.005 // 0.5%
    },
    apis: {
        binance: 'https://api.binance.com/api/v3',
        fearGreed: 'https://api.alternative.me/fng/'
    },
    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID
    },
    stateFile: process.env.STATE_FILE || '/tmp/btc-smart-money-state.json'
};

// =====================================================
// State
// =====================================================

let state = {
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
    signalStrength: 0,

    // Trade levels
    stopLoss: 0,

    // Additional data
    fearGreedIndex: 0,
    priceChange24h: 0,

    lastUpdate: null
};

// =====================================================
// HTTP Helper
// =====================================================

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'User-Agent': 'BTC-Smart-Money-Bot/1.0'
            }
        };

        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`JSON parse error: ${e.message}`));
                }
            });
        }).on('error', reject);
    });
}

// =====================================================
// Data Fetching
// =====================================================

async function fetchKlines() {
    try {
        const url = `${CONFIG.apis.binance}/klines?symbol=BTCUSDT&interval=1h&limit=1000`;
        const data = await fetchJSON(url);

        const candles = data.map(candle => ({
            time: candle[0],
            open: parseFloat(candle[1]),
            high: parseFloat(candle[2]),
            low: parseFloat(candle[3]),
            close: parseFloat(candle[4]),
            volume: parseFloat(candle[5])
        }));

        console.log(`✓ Fetched ${candles.length} 1H candles`);
        return candles;
    } catch (error) {
        console.error('Error fetching klines:', error.message);
        throw error;
    }
}

async function fetchFearGreedIndex() {
    try {
        const data = await fetchJSON(CONFIG.apis.fearGreed);
        state.fearGreedIndex = parseInt(data.data[0].value);
        console.log(`✓ Fear & Greed: ${state.fearGreedIndex}`);
    } catch (error) {
        console.error('Error fetching F&G:', error.message);
        state.fearGreedIndex = 50; // Default
    }
}

async function fetchNews() {
    try {
        const data = await fetchJSON('https://min-api.cryptocompare.com/data/v2/news/?lang=EN');
        console.log(`✓ Fetched ${data.Data.length} news items`);
        return data.Data.slice(0, 3);
    } catch (error) {
        console.error('Error fetching news:', error.message);
        return [];
    }
}

async function fetch24hChange() {
    try {
        const data = await fetchJSON(`${CONFIG.apis.binance}/ticker/24hr?symbol=BTCUSDT`);
        state.priceChange24h = parseFloat(data.priceChangePercent);
        console.log(`✓ 24h Change: ${state.priceChange24h.toFixed(2)}%`);
    } catch (error) {
        console.error('Error fetching 24h change:', error.message);
        state.priceChange24h = 0;
    }
}

// =====================================================
// Technical Indicators
// =====================================================

function calculateEMA(prices, period) {
    if (prices.length < period) return null;

    const multiplier = 2 / (period + 1);

    // Start with SMA
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

    // Calculate EMA
    for (let i = period; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
    }

    return ema;
}

function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

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
}

function calculateATR(candles, period = 14) {
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

    const multiplier = 2 / (period + 1);
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < trueRanges.length; i++) {
        atr = (trueRanges[i] - atr) * multiplier + atr;
    }

    return atr;
}

// =====================================================
// Signal Calculation
// =====================================================

async function calculateSignal() {
    console.log('\n📊 Calculating Smart Money Signal...\n');

    const candles = await fetchKlines();
    const closePrices = candles.map(c => c.close);
    const currentPrice = closePrices[closePrices.length - 1];

    // Calculate indicators
    const emaFast = calculateEMA(closePrices, CONFIG.strategy.emaFast);
    const emaSlow = calculateEMA(closePrices, CONFIG.strategy.emaSlow);
    const emaHTF = calculateEMA(closePrices, CONFIG.strategy.emaHTF);
    const rsi = calculateRSI(closePrices, CONFIG.strategy.rsiPeriod);
    const atr = calculateATR(candles, CONFIG.strategy.atrPeriod);

    // Update state
    state.currentPrice = currentPrice;
    state.emaFast = emaFast;
    state.emaSlow = emaSlow;
    state.emaHTF = emaHTF;
    state.rsi = rsi;
    state.atr = atr;
    state.lastUpdate = new Date();

    // Check conditions
    state.goldenCross = emaFast > emaSlow;
    state.htfFilter = currentPrice > emaHTF;
    state.rsiInZone = rsi >= CONFIG.strategy.rsiMin && rsi <= CONFIG.strategy.rsiMax;

    // Calculate signal strength (0-3)
    state.signalStrength =
        (state.goldenCross ? 1 : 0) +
        (state.htfFilter ? 1 : 0) +
        (state.rsiInZone ? 1 : 0);

    // Determine signal
    if (state.goldenCross && state.htfFilter && state.rsiInZone) {
        state.signal = 'LONG';
    } else if (!state.goldenCross) {
        state.signal = 'EXIT';
    } else {
        state.signal = 'NEUTRAL';
    }

    // Calculate initial stop loss (for new entries)
    state.stopLoss = currentPrice - (atr * CONFIG.strategy.atrMultiplier);

    // Log results
    console.log(`💰 Preis: $${currentPrice.toLocaleString()}`);
    console.log(`📈 EMA(15): $${emaFast?.toFixed(0)} | EMA(300): $${emaSlow?.toFixed(0)} | EMA(800): $${emaHTF?.toFixed(0)}`);
    console.log(`📊 RSI(14): ${rsi?.toFixed(1)}`);
    console.log(`📏 ATR(14): $${atr?.toFixed(0)}`);
    console.log(`\n✅ Golden Cross: ${state.goldenCross ? 'JA' : 'NEIN'}`);
    console.log(`✅ HTF Filter: ${state.htfFilter ? 'JA' : 'NEIN'}`);
    console.log(`✅ RSI Zone: ${state.rsiInZone ? 'JA' : 'NEIN'}`);
    console.log(`\n🎯 Signal: ${state.signal} (${state.signalStrength}/3 Bedingungen)`);

    return state;
}

// =====================================================
// Position Management
// =====================================================

function calculateTrailingStop(entryPrice, currentPrice, atr) {
    const profitATR = (currentPrice - entryPrice) / atr;
    const { trail } = CONFIG.strategy;

    let distanceATR;
    let tier;
    if (profitATR >= trail.tier3.triggerATR) {
        distanceATR = trail.tier3.distanceATR;
        tier = 3;
    } else if (profitATR >= trail.tier2.triggerATR) {
        distanceATR = trail.tier2.distanceATR;
        tier = 2;
    } else {
        distanceATR = trail.tier1.distanceATR;
        tier = 1;
    }

    const newStop = currentPrice - (atr * distanceATR);
    return { newStop, distanceATR, tier, profitATR };
}

function checkExitConditions(position, currentPrice, atr) {
    const entryPrice = position.entryPrice;
    const profitPct = (currentPrice - entryPrice) / entryPrice;
    const hoursInTrade = (Date.now() - new Date(position.entryTime).getTime()) / (1000 * 60 * 60);

    const reasons = [];

    // 1. Trailing Stop Hit
    if (position.trailingStop && currentPrice <= position.trailingStop) {
        reasons.push({
            type: 'TRAILING_STOP',
            message: `Trailing Stop erreicht bei $${position.trailingStop.toFixed(0)}`,
            profitPct
        });
    }

    // 2. Death Cross - only exit if profit < 5%
    if (!state.goldenCross && profitPct < CONFIG.strategy.deathCrossMaxProfit) {
        reasons.push({
            type: 'DEATH_CROSS',
            message: `Death Cross bei ${(profitPct * 100).toFixed(2)}% Profit (< 5% Schwelle)`,
            profitPct
        });
    }

    // 3. Time Stop - exit after 72h if profit < 0.5%
    if (hoursInTrade >= CONFIG.strategy.timeStopHours && profitPct < CONFIG.strategy.timeStopMinProfit) {
        reasons.push({
            type: 'TIME_STOP',
            message: `${hoursInTrade.toFixed(0)}h in Position bei nur ${(profitPct * 100).toFixed(2)}% Profit`,
            profitPct
        });
    }

    return reasons;
}

// =====================================================
// Telegram
// =====================================================

async function sendTelegramMessage(message) {
    if (!CONFIG.telegram.botToken || !CONFIG.telegram.chatId) {
        console.error('❌ Telegram credentials not configured!');
        console.log('Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables');
        return false;
    }

    const url = `https://api.telegram.org/bot${CONFIG.telegram.botToken}/sendMessage`;
    const data = JSON.stringify({
        chat_id: CONFIG.telegram.chatId,
        text: message,
        parse_mode: 'HTML'
    });

    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log('✅ Telegram message sent!');
                    resolve(true);
                } else {
                    console.error('❌ Telegram error:', responseData);
                    resolve(false);
                }
            });
        });

        req.on('error', (e) => {
            console.error('❌ Telegram request failed:', e.message);
            reject(e);
        });

        req.write(data);
        req.end();
    });
}

// =====================================================
// Message Formatting
// =====================================================

function formatEntryMessage(position) {
    let msg = `🟢 <b>SMART MONEY LONG</b> 🟢\n\n`;

    msg += `<b>💰 BTC Preis:</b> $${state.currentPrice.toLocaleString()}\n`;
    msg += `<b>📊 Signal-Stärke:</b> ${state.signalStrength}/3\n\n`;

    msg += `<b>📋 Entry-Bedingungen:</b>\n`;
    msg += `✅ Golden Cross (EMA15 > EMA300)\n`;
    msg += `✅ HTF Filter (Preis > EMA800)\n`;
    msg += `✅ RSI Zone (${CONFIG.strategy.rsiMin}-${CONFIG.strategy.rsiMax})\n\n`;

    msg += `<b>📈 Indikatoren:</b>\n`;
    msg += `• EMA(15): $${state.emaFast?.toFixed(0)}\n`;
    msg += `• EMA(300): $${state.emaSlow?.toFixed(0)}\n`;
    msg += `• EMA(800): $${state.emaHTF?.toFixed(0)}\n`;
    msg += `• RSI(14): ${state.rsi?.toFixed(1)}\n`;
    msg += `• ATR(14): $${state.atr?.toFixed(0)}\n\n`;

    msg += `<b>📍 Trade Setup:</b>\n`;
    msg += `• Entry: $${position.entryPrice.toLocaleString()}\n`;
    msg += `• Stop Loss: $${position.trailingStop.toLocaleString(undefined, { maximumFractionDigits: 0 })} (ATR×2.5)\n`;
    msg += `• Trailing: Tier 1 (2.5 ATR)\n\n`;

    msg += `<b>📐 Trailing Stop System:</b>\n`;
    msg += `• 0-3 ATR Profit → 2.5 ATR Distanz\n`;
    msg += `• 3-5 ATR Profit → 2.0 ATR Distanz\n`;
    msg += `• 5+ ATR Profit → 4.0 ATR Distanz\n\n`;

    msg += `<b>🎯 Empfehlung:</b> 📈 LONG EINSTIEG\n\n`;
    msg += `⏰ ${new Date().toLocaleString('de-DE')}`;

    return msg;
}

function formatExitMessage(position, exitReasons) {
    const profitPct = ((state.currentPrice - position.entryPrice) / position.entryPrice * 100);
    const profitEmoji = profitPct >= 0 ? '✅' : '❌';
    const hoursInTrade = ((Date.now() - new Date(position.entryTime).getTime()) / (1000 * 60 * 60));

    let msg = `🔴 <b>SMART MONEY EXIT</b> 🔴\n\n`;

    msg += `<b>📊 Exit-Grund:</b>\n`;
    exitReasons.forEach(r => {
        const icon = r.type === 'TRAILING_STOP' ? '📉' : r.type === 'DEATH_CROSS' ? '💀' : '⏰';
        msg += `${icon} ${r.message}\n`;
    });
    msg += `\n`;

    msg += `<b>💰 Trade-Ergebnis:</b>\n`;
    msg += `• Entry: $${position.entryPrice.toLocaleString()}\n`;
    msg += `• Exit: $${state.currentPrice.toLocaleString()}\n`;
    msg += `• ${profitEmoji} P/L: ${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(2)}%\n`;
    msg += `• Dauer: ${hoursInTrade.toFixed(0)}h\n`;
    if (position.highestPrice) {
        const maxProfit = ((position.highestPrice - position.entryPrice) / position.entryPrice * 100);
        msg += `• Max Profit: +${maxProfit.toFixed(2)}% ($${position.highestPrice.toLocaleString()})\n`;
    }
    msg += `\n`;

    msg += `<b>📈 Indikatoren bei Exit:</b>\n`;
    msg += `• EMA(15): $${state.emaFast?.toFixed(0)}\n`;
    msg += `• EMA(300): $${state.emaSlow?.toFixed(0)}\n`;
    msg += `• RSI(14): ${state.rsi?.toFixed(1)}\n\n`;

    msg += `<b>🎯 Empfehlung:</b> 🚫 POSITION SCHLIEßEN\n\n`;
    msg += `⏰ ${new Date().toLocaleString('de-DE')}`;

    return msg;
}

function formatTrailingUpdateMessage(position, trailInfo) {
    const profitPct = ((state.currentPrice - position.entryPrice) / position.entryPrice * 100);

    let msg = `📈 <b>TRAILING STOP UPDATE</b> 📈\n\n`;

    msg += `<b>💰 BTC:</b> $${state.currentPrice.toLocaleString()} (+${profitPct.toFixed(2)}%)\n\n`;

    msg += `<b>🔄 Neuer Trailing Stop:</b>\n`;
    msg += `• Stop: $${position.trailingStop.toLocaleString(undefined, { maximumFractionDigits: 0 })}\n`;
    msg += `• Tier: ${trailInfo.tier} (${trailInfo.distanceATR} ATR Distanz)\n`;
    msg += `• Profit: ${trailInfo.profitATR.toFixed(1)} ATR\n\n`;

    msg += `<b>📍 Position:</b>\n`;
    msg += `• Entry: $${position.entryPrice.toLocaleString()}\n`;
    msg += `• P/L: +${profitPct.toFixed(2)}%\n\n`;

    msg += `⏰ ${new Date().toLocaleString('de-DE')}`;

    return msg;
}

function formatSignalMessage() {
    const emoji = state.signal === 'LONG' ? '🟢' : state.signal === 'EXIT' ? '🔴' : '⚪';
    const action = state.signal === 'LONG' ? '📈 LONG EINSTIEG' :
        state.signal === 'EXIT' ? '🚫 POSITION SCHLIEßEN' : '⏸️ ABWARTEN';

    let message = `${emoji} <b>SMART MONEY ${state.signal}</b> ${emoji}\n\n`;

    message += `<b>💰 BTC Preis:</b> $${state.currentPrice.toLocaleString()}\n`;
    message += `<b>📊 Signal-Stärke:</b> ${state.signalStrength}/3\n\n`;

    message += `<b>📋 Entry-Bedingungen:</b>\n`;
    message += `${state.goldenCross ? '✅' : '❌'} Golden Cross (EMA15 > EMA300)\n`;
    message += `${state.htfFilter ? '✅' : '❌'} HTF Filter (Preis > EMA800)\n`;
    message += `${state.rsiInZone ? '✅' : '❌'} RSI Zone (${CONFIG.strategy.rsiMin}-${CONFIG.strategy.rsiMax})\n\n`;

    message += `<b>📈 Indikatoren:</b>\n`;
    message += `• EMA(15): $${state.emaFast?.toFixed(0)}\n`;
    message += `• EMA(300): $${state.emaSlow?.toFixed(0)}\n`;
    message += `• EMA(800): $${state.emaHTF?.toFixed(0)}\n`;
    message += `• RSI(14): ${state.rsi?.toFixed(1)}\n`;
    message += `• ATR(14): $${state.atr?.toFixed(0)}\n\n`;

    message += `<b>🎯 Empfehlung:</b> ${action}\n\n`;
    message += `⏰ ${new Date().toLocaleString('de-DE')}`;

    return message;
}

function formatDailyUpdate(newsItems = []) {
    const s = state;
    const now = new Date();
    const dateStr = now.toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // F&G
    const fgValue = s.fearGreedIndex;
    let fgText = 'Neutral';
    if (fgValue < 25) fgText = 'Extreme Angst';
    else if (fgValue < 45) fgText = 'Angst';
    else if (fgValue > 75) fgText = 'Extreme Gier';
    else if (fgValue > 55) fgText = 'Gier';

    // Calculation for Score (Approximation based on SM strategy and F&G)
    let score = 5.0;
    let analysisText = "Der Markt zeigt sich unentschlossen.";
    let trendScore = 5;

    // EMA Diff
    let diff = 0;
    if (s.emaFast && s.emaSlow) {
        diff = (s.emaFast - s.emaSlow) / s.emaSlow * 100;
    }

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
    if (fgValue < 20) score += 1;
    else if (fgValue > 80) score -= 1;

    score = Math.min(10, Math.max(0, score));

    // Build Message
    let message = `🌅 *Guten Morgen! Dein BTC Update*\n`;
    message += `📅 ${dateStr}\n\n`;

    message += `💰 *Marktübersicht:*\n`;
    message += `BTC Preis: $${s.currentPrice?.toLocaleString()} (${s.priceChange24h >= 0 ? '+' : ''}${s.priceChange24h.toFixed(2)}%)\n`;
    message += `Fear & Greed: ${fgValue} (${fgText})\n`;
    message += `Score: ${score.toFixed(1)}/10\n\n`;

    message += `🔬 *Analyse & Bewertung:*\n`;
    message += `"${analysisText}"\n\n`;

    message += `📊 *Die Faktoren heute:*\n`;
    message += `• Technik (35%): ${trendScore.toFixed(1)}/10\n`;
    message += `• Momentum (25%): ${(s.rsi / 10).toFixed(1)}/10\n`;
    message += `• Sentiment (20%): ${(fgValue / 10).toFixed(1)}/10\n`;
    message += `• Macro (20%): ${(s.htfFilter ? 7 : 3).toFixed(1)}/10\n\n`;

    // Show active position info in daily update
    const prevState = loadPreviousState();
    if (prevState.position) {
        const pos = prevState.position;
        const profitPct = ((s.currentPrice - pos.entryPrice) / pos.entryPrice * 100);
        const hoursInTrade = ((Date.now() - new Date(pos.entryTime).getTime()) / (1000 * 60 * 60));

        message += `📍 *Aktive Position:*\n`;
        message += `• Entry: $${pos.entryPrice.toLocaleString()} (${hoursInTrade.toFixed(0)}h)\n`;
        message += `• P/L: ${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(2)}%\n`;
        message += `• Trailing Stop: $${pos.trailingStop?.toLocaleString(undefined, { maximumFractionDigits: 0 })}\n`;
        message += `• Tier: ${pos.currentTier || 1}\n\n`;
    }

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

    if (newsItems && newsItems.length > 0) {
        message += `📰 *Crypto News:*\n`;
        newsItems.forEach(n => {
            message += `• [${n.source}] ${n.title}\n`;
        });
    }

    return message;
}

// =====================================================
// State Persistence
// =====================================================

function loadPreviousState() {
    try {
        if (fs.existsSync(CONFIG.stateFile)) {
            const data = fs.readFileSync(CONFIG.stateFile, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.log('No previous state found');
    }
    return { signal: 'NEUTRAL', lastNotified: null, lastDailyUpdate: null, position: null };
}

function saveState(data) {
    try {
        fs.writeFileSync(CONFIG.stateFile, JSON.stringify(data));
    } catch (e) {
        console.error('Could not save state:', e.message);
    }
}

// =====================================================
// Main Functions
// =====================================================

async function checkSignal() {
    console.log('🚀 BTC Smart Money Strategy - Signal Check\n');
    console.log('='.repeat(50));

    await calculateSignal();
    await fetchFearGreedIndex();
    await fetch24hChange();

    console.log('\n' + '='.repeat(50));

    const previousState = loadPreviousState();
    const hasPosition = previousState.position != null;

    // ---- CASE 1: We have an active position → manage it ----
    if (hasPosition) {
        const position = previousState.position;
        console.log(`\n📍 Aktive Position: Entry $${position.entryPrice} seit ${position.entryTime}`);

        const profitPct = ((state.currentPrice - position.entryPrice) / position.entryPrice * 100);
        console.log(`💰 Aktueller Profit: ${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(2)}%`);

        // Update highest price
        if (state.currentPrice > (position.highestPrice || position.entryPrice)) {
            position.highestPrice = state.currentPrice;
        }

        // Calculate new trailing stop
        const trailInfo = calculateTrailingStop(position.entryPrice, state.currentPrice, state.atr);
        const oldStop = position.trailingStop;
        const oldTier = position.currentTier || 1;

        // Trailing stop can only go UP (never down)
        if (trailInfo.newStop > position.trailingStop) {
            position.trailingStop = trailInfo.newStop;
            console.log(`📈 Trailing Stop angehoben: $${oldStop?.toFixed(0)} → $${position.trailingStop.toFixed(0)}`);
        }
        position.currentTier = trailInfo.tier;

        // Notify on tier change
        if (trailInfo.tier > oldTier) {
            console.log(`🔄 Trailing Tier Upgrade: ${oldTier} → ${trailInfo.tier}`);
            await sendTelegramMessage(formatTrailingUpdateMessage(position, trailInfo));
        }

        // Check exit conditions
        const exitReasons = checkExitConditions(position, state.currentPrice, state.atr);

        if (exitReasons.length > 0) {
            // EXIT - close position
            console.log(`\n🔴 EXIT! Gründe: ${exitReasons.map(r => r.type).join(', ')}`);
            await sendTelegramMessage(formatExitMessage(position, exitReasons));

            // Clear position
            saveState({
                signal: state.signal,
                lastNotified: new Date().toISOString(),
                lastDailyUpdate: previousState.lastDailyUpdate,
                position: null
            });
        } else {
            // Still in trade - save updated position
            console.log(`\n✓ Position aktiv. Stop: $${position.trailingStop.toFixed(0)} | Tier: ${position.currentTier}`);
            saveState({
                signal: state.signal,
                lastNotified: previousState.lastNotified,
                lastDailyUpdate: previousState.lastDailyUpdate,
                position
            });
        }
    }
    // ---- CASE 2: No position → check for new entry ----
    else {
        const signalChanged = previousState.signal !== state.signal;

        if (state.signal === 'LONG' && (signalChanged || previousState.signal !== 'LONG')) {
            console.log('\n🟢 NEUES LONG SIGNAL! Position eröffnen.');

            const newPosition = {
                entryPrice: state.currentPrice,
                entryTime: new Date().toISOString(),
                trailingStop: state.currentPrice - (state.atr * CONFIG.strategy.atrMultiplier),
                highestPrice: state.currentPrice,
                currentTier: 1,
                entryATR: state.atr
            };

            await sendTelegramMessage(formatEntryMessage(newPosition));

            saveState({
                signal: state.signal,
                lastNotified: new Date().toISOString(),
                lastDailyUpdate: previousState.lastDailyUpdate,
                position: newPosition
            });
        } else if (signalChanged && state.signal === 'NEUTRAL') {
            console.log('\n⚪ Signal zurück auf NEUTRAL');
            saveState({
                signal: state.signal,
                lastNotified: previousState.lastNotified,
                lastDailyUpdate: previousState.lastDailyUpdate,
                position: null
            });
        } else {
            console.log(`\n✓ Kein Signal (aktuell: ${state.signal})`);
            saveState({
                signal: state.signal,
                lastNotified: previousState.lastNotified,
                lastDailyUpdate: previousState.lastDailyUpdate,
                position: null
            });
        }
    }

    console.log('\n✅ Signal check completed!');
}

async function sendDailyUpdate() {
    console.log('📅 BTC Smart Money Strategy - Daily Update\n');
    console.log('='.repeat(50));

    await calculateSignal();
    await fetchFearGreedIndex();
    await fetch24hChange();
    const news = await fetchNews();

    console.log('\n' + '='.repeat(50));

    const previousState = loadPreviousState();

    console.log('\n📤 Sending daily update...');
    await sendTelegramMessage(formatDailyUpdate(news));

    // Update last daily update timestamp (preserve position!)
    saveState({
        signal: previousState.signal,
        lastNotified: previousState.lastNotified,
        lastDailyUpdate: new Date().toISOString(),
        position: previousState.position
    });

    console.log('\n✅ Daily update sent!');
}

// =====================================================
// Entry Point
// =====================================================

const args = process.argv.slice(2);
const command = args[0] || 'check';

switch (command) {
    case 'daily':
        sendDailyUpdate().catch(console.error);
        break;
    case 'check':
    default:
        checkSignal().catch(console.error);
        break;
}
