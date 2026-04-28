// =====================================================
// /api/bot/backtest — Replays the bot's strategy on the
// last N days of 1h candles and returns the resulting
// trades. No state required (server-side replay).
// =====================================================

function setCors(response) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const STRAT = {
    emaFast: 15, emaSlow: 300, emaHTF: 800,
    rsiPeriod: 14, rsiMin: 45, rsiMax: 70,
    atrPeriod: 14, atrMultiplier: 2.5,
    adxPeriod: 14, adxThreshold: 20,
    trail: { tier1: 2.5, tier2: 2.0, tier3: 4.0, tier2TriggerATR: 3, tier3TriggerATR: 5 },
    deathCrossMaxProfit: 0.05,
    // Disabled — backtest showed +12% return improvement when removed
    timeStopHours: 0,
    timeStopMinProfit: 0.005,
    // Skip Sunday entries (UTC) — backtest: PF 1.70 → 2.14
    skipSundayEntries: true
};

function ema(arr, period) {
    if (arr.length < period) return new Array(arr.length).fill(NaN);
    const k = 2 / (period + 1);
    const out = new Array(arr.length).fill(NaN);
    let e = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    out[period - 1] = e;
    for (let i = period; i < arr.length; i++) {
        e = arr[i] * k + e * (1 - k);
        out[i] = e;
    }
    return out;
}

function rsiSeries(closes, period = 14) {
    const out = new Array(closes.length).fill(NaN);
    if (closes.length < period + 1) return out;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const d = closes[i] - closes[i - 1];
        if (d > 0) gains += d; else losses -= d;
    }
    let ag = gains / period, al = losses / period;
    out[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    for (let i = period + 1; i < closes.length; i++) {
        const d = closes[i] - closes[i - 1];
        if (d > 0) { ag = (ag * (period - 1) + d) / period; al = al * (period - 1) / period; }
        else { ag = ag * (period - 1) / period; al = (al * (period - 1) - d) / period; }
        out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    }
    return out;
}

function atrSeries(candles, period = 14) {
    const out = new Array(candles.length).fill(NaN);
    if (candles.length < period + 1) return out;
    const trs = new Array(candles.length).fill(NaN);
    for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
        trs[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    }
    const k = 2 / (period + 1);
    let a = 0;
    for (let i = 1; i <= period; i++) a += trs[i];
    a /= period;
    out[period] = a;
    for (let i = period + 1; i < candles.length; i++) {
        a = trs[i] * k + a * (1 - k);
        out[i] = a;
    }
    return out;
}

function adxSeries(candles, period = 14) {
    const n = candles.length;
    const out = new Array(n).fill(NaN);
    if (n < period * 2 + 1) return out;
    const plusDM = new Array(n).fill(0);
    const minusDM = new Array(n).fill(0);
    const tr = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
        const upMove = candles[i].high - candles[i - 1].high;
        const downMove = candles[i - 1].low - candles[i].low;
        plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
        minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;
        const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
        tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    }
    let trSum = 0, plusSum = 0, minusSum = 0;
    for (let i = 1; i <= period; i++) { trSum += tr[i]; plusSum += plusDM[i]; minusSum += minusDM[i]; }
    const dxArr = [];
    let smTR = trSum, smPlus = plusSum, smMinus = minusSum;
    for (let i = period + 1; i < n; i++) {
        smTR = smTR - smTR / period + tr[i];
        smPlus = smPlus - smPlus / period + plusDM[i];
        smMinus = smMinus - smMinus / period + minusDM[i];
        const plusDI = smTR ? (100 * smPlus / smTR) : 0;
        const minusDI = smTR ? (100 * smMinus / smTR) : 0;
        const sumDI = plusDI + minusDI;
        const dx = sumDI ? (100 * Math.abs(plusDI - minusDI) / sumDI) : 0;
        dxArr.push({ i, dx });
    }
    if (dxArr.length < period) return out;
    let v = dxArr.slice(0, period).reduce((a, b) => a + b.dx, 0) / period;
    out[dxArr[period - 1].i] = v;
    for (let k = period; k < dxArr.length; k++) {
        v = (v * (period - 1) + dxArr[k].dx) / period;
        out[dxArr[k].i] = v;
    }
    return out;
}

function calcTrailingStop(entry, current, atr) {
    const profitATR = (current - entry) / atr;
    const t = STRAT.trail;
    let dist;
    if (profitATR >= t.tier3TriggerATR) dist = t.tier3;
    else if (profitATR >= t.tier2TriggerATR) dist = t.tier2;
    else dist = t.tier1;
    return current - atr * dist;
}

function runBacktest(candles) {
    const closes = candles.map(c => c.close);
    const e15 = ema(closes, STRAT.emaFast);
    const e300 = ema(closes, STRAT.emaSlow);
    const e800 = ema(closes, STRAT.emaHTF);
    const rsi = rsiSeries(closes, STRAT.rsiPeriod);
    const atr = atrSeries(candles, STRAT.atrPeriod);
    const adx = adxSeries(candles, STRAT.adxPeriod);

    const trades = [];
    let position = null;
    let trendIsUp = false;
    const minIdx = STRAT.emaHTF + 50;

    for (let i = minIdx; i < candles.length; i++) {
        const c = candles[i];
        const fastAboveSlow = e15[i] > e300[i];
        const priceAboveHtf = c.close > e800[i];
        const newTrendUp = fastAboveSlow && priceAboveHtf;

        if (position) {
            if (c.high > position.highestPrice) position.highestPrice = c.high;
            const newStop = calcTrailingStop(position.entryPrice, position.highestPrice, position.entryATR);
            if (newStop > position.stop) position.stop = newStop;

            if (c.close <= position.stop) {
                position.exitTime = c.time;
                position.exitPrice = c.close;
                position.exitReason = 'TRAILING_STOP';
                position.barsHeld = i - position.entryIdx;
                position.pnlPct = (position.exitPrice - position.entryPrice) / position.entryPrice * 100;
                trades.push(position);
                position = null;
                trendIsUp = newTrendUp;
                continue;
            }
            const profitPct = (c.close - position.entryPrice) / position.entryPrice;
            if (!fastAboveSlow && profitPct < STRAT.deathCrossMaxProfit) {
                position.exitTime = c.time;
                position.exitPrice = c.close;
                position.exitReason = 'DEATH_CROSS';
                position.barsHeld = i - position.entryIdx;
                position.pnlPct = profitPct * 100;
                trades.push(position);
                position = null;
                trendIsUp = newTrendUp;
                continue;
            }
            const hoursHeld = i - position.entryIdx;
            if (STRAT.timeStopHours > 0 && hoursHeld >= STRAT.timeStopHours && profitPct < STRAT.timeStopMinProfit) {
                position.exitTime = c.time;
                position.exitPrice = c.close;
                position.exitReason = 'TIME_STOP';
                position.barsHeld = hoursHeld;
                position.pnlPct = profitPct * 100;
                trades.push(position);
                position = null;
                trendIsUp = newTrendUp;
                continue;
            }
        }

        if (!position) {
            const goldenCross = !trendIsUp && newTrendUp;
            const rsiInZone = rsi[i] >= STRAT.rsiMin && rsi[i] <= STRAT.rsiMax;
            const adxOk = Number.isFinite(adx[i]) && adx[i] >= STRAT.adxThreshold;
            const dow = new Date(c.time).getUTCDay(); // 0=Sun
            const sundayBlock = STRAT.skipSundayEntries && dow === 0;
            if (goldenCross && rsiInZone && adxOk && !sundayBlock) {
                position = {
                    entryTime: c.time,
                    entryIdx: i,
                    entryPrice: c.close,
                    entryATR: atr[i],
                    highestPrice: c.high,
                    stop: c.close - atr[i] * STRAT.atrMultiplier,
                    adxAtEntry: adx[i]
                };
            }
        }
        trendIsUp = newTrendUp;
    }

    return { trades, openPosition: position };
}

function computeStats(trades) {
    if (!trades.length) return { trades: 0 };
    const wins = trades.filter(t => t.pnlPct > 0);
    const losses = trades.filter(t => t.pnlPct <= 0);
    const grossWin = wins.reduce((a, t) => a + t.pnlPct, 0);
    const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnlPct, 0));
    let equity = 100, peak = 100, maxDD = 0;
    for (const t of trades) {
        equity *= (1 + t.pnlPct / 100);
        if (equity > peak) peak = equity;
        const dd = (peak - equity) / peak * 100;
        if (dd > maxDD) maxDD = dd;
    }
    return {
        trades: trades.length,
        wins: wins.length,
        losses: losses.length,
        winRate: (wins.length / trades.length) * 100,
        totalReturn: equity - 100,
        profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
        maxDrawdown: maxDD,
        avgWin: wins.length ? grossWin / wins.length : 0,
        avgLoss: losses.length ? -grossLoss / losses.length : 0,
        bestTrade: Math.max(...trades.map(t => t.pnlPct)),
        worstTrade: Math.min(...trades.map(t => t.pnlPct))
    };
}

async function fetchCandles(limit = 2000) {
    try {
        const res = await fetch(`https://min-api.cryptocompare.com/data/v2/histohour?fsym=BTC&tsym=USD&limit=${Math.min(limit, 2000)}`);
        if (!res.ok) throw new Error(`CryptoCompare HTTP ${res.status}`);
        const data = await res.json();
        if (data.Response !== 'Success') throw new Error(data.Message);
        return data.Data.Data
            .filter(c => Number.isFinite(c.close))
            .map(c => ({ time: c.time * 1000, open: c.open, high: c.high, low: c.low, close: c.close }));
    } catch (e) {
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=${Math.min(limit, 1000)}`);
        if (!res.ok) throw new Error(`Binance HTTP ${res.status}: ${e.message}`);
        const data = await res.json();
        return data.map(c => ({ time: c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4] }));
    }
}

export default async function handler(request, response) {
    setCors(response);
    if (request.method === 'OPTIONS') { response.status(204).end(); return; }
    if (request.method !== 'GET') { response.status(405).json({ error: 'method_not_allowed' }); return; }

    try {
        const days = Math.max(30, Math.min(180, parseInt(request.query.days) || 90));
        const limit = Math.min(2000, days * 24 + STRAT.emaHTF + 100);
        const candles = await fetchCandles(limit);
        if (candles.length < STRAT.emaHTF + 50) {
            throw new Error(`Insufficient candles: ${candles.length}`);
        }

        const { trades, openPosition } = runBacktest(candles);
        const stats = computeStats(trades);
        const recent = trades.slice(-15).reverse().map(t => ({
            entryTime: new Date(t.entryTime).toISOString(),
            exitTime: new Date(t.exitTime).toISOString(),
            entryPrice: +t.entryPrice.toFixed(2),
            exitPrice: +t.exitPrice.toFixed(2),
            pnlPct: +t.pnlPct.toFixed(2),
            barsHeld: t.barsHeld,
            exitReason: t.exitReason
        }));

        response.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
        response.status(200).json({
            timestamp: new Date().toISOString(),
            window: { days, candles: candles.length },
            stats,
            recentTrades: recent,
            openPosition: openPosition ? {
                entryTime: new Date(openPosition.entryTime).toISOString(),
                entryPrice: +openPosition.entryPrice.toFixed(2),
                stop: +openPosition.stop.toFixed(2),
                highestPrice: +openPosition.highestPrice.toFixed(2),
                barsHeld: candles.length - 1 - openPosition.entryIdx
            } : null
        });
    } catch (error) {
        response.status(502).json({
            error: 'bot_backtest_unavailable',
            message: error?.message || 'Failed to compute bot backtest'
        });
    }
}
