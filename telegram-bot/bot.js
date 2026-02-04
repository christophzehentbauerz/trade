/**
 * BTC Market Intelligence - Telegram Bot
 * Sends trading signals to Telegram when LONG or SHORT is detected
 * 
 * Setup:
 * 1. Create a bot with @BotFather on Telegram
 * 2. Get your Chat ID from @userinfobot
 * 3. Set environment variables: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
 */

const https = require('https');

// =====================================================
// Configuration
// =====================================================

const CONFIG = {
    apis: {
        coinGecko: 'https://api.coingecko.com/api/v3',
        fearGreed: 'https://api.alternative.me/fng/',
        binanceFutures: 'https://fapi.binance.com/fapi/v1'
    },
    weights: {
        technical: 0.35,
        onchain: 0.25,
        sentiment: 0.20,
        macro: 0.20
    },
    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID
    }
};

// =====================================================
// State
// =====================================================

let state = {
    price: null,
    priceChange24h: null,
    ath: null,
    athChange: null,
    fearGreedIndex: null,
    fundingRate: null,
    openInterest: null,
    longShortRatio: { long: 50, short: 50 },
    priceHistory: [],
    scores: {
        technical: 5,
        onchain: 5,
        sentiment: 5,
        macro: 5
    },
    signal: 'NEUTRAL',
    confidence: 50
};

// =====================================================
// HTTP Helper
// =====================================================

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// =====================================================
// Data Fetching
// =====================================================

async function fetchPriceData() {
    try {
        const data = await fetchJSON(
            `${CONFIG.apis.coinGecko}/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`
        );
        state.price = data.bitcoin.usd;
        state.priceChange24h = data.bitcoin.usd_24h_change;
        console.log(`✓ Price: $${state.price.toLocaleString()}`);
    } catch (error) {
        console.error('Error fetching price:', error.message);
    }
}

async function fetchPriceHistory() {
    try {
        // Using hourly data for more accurate signals (7 days = ~168 hourly candles)
        const data = await fetchJSON(
            `${CONFIG.apis.coinGecko}/coins/bitcoin/market_chart?vs_currency=usd&days=7&interval=hourly`
        );
        state.priceHistory = data.prices.map(p => p[1]);
        state.ath = 109000; // Approximate ATH
        state.athChange = ((state.price - state.ath) / state.ath) * 100;
        console.log(`✓ Price History: ${state.priceHistory.length} hours`);
    } catch (error) {
        console.error('Error fetching history:', error.message);
    }
}

async function fetchFearGreedIndex() {
    try {
        const data = await fetchJSON(CONFIG.apis.fearGreed);
        state.fearGreedIndex = parseInt(data.data[0].value);
        console.log(`✓ Fear & Greed: ${state.fearGreedIndex}`);
    } catch (error) {
        console.error('Error fetching F&G:', error.message);
    }
}

async function fetchFundingRate() {
    try {
        const data = await fetchJSON(`${CONFIG.apis.binanceFutures}/fundingRate?symbol=BTCUSDT&limit=1`);
        state.fundingRate = parseFloat(data[0].fundingRate) * 100;
        console.log(`✓ Funding Rate: ${state.fundingRate.toFixed(4)}%`);
    } catch (error) {
        console.error('Error fetching funding:', error.message);
    }
}

async function fetchOpenInterest() {
    try {
        const data = await fetchJSON(`${CONFIG.apis.binanceFutures}/openInterest?symbol=BTCUSDT`);
        state.openInterest = parseFloat(data.openInterest) * state.price;
        console.log(`✓ Open Interest: $${(state.openInterest / 1e9).toFixed(2)}B`);
    } catch (error) {
        console.error('Error fetching OI:', error.message);
    }
}

async function fetchLongShortRatio() {
    try {
        const data = await fetchJSON(
            `${CONFIG.apis.binanceFutures}/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1`
        );
        const ratio = parseFloat(data[0].longShortRatio);
        const longPercent = (ratio / (1 + ratio)) * 100;
        state.longShortRatio = {
            long: longPercent,
            short: 100 - longPercent
        };
        console.log(`✓ Long/Short: ${longPercent.toFixed(1)}% / ${(100 - longPercent).toFixed(1)}%`);
    } catch (error) {
        console.error('Error fetching L/S:', error.message);
    }
}

// =====================================================
// Technical Indicators
// =====================================================

function calculateRSI(prices) {
    if (prices.length < 14) return 50;

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
}

function determineTrend(prices) {
    if (prices.length < 7) return 'sideways';

    const recent = prices.slice(-7);
    const older = prices.slice(-14, -7);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    const change = ((recentAvg - olderAvg) / olderAvg) * 100;

    if (change > 3) return 'bullish';
    if (change < -3) return 'bearish';
    return 'sideways';
}

// =====================================================
// Score Calculation
// =====================================================

function calculateScores() {
    // Technical Score
    const rsi = calculateRSI(state.priceHistory);
    const trend = determineTrend(state.priceHistory);

    let technicalScore = 5;
    if (rsi < 30) technicalScore += 2.5;
    else if (rsi < 40) technicalScore += 1.5;
    else if (rsi > 70) technicalScore -= 2.5;
    else if (rsi > 60) technicalScore -= 1.5;

    if (trend === 'bullish') technicalScore += 1.5;
    else if (trend === 'bearish') technicalScore -= 1.5;

    state.scores.technical = Math.max(0, Math.min(10, technicalScore));

    // On-chain Score (based on momentum)
    let onchainScore = 5;
    if (state.priceChange24h > 5) onchainScore += 2;
    else if (state.priceChange24h > 2) onchainScore += 1;
    else if (state.priceChange24h < -5) onchainScore -= 2;
    else if (state.priceChange24h < -2) onchainScore -= 1;

    state.scores.onchain = Math.max(0, Math.min(10, onchainScore));

    // Sentiment Score (contrarian)
    let sentimentScore = 5;

    // Fear & Greed (contrarian)
    if (state.fearGreedIndex < 25) sentimentScore += 2.5;
    else if (state.fearGreedIndex < 35) sentimentScore += 1.5;
    else if (state.fearGreedIndex > 75) sentimentScore -= 2.5;
    else if (state.fearGreedIndex > 65) sentimentScore -= 1.5;

    // Funding Rate (contrarian)
    if (state.fundingRate < -0.01) sentimentScore += 1.5;
    else if (state.fundingRate > 0.05) sentimentScore -= 1.5;

    // Long/Short Ratio (contrarian)
    if (state.longShortRatio.long > 60) sentimentScore -= 1;
    else if (state.longShortRatio.long < 40) sentimentScore += 1;

    state.scores.sentiment = Math.max(0, Math.min(10, sentimentScore));

    // Macro Score
    let macroScore = 5;
    if (state.athChange < -30) macroScore += 2;
    else if (state.athChange < -15) macroScore += 1;
    else if (state.athChange > -5) macroScore -= 1;

    state.scores.macro = Math.max(0, Math.min(10, macroScore));

    // Calculate weighted score
    const weightedScore =
        state.scores.technical * CONFIG.weights.technical +
        state.scores.onchain * CONFIG.weights.onchain +
        state.scores.sentiment * CONFIG.weights.sentiment +
        state.scores.macro * CONFIG.weights.macro;

    // Determine signal
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

    console.log(`\n📊 Scores: Tech=${state.scores.technical.toFixed(1)} On-Chain=${state.scores.onchain.toFixed(1)} Sentiment=${state.scores.sentiment.toFixed(1)} Macro=${state.scores.macro.toFixed(1)}`);
    console.log(`📈 Weighted Score: ${weightedScore.toFixed(2)}/10`);
    console.log(`🎯 Signal: ${state.signal} (${state.confidence.toFixed(0)}% confidence)`);
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

function formatSignalMessage() {
    const emoji = state.signal === 'LONG' ? '🟢' : state.signal === 'SHORT' ? '🔴' : '⚪';
    const direction = state.signal === 'LONG' ? '📈 KAUFEN' : state.signal === 'SHORT' ? '📉 VERKAUFEN' : '⏸️ ABWARTEN';

    const rsi = calculateRSI(state.priceHistory);
    const trend = determineTrend(state.priceHistory);

    let message = `${emoji} <b>BTC ${state.signal} SIGNAL</b> ${emoji}\n\n`;
    message += `<b>💰 Preis:</b> $${state.price.toLocaleString()}\n`;
    message += `<b>📊 Score:</b> ${state.weightedScore.toFixed(1)}/10\n`;
    message += `<b>🎯 Konfidenz:</b> ${state.confidence.toFixed(0)}%\n\n`;

    message += `<b>📋 Indikatoren:</b>\n`;
    message += `• RSI: ${rsi.toFixed(0)} ${rsi < 40 ? '(überverkauft)' : rsi > 60 ? '(überkauft)' : '(neutral)'}\n`;
    message += `• Trend: ${trend === 'bullish' ? '📈 Bullish' : trend === 'bearish' ? '📉 Bearish' : '➡️ Seitwärts'}\n`;
    message += `• F&G: ${state.fearGreedIndex} ${state.fearGreedIndex < 35 ? '(Angst)' : state.fearGreedIndex > 65 ? '(Gier)' : '(Neutral)'}\n`;
    message += `• Funding: ${state.fundingRate.toFixed(4)}%\n`;
    message += `• L/S: ${state.longShortRatio.long.toFixed(0)}% / ${state.longShortRatio.short.toFixed(0)}%\n\n`;

    message += `<b>🎯 Empfehlung:</b> ${direction}\n\n`;

    if (state.signal !== 'NEUTRAL') {
        // Entry Zone
        const entryLow = state.signal === 'LONG' ? state.price * 0.98 : state.price * 1.00;
        const entryHigh = state.signal === 'LONG' ? state.price * 1.00 : state.price * 1.02;

        // Stop Loss (6% statt 3%)
        const stopLoss = state.signal === 'LONG' ? state.price * 0.94 : state.price * 1.06;

        // Take Profit Targets (3 Stufen)
        const tp1 = state.signal === 'LONG' ? state.price * 1.04 : state.price * 0.96;
        const tp2 = state.signal === 'LONG' ? state.price * 1.08 : state.price * 0.92;
        const tp3 = state.signal === 'LONG' ? state.price * 1.12 : state.price * 0.88;

        message += `<b>📍 Trade Setup:</b>\n`;
        message += `• Entry Zone: $${entryLow.toLocaleString()} - $${entryHigh.toLocaleString()}\n`;
        message += `• Stop Loss: $${stopLoss.toLocaleString()}\n`;
        message += `• TP1 (R:R 1:1): $${tp1.toLocaleString()}\n`;
        message += `• TP2 (R:R 1:2): $${tp2.toLocaleString()}\n`;
        message += `• TP3 (R:R 1:3): $${tp3.toLocaleString()}\n`;
    }

    message += `\n⏰ ${new Date().toLocaleString('de-DE')}`;

    return message;
}

function formatDailyReport() {
    const rsi = calculateRSI(state.priceHistory);
    const trend = determineTrend(state.priceHistory);
    const date = new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    let sentimentText = "";
    if (state.fearGreedIndex < 25) sentimentText = "Extreme Angst herrscht im Markt. Historisch oft gute Kaufgelegenheiten, aber Vorsicht ist geboten.";
    else if (state.fearGreedIndex < 45) sentimentText = "Der Markt ist ängstlich. Investoren sind zurückhaltend.";
    else if (state.fearGreedIndex > 75) sentimentText = "Extreme Gier dominiert. Der Markt könnte überhitzt sein (Korrekturgefahr).";
    else sentimentText = "Die Marktstimmung ist neutral ausgeglichen.";

    let technicalAnalysis = "";
    if (trend === 'bullish') technicalAnalysis = "Der Trend ist aufwärts gerichtet (Bullish).";
    else if (trend === 'bearish') technicalAnalysis = "Der Trend ist abwärts gerichtet (Bearish).";
    else technicalAnalysis = "Der Markt bewegt sich seitwärts ohne klare Richtung.";

    if (rsi < 30) technicalAnalysis += " Der RSI deutet auf einen überverkauften Zustand hin (Rebound möglich).";
    else if (rsi > 70) technicalAnalysis += " Der RSI signalisiert einen überkauften Markt (Rücksetzer möglich).";

    let message = `🌅 <b>Guten Morgen! Dein BTC Update</b>\n`;
    message += `📅 ${date}\n\n`;

    message += `<b>💰 Marktübersicht:</b>\n`;
    message += `BTC Pries: <b>$${state.price.toLocaleString()}</b> (${state.priceChange24h > 0 ? '+' : ''}${state.priceChange24h.toFixed(2)}%)\n`;
    message += `Fear & Greed: <b>${state.fearGreedIndex}</b> (${state.fearGreedIndex < 35 ? 'Angst' : state.fearGreedIndex > 65 ? 'Gier' : 'Neutral'})\n`;
    message += `Score: <b>${state.weightedScore.toFixed(1)}/10</b>\n\n`;

    message += `<b>🔬 Analyse & Bewertung:</b>\n`;
    message += `<i>"${sentimentText} ${technicalAnalysis}"</i>\n\n`;

    message += `<b>📊 Die Faktoren heute:</b>\n`;
    message += `• Technik (${(CONFIG.weights.technical * 100).toFixed(0)}%): <b>${state.scores.technical.toFixed(1)}/10</b>\n`;
    message += `• On-Chain (${(CONFIG.weights.onchain * 100).toFixed(0)}%): <b>${state.scores.onchain.toFixed(1)}/10</b>\n`;
    message += `• Sentiment (${(CONFIG.weights.sentiment * 100).toFixed(0)}%): <b>${state.scores.sentiment.toFixed(1)}/10</b>\n`;
    message += `• Macro (${(CONFIG.weights.macro * 100).toFixed(0)}%): <b>${state.scores.macro.toFixed(1)}/10</b>\n\n`;

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

    message += `\n<i>Viel Erfolg heute!</i> ☕`;
    return message;
}

// =====================================================
// State Persistence (using file)
// =====================================================

const fs = require('fs');
const STATE_FILE = '/tmp/btc-signal-state.json';

function loadPreviousState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = fs.readFileSync(STATE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.log('No previous state found');
    }
    return { signal: 'NEUTRAL', lastNotified: null, earlyWarningShown: false };
}

function saveCurrentState(earlyWarningShown = false) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify({
            signal: state.signal,
            lastNotified: new Date().toISOString(),
            earlyWarningShown: earlyWarningShown,
            lastPrice: state.price
        }));
    } catch (e) {
        console.error('Could not save state:', e.message);
    }
}

// =====================================================
// Main Function
// =====================================================

async function main() {
    console.log('🚀 BTC Market Intelligence - Telegram Bot\n');
    console.log('='.repeat(50));

    // Fetch all data
    await fetchPriceData();
    await fetchPriceHistory();
    await fetchFearGreedIndex();
    await fetchFundingRate();
    await fetchOpenInterest();
    await fetchLongShortRatio();

    // Calculate scores
    calculateScores();

    console.log('\n' + '='.repeat(50));

    // Check if we should send notification
    const previousState = loadPreviousState();

    // DAILY REPORT MODE
    if (process.env.REPORT_MODE === 'true') {
        console.log('📰 Sende Daily Morning Report...');
        const dailyReport = formatDailyReport();
        await sendTelegramMessage(dailyReport);
        console.log('✅ Daily Report gesendet!');
        return;
    }

    const signalChanged = previousState.signal !== state.signal;
    const isActiveSignal = state.signal === 'LONG' || state.signal === 'SHORT';

    if (signalChanged && isActiveSignal) {
        console.log(`\n🔔 Signal changed from ${previousState.signal} to ${state.signal}!`);
        const message = formatSignalMessage();
        await sendTelegramMessage(message);
        saveCurrentState();
    } else if (signalChanged && state.signal === 'NEUTRAL') {
        console.log(`\n⚪ Signal zurück auf NEUTRAL`);
        await sendTelegramMessage(`⚪ <b>Signal zurückgesetzt</b>\n\nDas Signal ist wieder NEUTRAL.\nKein Trade empfohlen.\n\n⏰ ${new Date().toLocaleString('de-DE')}`);
        saveCurrentState();
    } else {
        console.log(`\n✓ Kein Signalwechsel (aktuell: ${state.signal})`);

        // EARLY WARNING: Notify when price approaches entry zone
        if (isActiveSignal && !previousState.earlyWarningShown) {
            const entryPrice = state.price; // Current analysis entry
            const currentPrice = state.price;

            // For LONG: warn when price is 1-2% below entry
            // For SHORT: warn when price is 1-2% above entry
            let shouldWarn = false;
            let distancePercent = 0;

            if (state.signal === 'LONG') {
                // Entry at 90k, warn at 88.2k-89.1k (2% - 1% below)
                const lowerBound = entryPrice * 0.98;  // 2% below
                const upperBound = entryPrice * 0.99;  // 1% below

                if (currentPrice >= lowerBound && currentPrice < upperBound) {
                    shouldWarn = true;
                    distancePercent = ((entryPrice - currentPrice) / entryPrice * 100);
                }
            } else if (state.signal === 'SHORT') {
                // Entry at 90k, warn at 90.9k-91.8k (1% - 2% above)
                const lowerBound = entryPrice * 1.01;  // 1% above
                const upperBound = entryPrice * 1.02;  // 2% above

                if (currentPrice > lowerBound && currentPrice <= upperBound) {
                    shouldWarn = true;
                    distancePercent = ((currentPrice - entryPrice) / entryPrice * 100);
                }
            }

            if (shouldWarn) {
                console.log(`\n⚡ EARLY WARNING: Preis nähert sich Entry Zone!`);

                const emoji = state.signal === 'LONG' ? '🟢' : '🔴';
                const direction = state.signal === 'LONG' ? 'LONG (Kaufen)' : 'SHORT (Verkaufen)';

                // Entry Zone (gleich wie in formatSignalMessage)
                const entryLow = state.signal === 'LONG' ? entryPrice * 0.98 : entryPrice * 1.00;
                const entryHigh = state.signal === 'LONG' ? entryPrice * 1.00 : entryPrice * 1.02;

                // Stop Loss (6% statt 3%)
                const stopLoss = state.signal === 'LONG' ? state.price * 0.94 : state.price * 1.06;

                // Take Profit Targets (3 Stufen)
                const tp1 = state.signal === 'LONG' ? state.price * 1.04 : state.price * 0.96;
                const tp2 = state.signal === 'LONG' ? state.price * 1.08 : state.price * 0.92;
                const tp3 = state.signal === 'LONG' ? state.price * 1.12 : state.price * 0.88;

                const warningMessage = `⚡ <b>EARLY WARNING</b> ⚡\n\n${emoji} <b>${state.signal} Signal aktiv!</b>\n\n💰 <b>Aktueller Preis:</b> $${currentPrice.toLocaleString()}\n📍 <b>Entry Zone:</b> $${entryLow.toLocaleString()} - $${entryHigh.toLocaleString()}\n📏 <b>Abstand:</b> ${distancePercent.toFixed(2)}%\n\n🎯 <b>${direction}</b>\n📊 <b>Score:</b> ${state.weightedScore.toFixed(1)}/10\n🎯 <b>Konfidenz:</b> ${state.confidence.toFixed(0)}%\n\n<b>📍 Trade Setup:</b>\n• Entry Zone: $${entryLow.toLocaleString()} - $${entryHigh.toLocaleString()}\n• Stop Loss: $${stopLoss.toLocaleString()}\n• TP1 (R:R 1:1): $${tp1.toLocaleString()}\n• TP2 (R:R 1:2): $${tp2.toLocaleString()}\n• TP3 (R:R 1:3): $${tp3.toLocaleString()}\n\n💡 <i>Bereite deinen Trade vor! Entry-Zone wird bald erreicht.</i>\n\n⏰ ${new Date().toLocaleString('de-DE')}`;

                await sendTelegramMessage(warningMessage);
                saveCurrentState(true); // Mark warning as shown
            } else {
                saveCurrentState(previousState.earlyWarningShown);
            }
        } else {
            saveCurrentState(previousState.earlyWarningShown);
        }
    }

    console.log('\n✅ Check completed!');
}

// Run
main().catch(console.error);
