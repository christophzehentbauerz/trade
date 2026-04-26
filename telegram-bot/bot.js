/**
 * BTC Smart Money Coach Bot
 * - Sendet proaktive Signale + Daily Reports (wie bisher)
 * - Antwortet auf Telegram-Fragen: /plan /score /ema /status /hilfe
 * - Signal-Score 0-100 mit MTF-Analyse (1h / 4h / 1d)
 * - Trade Plan: Entry / SL / TP1 / TP2 / Positionsgröße
 * - Guardrails: Daily-Loss-Limit, Open-Risk-Limit, Min-Score
 */

const https = require('https');
const fs    = require('fs');

// ─────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────
const CONFIG = {
    strategy: {
        emaFast: 15, emaSlow: 300, emaHTF: 800,
        rsiPeriod: 14, rsiMin: 45, rsiMax: 70,
        atrPeriod: 14, atrMultiplier: 2.5,
        trail: {
            tier1: { triggerATR: 0, distanceATR: 2.5 },
            tier2: { triggerATR: 3, distanceATR: 2.0 },
            tier3: { triggerATR: 5, distanceATR: 4.0 }
        },
        deathCrossMaxProfit: 0.05,
        timeStopHours: 72,
        timeStopMinProfit: 0.005
    },
    coach: {
        accountSize:  5000,
        riskPerTrade: 1.0,    // %
        minScore:     60,
        maxDailyLoss: 3.0,    // %
        maxOpenRisk:  2.5     // %
    },
    apis: {
        cryptoCompare: 'https://min-api.cryptocompare.com/data',
        binance:       'https://api.binance.com/api/v3',
        fearGreed:     'https://api.alternative.me/fng/'
    },
    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId:   process.env.TELEGRAM_CHAT_ID
    },
    stateFile: process.env.STATE_FILE || '/tmp/btc-smart-money-state.json'
};

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
let state = {
    currentPrice: 0, emaFast: 0, emaSlow: 0, emaHTF: 0,
    rsi: 0, atr: 0, atr4h: 0,
    goldenCross: false, htfFilter: false, rsiInZone: false,
    signal: 'NEUTRAL', signalStrength: 0, stopLoss: 0,
    fearGreedIndex: 0, priceChange24h: 0,
    mtf: { trend1h: 'neutral', trend4h: 'neutral', trend1d: 'neutral', aligned: 'mixed' },
    signalScore: 0,
    lastUpdate: null,
    candles1h: [],
    candles4h: [],
    candles1d: []
};

// ─────────────────────────────────────────
// HTTP HELPER
// ─────────────────────────────────────────
function fetchJSON(url, postData) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const opts = {
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: postData ? 'POST' : 'GET',
            headers: { 'User-Agent': 'BTC-Coach-Bot/2.0' }
        };
        if (postData) {
            opts.headers['Content-Type'] = 'application/json';
            opts.headers['Content-Length'] = Buffer.byteLength(postData);
        }
        const req = https.request(opts, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try {
                    const p = JSON.parse(d);
                    if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
                    else resolve(p);
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

// ─────────────────────────────────────────
// DATA FETCHING
// ─────────────────────────────────────────
async function fetchKlines1h() {
    try {
        const data = await fetchJSON(`${CONFIG.apis.cryptoCompare}/v2/histohour?fsym=BTC&tsym=USD&limit=1000`);
        if (data.Response !== 'Success') throw new Error(data.Message);
        return data.Data.Data.map(c => ({ time: c.time*1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volumefrom }));
    } catch (e) {
        console.error('CryptoCompare 1h failed:', e.message);
        const data = await fetchJSON(`${CONFIG.apis.binance}/klines?symbol=BTCUSDT&interval=1h&limit=1000`);
        return data.map(c => ({ time: c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5] }));
    }
}

async function fetchKlines4h() {
    try {
        const data = await fetchJSON(`${CONFIG.apis.cryptoCompare}/v2/histohour?fsym=BTC&tsym=USD&limit=500&aggregate=4`);
        if (data.Response !== 'Success') throw new Error(data.Message);
        return data.Data.Data.map(c => ({ close: c.close, high: c.high, low: c.low }));
    } catch (e) {
        // resample from 1h
        return resampleOHLCV(state.candles1h, 4);
    }
}

async function fetchKlines1d() {
    try {
        const data = await fetchJSON(`${CONFIG.apis.cryptoCompare}/v2/histoday?fsym=BTC&tsym=USD&limit=1000`);
        if (data.Response !== 'Success') throw new Error(data.Message);
        return data.Data.Data.map(c => ({ close: c.close, high: c.high, low: c.low }));
    } catch (e) {
        return resampleOHLCV(state.candles1h, 24);
    }
}

function useClosedCandles(candles) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    return candles.length > 1 ? candles.slice(0, -1) : candles.slice();
}

function resampleOHLCV(candles, hours) {
    const out = [];
    for (let i = 0; i < candles.length; i += hours) {
        const slice = candles.slice(i, i + hours);
        if (!slice.length) continue;
        out.push({
            close: slice[slice.length-1].close,
            high: Math.max(...slice.map(c => c.high || c.close)),
            low:  Math.min(...slice.map(c => c.low  || c.close))
        });
    }
    return out;
}

async function fetchFearGreed() {
    try {
        const d = await fetchJSON(CONFIG.apis.fearGreed);
        state.fearGreedIndex = parseInt(d.data[0].value);
    } catch { state.fearGreedIndex = 50; }
}

async function fetch24hChange() {
    try {
        const d = await fetchJSON(`${CONFIG.apis.cryptoCompare}/v2/histohour?fsym=BTC&tsym=USD&limit=24`);
        if (d.Response === 'Success') {
            const c = d.Data.Data;
            state.priceChange24h = ((c[c.length-1].close - c[0].open) / c[0].open) * 100;
        }
    } catch { state.priceChange24h = 0; }
}

async function fetchNews() {
    try {
        const d = await fetchJSON(`${CONFIG.apis.cryptoCompare}/v2/news/?lang=EN&sortOrder=popular`);
        return d.Data.slice(0, 5).map(n => ({ title: n.title, source: n.source_info?.name || n.source }));
    } catch { return []; }
}

// ─────────────────────────────────────────
// INDICATORS
// ─────────────────────────────────────────
function calcEMA(prices, period) {
    if (prices.length < period) return null;
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
    return ema;
}

function calcRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const d = prices[i] - prices[i-1];
        if (d > 0) gains += d; else losses -= d;
    }
    let ag = gains/period, al = losses/period;
    for (let i = period + 1; i < prices.length; i++) {
        const d = prices[i] - prices[i-1];
        if (d > 0) { ag = (ag*(period-1)+d)/period; al = al*(period-1)/period; }
        else       { ag = ag*(period-1)/period; al = (al*(period-1)-d)/period; }
    }
    return al === 0 ? 100 : 100 - 100/(1 + ag/al);
}

function calcATR(candles, period = 14) {
    if (candles.length < period + 1) return 0;
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high, l = candles[i].low, pc = candles[i-1].close;
        trs.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
    }
    const k = 2/(period+1);
    let atr = trs.slice(0, period).reduce((a,b)=>a+b,0)/period;
    for (let i = period; i < trs.length; i++) atr = trs[i]*k + atr*(1-k);
    return atr;
}

function trendFromCandles(candles) {
    if (candles.length < 50) return 'neutral';
    const closes = candles.map(c => c.close);
    const price  = closes[closes.length-1];
    const ema50  = calcEMA(closes, 50);
    const ema200 = calcEMA(closes, Math.min(200, closes.length-1));
    if (!ema50 || !ema200) return 'neutral';
    if (price > ema50 && ema50 > ema200) return 'bull';
    if (price < ema50 && ema50 < ema200) return 'bear';
    return 'neutral';
}

// ─────────────────────────────────────────
// SIGNAL SCORE (0–100)
// ─────────────────────────────────────────
function calcSignalScore() {
    const mtf = state.mtf;
    const rsi = state.rsi;
    const price = state.currentPrice;
    const ema800 = state.emaHTF;
    const atr = state.atr;
    let score = 0;

    // MTF alignment (0-40)
    if (mtf.aligned === 'bull' || mtf.aligned === 'bear') score += 40;
    else if (mtf.trend1h === mtf.trend4h && mtf.trend1h !== 'neutral') score += 22;
    else score += 5;

    // RSI zone (0-20)
    if (rsi >= 45 && rsi <= 65) score += 20;
    else if ((rsi >= 35 && rsi < 45) || (rsi > 65 && rsi <= 75)) score += 11;
    else score += 3;

    // EMA800 distance (0-15)
    const dist = ema800 ? Math.abs((price - ema800) / ema800 * 100) : 99;
    if (dist <= 2) score += 15;
    else if (dist <= 5) score += 8;
    else score += 2;

    // ATR volatility (0-15)
    const atrPct = price > 0 ? atr/price*100 : 0;
    if (atrPct >= 0.8 && atrPct <= 3.0) score += 15;
    else if (atrPct >= 0.4 && atrPct <= 4.5) score += 8;
    else score += 2;

    // Golden cross bonus (0-10)
    if (state.goldenCross) score += 10;

    return Math.max(0, Math.min(100, Math.round(score)));
}

// ─────────────────────────────────────────
// TRADE PLAN
// ─────────────────────────────────────────
function buildTradePlan(ctx = {}) {
    const account   = ctx.account   || CONFIG.coach.accountSize;
    const riskPct   = ctx.riskPct   || CONFIG.coach.riskPerTrade;
    const minScore  = ctx.minScore  || CONFIG.coach.minScore;
    const dailyPnl  = ctx.dailyPnl  || 0;
    const openRisk  = ctx.openRisk  || 0;

    const score  = state.signalScore;
    const close  = state.currentPrice;
    const atr    = state.atr;
    const ema200 = state.emaSlow;
    const mtf    = state.mtf;

    // Guardrails
    const guardrails = [];
    if (score < minScore)                               guardrails.push(`Score ${score} < Min ${minScore}`);
    if (dailyPnl <= -Math.abs(CONFIG.coach.maxDailyLoss)) guardrails.push(`Daily Loss Limit erreicht (${dailyPnl.toFixed(1)}%)`);
    if (openRisk >= CONFIG.coach.maxOpenRisk)           guardrails.push(`Open Risk Limit (${openRisk.toFixed(1)}% >= ${CONFIG.coach.maxOpenRisk}%)`);
    const blocked = guardrails.length > 0;

    let action = 'wait', entry = null, sl = null, tp1 = null, tp2 = null;

    if (!blocked && mtf.aligned === 'bull' && state.rsi < 72) {
        action = 'long';
        entry  = close;
        sl     = Math.min(ema200, close - 1.5 * atr);
        const risk = Math.max(entry - sl, 0.0001);
        tp1 = entry + 2.0 * risk;
        tp2 = entry + 3.5 * risk;
    } else if (!blocked && mtf.aligned === 'bear' && state.rsi > 28) {
        action = 'short';
        entry  = close;
        sl     = Math.max(ema200, close + 1.5 * atr);
        const risk = Math.max(sl - entry, 0.0001);
        tp1 = entry - 2.0 * risk;
        tp2 = entry - 3.5 * risk;
    }

    let rr1 = null, rr2 = null, size = null;
    if (entry && sl) {
        const riskPerUnit = action === 'long' ? Math.max(entry-sl,0.0001) : Math.max(sl-entry,0.0001);
        rr1  = action === 'long' ? (tp1-entry)/riskPerUnit : (entry-tp1)/riskPerUnit;
        rr2  = action === 'long' ? (tp2-entry)/riskPerUnit : (entry-tp2)/riskPerUnit;
        size = (account * riskPct/100) / riskPerUnit;
    }

    return { action, entry, sl, tp1, tp2, rr1, rr2, size, score, blocked, guardrails };
}

// ─────────────────────────────────────────
// CALCULATE ALL SIGNALS
// ─────────────────────────────────────────
async function calculateAll() {
    console.log('\n📊 Fetching market data...');

    state.candles1h = useClosedCandles(await fetchKlines1h());
    state.candles4h = useClosedCandles(await fetchKlines4h());
    state.candles1d = useClosedCandles(await fetchKlines1d());

    if (state.candles1h.length < CONFIG.strategy.emaHTF) {
        throw new Error(`Insufficient closed 1h candles: ${state.candles1h.length}/${CONFIG.strategy.emaHTF}`);
    }
    if (state.candles4h.length < 200 || state.candles1d.length < 200) {
        throw new Error('Insufficient closed HTF candles for MTF trend analysis');
    }

    const closes = state.candles1h.map(c => c.close);
    state.currentPrice = closes[closes.length-1];
    state.emaFast = calcEMA(closes, CONFIG.strategy.emaFast);
    state.emaSlow = calcEMA(closes, CONFIG.strategy.emaSlow);
    state.emaHTF  = calcEMA(closes, CONFIG.strategy.emaHTF);
    state.rsi     = calcRSI(closes, CONFIG.strategy.rsiPeriod);
    state.atr     = calcATR(state.candles1h, CONFIG.strategy.atrPeriod);
    state.lastUpdate = new Date();

    state.goldenCross = state.emaFast > state.emaSlow;
    state.htfFilter   = state.currentPrice > state.emaHTF;
    state.rsiInZone   = state.rsi >= CONFIG.strategy.rsiMin && state.rsi <= CONFIG.strategy.rsiMax;
    state.signalStrength = (state.goldenCross?1:0) + (state.htfFilter?1:0) + (state.rsiInZone?1:0);

    if (state.goldenCross && state.htfFilter && state.rsiInZone) state.signal = 'LONG';
    else if (!state.goldenCross) state.signal = 'EXIT';
    else state.signal = 'NEUTRAL';

    state.stopLoss = state.currentPrice - state.atr * CONFIG.strategy.atrMultiplier;

    // MTF
    state.mtf.trend1h = trendFromCandles(state.candles1h);
    state.mtf.trend4h = trendFromCandles(state.candles4h);
    state.mtf.trend1d = trendFromCandles(state.candles1d);
    const t1 = state.mtf.trend1h, t4 = state.mtf.trend4h, td = state.mtf.trend1d;
    if (t1 === t4 && t4 === td && t1 !== 'neutral') state.mtf.aligned = t1;
    else state.mtf.aligned = 'mixed';

    state.signalScore = calcSignalScore();

    console.log(`✓ BTC $${Math.round(state.currentPrice).toLocaleString()} | RSI ${state.rsi.toFixed(1)} | Score ${state.signalScore}/100`);
    console.log(`  MTF: 1h=${t1} 4h=${t4} 1d=${td} → ${state.mtf.aligned}`);
}

// ─────────────────────────────────────────
// TELEGRAM SEND
// ─────────────────────────────────────────
async function sendTelegramMessage(text, chatId) {
    const token  = CONFIG.telegram.botToken;
    const target = chatId || CONFIG.telegram.chatId;
    if (!token || !target) { console.error('❌ No Telegram credentials'); return false; }

    const url  = `https://api.telegram.org/bot${token}/sendMessage`;
    const body = JSON.stringify({ chat_id: target, text, parse_mode: 'HTML' });
    try {
        await fetchJSON(url, body);
        console.log('✅ Sent Telegram message');
        return true;
    } catch (e) {
        console.error('❌ Telegram error:', e.message);
        return false;
    }
}

// ─────────────────────────────────────────
// COACH RESPONSES
// ─────────────────────────────────────────
function coachAnswerEma() {
    const ema = state.emaHTF;
    const price = state.currentPrice;
    const dist = ema ? ((price - ema) / ema * 100) : 0;
    const above = price >= ema;
    return `📏 <b>EMA 800 Analyse</b>\n\n` +
        `EMA 800: <b>$${Math.round(ema).toLocaleString('de-DE')}</b>\n` +
        `BTC Preis: <b>$${Math.round(price).toLocaleString('de-DE')}</b>\n\n` +
        `${above ? '✅ Preis liegt ÜBER EMA 800 → bullisch' : '❌ Preis liegt UNTER EMA 800 → bearisch'}\n` +
        `Abstand: <b>${dist >= 0 ? '+' : ''}${dist.toFixed(2)}%</b>\n\n` +
        `${above ? '⚠️ Bullischer Trigger bricht, wenn Schlusskurs UNTER $' + Math.round(ema).toLocaleString('de-DE') : '🔑 Bullisches Signal: Schlusskurs ÜBER $' + Math.round(ema).toLocaleString('de-DE')}`;
}

function coachAnswerScore() {
    const s = state.signalScore;
    const mtf = state.mtf;
    const bar = '█'.repeat(Math.round(s/10)) + '░'.repeat(10 - Math.round(s/10));
    return `📊 <b>Signal-Score</b>\n\n` +
        `Score: <b>${s}/100</b>\n${bar}\n\n` +
        `MTF Trend:\n` +
        `  1h: ${mtf.trend1h} | 4h: ${mtf.trend4h} | 1d: ${mtf.trend1d}\n` +
        `  Alignment: <b>${mtf.aligned}</b>\n\n` +
        `RSI(14): ${state.rsi.toFixed(1)}\n` +
        `EMA800 Abstand: ${state.emaHTF ? ((state.currentPrice - state.emaHTF)/state.emaHTF*100).toFixed(2) : 'N/A'}%\n\n` +
        `${s >= 70 ? '🟢 Starkes Setup' : s >= 50 ? '🟡 Mittleres Setup' : '🔴 Schwaches Setup — abwarten'}`;
}

function coachAnswerPlan() {
    const plan = buildTradePlan();
    if (plan.blocked) {
        return `🚫 <b>Kein Trade-Setup</b>\n\n` +
            `Guardrails blockieren:\n${plan.guardrails.map(r => `• ${r}`).join('\n')}\n\n` +
            `Score: ${plan.score}/100`;
    }
    if (plan.action === 'wait') {
        return `⏸️ <b>Kein Signal — Abwarten</b>\n\n` +
            `Score: ${plan.score}/100\n` +
            `MTF: 1h=${state.mtf.trend1h}, 4h=${state.mtf.trend4h}, 1d=${state.mtf.trend1d}\n\n` +
            `Kein klares Multi-Timeframe Setup vorhanden.`;
    }
    const dir = plan.action === 'long' ? '📈 LONG' : '📉 SHORT';
    return `${plan.action === 'long' ? '🟢' : '🔴'} <b>Trade-Plan: ${dir}</b>\n\n` +
        `<b>Entry:</b>  $${Math.round(plan.entry).toLocaleString('de-DE')}\n` +
        `<b>Stop:</b>   $${Math.round(plan.sl).toLocaleString('de-DE')}\n` +
        `<b>TP1:</b>    $${Math.round(plan.tp1).toLocaleString('de-DE')} (RR ${plan.rr1?.toFixed(1)}:1)\n` +
        `<b>TP2:</b>    $${Math.round(plan.tp2).toLocaleString('de-DE')} (RR ${plan.rr2?.toFixed(1)}:1)\n\n` +
        `<b>Positionsgröße</b> (${CONFIG.coach.riskPerTrade}% Risiko):\n` +
        `${plan.size ? plan.size.toFixed(5) + ' BTC' : 'N/A'} bei $${CONFIG.coach.accountSize.toLocaleString()} Konto\n\n` +
        `Signal-Score: <b>${plan.score}/100</b>\n` +
        `MTF: ${state.mtf.trend1h}/${state.mtf.trend4h}/${state.mtf.trend1d}`;
}

function coachAnswerStatus() {
    const s = state;
    const prev = loadPreviousState();
    let msg = `📡 <b>Live Status</b>\n\n`;
    msg += `💰 BTC: <b>$${Math.round(s.currentPrice).toLocaleString('de-DE')}</b>  (${s.priceChange24h >= 0 ? '+' : ''}${s.priceChange24h.toFixed(2)}% 24h)\n\n`;
    msg += `📊 Indikatoren:\n`;
    msg += `  EMA15:  $${Math.round(s.emaFast).toLocaleString('de-DE')}\n`;
    msg += `  EMA300: $${Math.round(s.emaSlow).toLocaleString('de-DE')}\n`;
    msg += `  EMA800: $${Math.round(s.emaHTF).toLocaleString('de-DE')}\n`;
    msg += `  RSI14:  ${s.rsi.toFixed(1)}\n`;
    msg += `  ATR14:  $${Math.round(s.atr).toLocaleString('de-DE')}\n\n`;
    msg += `🎯 Signal: <b>${s.signal}</b> (${s.signalStrength}/3)\n`;
    msg += `Score: <b>${s.signalScore}/100</b>\n\n`;
    msg += `${s.goldenCross ? '✅' : '❌'} Golden Cross\n`;
    msg += `${s.htfFilter ? '✅' : '❌'} Über EMA 800\n`;
    msg += `${s.rsiInZone ? '✅' : '❌'} RSI in Zone\n`;

    if (prev.position) {
        const pos = prev.position;
        const pnl = ((s.currentPrice - pos.entryPrice) / pos.entryPrice * 100);
        const h   = ((Date.now() - new Date(pos.entryTime).getTime()) / 3600000);
        msg += `\n📍 <b>Aktive Position</b>\n`;
        msg += `  Entry: $${Math.round(pos.entryPrice).toLocaleString('de-DE')}\n`;
        msg += `  P/L: <b>${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%</b>  (${h.toFixed(0)}h)\n`;
        msg += `  Stop: $${Math.round(pos.trailingStop).toLocaleString('de-DE')} Tier ${pos.currentTier}\n`;
    }
    return msg;
}

function coachAnswerHelp() {
    return `🤖 <b>TraderCoach — Befehle</b>\n\n` +
        `/status  — Live Preis + alle Indikatoren\n` +
        `/score   — Signal-Score 0–100 + MTF-Analyse\n` +
        `/plan    — Konkreter Trade-Plan (Entry/SL/TP/Größe)\n` +
        `/ema     — EMA 800 Analyse & Trigger-Preis\n` +
        `/daily   — Vollständiges Tages-Briefing\n` +
        `/hilfe   — Diese Übersicht\n\n` +
        `<i>Gratis Crypto-Daten via CryptoCompare. Keine Anlageberatung.</i>`;
}

function coachFallback(q) {
    q = (q || '').toLowerCase();
    if (/ema|800|trigger/.test(q))    return coachAnswerEma();
    if (/score|qualit|stärk/.test(q)) return coachAnswerScore();
    if (/plan|entry|setup|long|short|stop|tp/.test(q)) return coachAnswerPlan();
    if (/status|preis|price|rsi/.test(q)) return coachAnswerStatus();
    return coachAnswerHelp();
}

// ─────────────────────────────────────────
// POLL TELEGRAM UPDATES
// ─────────────────────────────────────────
async function pollAndRespond() {
    const token = CONFIG.telegram.botToken;
    if (!token) return;
    const prev = loadPreviousState();
    const offset = prev.lastUpdateId ? prev.lastUpdateId + 1 : 0;

    let updates;
    try {
        const url = `https://api.telegram.org/bot${token}/getUpdates?timeout=10&offset=${offset}&allowed_updates=["message"]`;
        updates = await fetchJSON(url);
    } catch (e) {
        console.error('getUpdates error:', e.message);
        return;
    }

    if (!updates.ok || !updates.result.length) return;

    let lastId = prev.lastUpdateId || 0;
    for (const upd of updates.result) {
        lastId = Math.max(lastId, upd.update_id);
        const msg  = upd.message;
        if (!msg || !msg.text) continue;
        const text   = msg.text.trim();
        const chatId = String(msg.chat.id);
        console.log(`📨 Received from ${chatId}: ${text}`);

        let reply;
        if      (text.startsWith('/status')) reply = coachAnswerStatus();
        else if (text.startsWith('/score'))  reply = coachAnswerScore();
        else if (text.startsWith('/plan'))   reply = coachAnswerPlan();
        else if (text.startsWith('/ema'))    reply = coachAnswerEma();
        else if (text.startsWith('/daily'))  reply = await formatDailyUpdate(await fetchNews());
        else if (text.startsWith('/hilfe') || text.startsWith('/help') || text.startsWith('/start')) reply = coachAnswerHelp();
        else reply = coachFallback(text);

        await sendTelegramMessage(reply, chatId);
    }

    saveState({ ...prev, lastUpdateId: lastId });
}

// ─────────────────────────────────────────
// DAILY REPORT
// ─────────────────────────────────────────
async function formatDailyUpdate(newsItems = []) {
    const s   = state;
    const now = new Date();
    const dateStr = now.toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    const fg = s.fearGreedIndex;
    const fgText  = fg < 20 ? 'Extreme Angst' : fg < 40 ? 'Angst' : fg < 60 ? 'Neutral' : fg < 80 ? 'Gier' : 'Extreme Gier';
    const fgEmoji = fg < 20 ? '😱' : fg < 40 ? '😰' : fg < 60 ? '😐' : fg < 80 ? '🤑' : '🔥';
    const fgBar   = '█'.repeat(Math.round(fg/10)) + '░'.repeat(10 - Math.round(fg/10));
    const scoreBar = '█'.repeat(Math.round(s.signalScore/10)) + '░'.repeat(10 - Math.round(s.signalScore/10));

    const plan  = buildTradePlan();
    const priceStr  = `$${Math.round(s.currentPrice).toLocaleString('de-DE')}`;
    const changeStr = `${s.priceChange24h >= 0 ? '📈 +' : '📉 '}${s.priceChange24h.toFixed(2)}%`;

    let m = '';
    m += `☀️ <b>BTC DAILY BRIEFING</b>\n`;
    m += `📅 ${dateStr}\n`;
    m += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    m += `💰 <b>MARKT DASHBOARD</b>\n\n`;
    m += `<b>Bitcoin:</b> ${priceStr}  ${changeStr}\n\n`;
    m += `${fgEmoji} Fear &amp; Greed: <b>${fg}</b>/100 (${fgText})\n   ${fgBar}\n\n`;
    m += `📊 Signal-Score: <b>${s.signalScore}</b>/100\n   ${scoreBar}\n\n`;

    m += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    m += `🔬 <b>TECHNISCHE ANALYSE</b>\n\n`;
    m += `EMA Trend:\n`;
    m += `  • EMA15:  $${Math.round(s.emaFast).toLocaleString('de-DE')}\n`;
    m += `  • EMA300: $${Math.round(s.emaSlow).toLocaleString('de-DE')}\n`;
    m += `  • EMA800: $${Math.round(s.emaHTF).toLocaleString('de-DE')}\n\n`;
    m += `${s.goldenCross ? '✅' : '❌'} Golden Cross\n`;
    m += `${s.htfFilter ? '✅' : '❌'} Über EMA 800\n`;
    m += `${s.rsiInZone ? '✅' : '❌'} RSI Zone (${s.rsi.toFixed(1)})\n\n`;
    m += `📡 MTF: 1h=${s.mtf.trend1h} | 4h=${s.mtf.trend4h} | 1d=${s.mtf.trend1d}\n`;
    m += `  Alignment: <b>${s.mtf.aligned}</b>\n\n`;

    // Trade plan
    m += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    m += `🎯 <b>TAGES-PLAN</b>\n\n`;
    if (plan.action !== 'wait' && !plan.blocked) {
        const dir = plan.action === 'long' ? '📈 LONG' : '📉 SHORT';
        m += `${plan.action === 'long' ? '🟢' : '🔴'} ${dir}\n`;
        m += `  Entry: $${Math.round(plan.entry).toLocaleString('de-DE')}\n`;
        m += `  Stop:  $${Math.round(plan.sl).toLocaleString('de-DE')}\n`;
        m += `  TP1:   $${Math.round(plan.tp1).toLocaleString('de-DE')} (${plan.rr1?.toFixed(1)}:1)\n`;
        m += `  TP2:   $${Math.round(plan.tp2).toLocaleString('de-DE')} (${plan.rr2?.toFixed(1)}:1)\n\n`;
    } else {
        if (s.signal === 'LONG')   m += `🟢 <b>LONG — Aufwärtstrend aktiv</b>\nGolden Cross bestätigt.\n`;
        else if (s.signal === 'EXIT') m += `🔴 <b>EXIT — Kein Einstieg</b>\nDeath Cross aktiv.\n`;
        else m += `⚪ <b>NEUTRAL — Abwarten</b>\nKein klares Signal.\n`;
        if (s.stopLoss) m += `Stop Loss: $${Math.round(s.stopLoss).toLocaleString('de-DE')}\n`;
        m += `\n`;
    }

    // Active position
    const prev2 = loadPreviousState();
    if (prev2.position) {
        const pos = prev2.position;
        const pnl = ((s.currentPrice - pos.entryPrice) / pos.entryPrice * 100);
        const h   = ((Date.now() - new Date(pos.entryTime).getTime()) / 3600000);
        const e   = pnl >= 5 ? '🚀' : pnl >= 0 ? '💚' : pnl >= -3 ? '⚠️' : '🔴';
        m += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        m += `📍 <b>AKTIVE POSITION</b>\n\n`;
        m += `${e} P/L: <b>${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%</b>\n`;
        m += `  Entry: $${Math.round(pos.entryPrice).toLocaleString('de-DE')} (vor ${h.toFixed(0)}h)\n`;
        m += `  Stop:  $${Math.round(pos.trailingStop).toLocaleString('de-DE')} Tier ${pos.currentTier||1}\n\n`;
    }

    // News
    if (newsItems.length) {
        m += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        m += `📰 <b>TOP CRYPTO NEWS</b>\n\n`;
        newsItems.forEach((n, i) => {
            m += `${i+1}. <b>${n.title}</b>\n   📌 ${n.source}\n\n`;
        });
    }

    m += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    m += `💡 Frag den Coach: /plan /score /ema /status\n`;
    m += `🤖 <i>Smart Money Coach · ${timeStr} Uhr · Keine Anlageberatung</i>`;
    return m;
}

// ─────────────────────────────────────────
// POSITION MANAGEMENT
// ─────────────────────────────────────────
function calcTrailingStop(entryPrice, currentPrice, atr) {
    const profitATR = (currentPrice - entryPrice) / atr;
    const { trail } = CONFIG.strategy;
    let distanceATR, tier;
    if (profitATR >= trail.tier3.triggerATR)      { distanceATR = trail.tier3.distanceATR; tier = 3; }
    else if (profitATR >= trail.tier2.triggerATR) { distanceATR = trail.tier2.distanceATR; tier = 2; }
    else                                           { distanceATR = trail.tier1.distanceATR; tier = 1; }
    return { newStop: currentPrice - atr * distanceATR, distanceATR, tier, profitATR };
}

function checkExitConditions(position, currentPrice, atr) {
    const profitPct = (currentPrice - position.entryPrice) / position.entryPrice;
    const hours     = (Date.now() - new Date(position.entryTime).getTime()) / 3600000;
    const reasons   = [];
    if (position.trailingStop && currentPrice <= position.trailingStop)
        reasons.push({ type: 'TRAILING_STOP', profitPct });
    if (!state.goldenCross && profitPct < CONFIG.strategy.deathCrossMaxProfit)
        reasons.push({ type: 'DEATH_CROSS', profitPct });
    if (hours >= CONFIG.strategy.timeStopHours && profitPct < CONFIG.strategy.timeStopMinProfit)
        reasons.push({ type: 'TIME_STOP', profitPct });
    return reasons;
}

// ─────────────────────────────────────────
// SIMPLE MESSAGE TEMPLATES
// ─────────────────────────────────────────
function msgEntry(pos) {
    return `🟢 <b>SMART MONEY LONG</b> 🟢\n\n` +
        `💰 BTC: $${Math.round(state.currentPrice).toLocaleString('de-DE')}\n` +
        `📊 Score: ${state.signalScore}/100 | Stärke: ${state.signalStrength}/3\n\n` +
        `📍 Trade Setup:\n` +
        `  Entry: $${Math.round(pos.entryPrice).toLocaleString('de-DE')}\n` +
        `  Stop:  $${Math.round(pos.trailingStop).toLocaleString('de-DE')}\n\n` +
        `✅ Golden Cross ✅ Über EMA800 ✅ RSI Zone\n` +
        `MTF: ${state.mtf.trend1h}/${state.mtf.trend4h}/${state.mtf.trend1d}\n\n` +
        `💬 Frag den Coach: /plan /score /ema\n⏰ ${new Date().toLocaleString('de-DE', {timeZone:'Europe/Berlin'})}`;
}

function msgExit(pos, reasons) {
    const pnl = ((state.currentPrice - pos.entryPrice) / pos.entryPrice * 100);
    const h   = ((Date.now() - new Date(pos.entryTime).getTime()) / 3600000);
    const map = { TRAILING_STOP: '📉 Trailing Stop', DEATH_CROSS: '💀 Death Cross', TIME_STOP: '⏰ Zeit-Stop' };
    return `🔴 <b>SMART MONEY EXIT</b> 🔴\n\n` +
        `Grund: ${reasons.map(r => map[r.type]||r.type).join(', ')}\n\n` +
        `P/L: <b>${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%</b>\n` +
        `Entry: $${Math.round(pos.entryPrice).toLocaleString('de-DE')}\n` +
        `Exit:  $${Math.round(state.currentPrice).toLocaleString('de-DE')}\n` +
        `Dauer: ${h.toFixed(0)}h\n\n⏰ ${new Date().toLocaleString('de-DE', {timeZone:'Europe/Berlin'})}`;
}

function msgTrailUpdate(pos, info) {
    const pnl = ((state.currentPrice - pos.entryPrice) / pos.entryPrice * 100);
    return `📈 <b>TRAILING STOP UPDATE</b>\n\n` +
        `BTC: $${Math.round(state.currentPrice).toLocaleString('de-DE')} (+${pnl.toFixed(2)}%)\n` +
        `Neuer Stop: $${Math.round(pos.trailingStop).toLocaleString('de-DE')}\n` +
        `Tier: ${info.tier} (${info.distanceATR} ATR)\n⏰ ${new Date().toLocaleString('de-DE', {timeZone:'Europe/Berlin'})}`;
}

// ─────────────────────────────────────────
// STATE PERSISTENCE
// ─────────────────────────────────────────
function loadPreviousState() {
    try {
        if (fs.existsSync(CONFIG.stateFile)) return JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8'));
    } catch {}
    return { signal: 'NEUTRAL', lastNotified: null, lastDailyUpdate: null, position: null, lastUpdateId: 0, lastCandleTime: null };
}

function saveState(data) {
    try { fs.writeFileSync(CONFIG.stateFile, JSON.stringify(data)); } catch (e) { console.error('saveState:', e.message); }
}

// ─────────────────────────────────────────
// MAIN FLOWS
// ─────────────────────────────────────────
async function checkSignal() {
    console.log('🚀 BTC Smart Money Coach — Signal Check\n' + '='.repeat(50));
    await calculateAll();
    await fetchFearGreed();
    await fetch24hChange();

    // Respond to any pending Telegram messages
    await pollAndRespond();

    console.log('\n' + '='.repeat(50));
    const prev = loadPreviousState();
    const latestClosedCandleTime = state.candles1h[state.candles1h.length - 1]?.time ?? null;
    const isNewClosedCandle = latestClosedCandleTime !== null && latestClosedCandleTime !== prev.lastCandleTime;
    const hasPos = !!prev.position;

    if (hasPos) {
        const pos = prev.position;
        const profitPct = ((state.currentPrice - pos.entryPrice) / pos.entryPrice * 100);
        console.log(`📍 Position aktiv  P/L=${profitPct.toFixed(2)}%`);

        if (state.currentPrice > (pos.highestPrice || pos.entryPrice)) pos.highestPrice = state.currentPrice;

        const info  = calcTrailingStop(pos.entryPrice, state.currentPrice, state.atr);
        const oldStop = pos.trailingStop, oldTier = pos.currentTier || 1;
        if (info.newStop > pos.trailingStop) { pos.trailingStop = info.newStop; }
        pos.currentTier = info.tier;
        if (info.tier > oldTier) await sendTelegramMessage(msgTrailUpdate(pos, info));

        const exits = checkExitConditions(pos, state.currentPrice, state.atr);
        if (exits.length) {
            await sendTelegramMessage(msgExit(pos, exits));
            saveState({
                signal: state.signal,
                lastNotified: new Date().toISOString(),
                lastDailyUpdate: prev.lastDailyUpdate,
                position: null,
                lastUpdateId: prev.lastUpdateId || 0,
                lastCandleTime: latestClosedCandleTime
            });
        } else {
            saveState({
                signal: state.signal,
                lastNotified: prev.lastNotified,
                lastDailyUpdate: prev.lastDailyUpdate,
                position: pos,
                lastUpdateId: prev.lastUpdateId || 0,
                lastCandleTime: latestClosedCandleTime
            });
        }
    } else {
        const changed = prev.signal !== state.signal;
        if (state.signal === 'LONG' && isNewClosedCandle && (changed || prev.signal !== 'LONG')) {
            const newPos = { entryPrice: state.currentPrice, entryTime: new Date().toISOString(), trailingStop: state.currentPrice - state.atr * CONFIG.strategy.atrMultiplier, highestPrice: state.currentPrice, currentTier: 1, entryATR: state.atr };
            await sendTelegramMessage(msgEntry(newPos));
            saveState({
                signal: state.signal,
                lastNotified: new Date().toISOString(),
                lastDailyUpdate: prev.lastDailyUpdate,
                position: newPos,
                lastUpdateId: prev.lastUpdateId || 0,
                lastCandleTime: latestClosedCandleTime
            });
        } else {
            saveState({
                signal: state.signal,
                lastNotified: prev.lastNotified,
                lastDailyUpdate: prev.lastDailyUpdate,
                position: null,
                lastUpdateId: prev.lastUpdateId || 0,
                lastCandleTime: latestClosedCandleTime
            });
        }
    }
    console.log('✅ Done!');
}

async function sendDailyUpdate() {
    console.log('📅 BTC Smart Money Coach — Daily Update\n' + '='.repeat(50));
    await calculateAll();
    await fetchFearGreed();
    await fetch24hChange();
    const news = await fetchNews();
    await pollAndRespond();
    const msg = await formatDailyUpdate(news);
    const ok  = await sendTelegramMessage(msg);
    if (!ok) throw new Error('Telegram send failed');
    const prev = loadPreviousState();
    saveState({ ...prev, lastDailyUpdate: new Date().toISOString() });
    console.log('✅ Daily update sent!');
}

// ─────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────
const cmd = (process.argv[2] || 'check');
if (cmd === 'daily') {
    sendDailyUpdate().catch(e => { console.error('💥', e.message); process.exit(1); });
} else {
    checkSignal().catch(e => { console.error('⚠️', e.message); });
}
