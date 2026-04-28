/**
 * Backtest ADVANCED — Additional filter ideas on top of v2 winner
 * (Skip Sun + No Time Stop, baseline = +51% / PF 2.14 / MaxDD -7.1%).
 *
 * Tests filters I haven't tried yet:
 *   - Volatility regime (skip if ATR/price too low or too high)
 *   - ADX trending UP (rising momentum vs static threshold)
 *   - Distance from EMA50 (no FOMO entries far from MA)
 *   - RSI trending UP (not just in zone)
 *   - Higher-high momentum (last 24h made HH)
 *   - Time-of-day (skip first 2h of UTC day = US close noise)
 *   - Avoid back-to-back entries within X hours of last exit
 */

const fs = require('fs');
const path = require('path');

function ema(arr, period) {
    if (arr.length < period) return new Array(arr.length).fill(NaN);
    const k = 2 / (period + 1);
    const out = new Array(arr.length).fill(NaN);
    let e = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    out[period - 1] = e;
    for (let i = period; i < arr.length; i++) { e = arr[i] * k + e * (1 - k); out[i] = e; }
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
        else       { ag = ag * (period - 1) / period;       al = (al * (period - 1) - d) / period; }
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
    for (let i = period + 1; i < candles.length; i++) { a = trs[i] * k + a * (1 - k); out[i] = a; }
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
        smTR    = smTR    - smTR    / period + tr[i];
        smPlus  = smPlus  - smPlus  / period + plusDM[i];
        smMinus = smMinus - smMinus / period + minusDM[i];
        const plusDI  = smTR ? (100 * smPlus  / smTR) : 0;
        const minusDI = smTR ? (100 * smMinus / smTR) : 0;
        const sumDI = plusDI + minusDI;
        const dx = sumDI ? (100 * Math.abs(plusDI - minusDI) / sumDI) : 0;
        dxArr.push({ i, dx });
    }
    if (dxArr.length < period) return out;
    let adx = dxArr.slice(0, period).reduce((a, b) => a + b.dx, 0) / period;
    out[dxArr[period - 1].i] = adx;
    for (let k = period; k < dxArr.length; k++) {
        adx = (adx * (period - 1) + dxArr[k].dx) / period;
        out[dxArr[k].i] = adx;
    }
    return out;
}

function loadCSV(file) {
    const raw = fs.readFileSync(file, 'utf8').trim().split('\n');
    const out = [];
    for (let i = 1; i < raw.length; i++) {
        const r = raw[i].split(',');
        out.push({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] });
    }
    return out;
}

const TRAIL = { tier1: 2.5, tier2: 2.0, tier3: 4.0, tier2Trig: 3, tier3Trig: 5 };
function calcTrailingStop(entry, current, atr) {
    const profitATR = (current - entry) / atr;
    let dist;
    if (profitATR >= TRAIL.tier3Trig) dist = TRAIL.tier3;
    else if (profitATR >= TRAIL.tier2Trig) dist = TRAIL.tier2;
    else dist = TRAIL.tier1;
    return current - atr * dist;
}

function runBacktest(candles, opts = {}) {
    // Default: v2 winner config
    const skipSun = opts.skipSun ?? true;
    const enableTimeStop = opts.enableTimeStop ?? false;
    const adxThr = opts.adxThr ?? 20;
    const rsiMin = opts.rsiMin ?? 45;
    const rsiMax = opts.rsiMax ?? 70;
    const atrMult = opts.atrMult ?? 2.5;
    const feePct = opts.feePct ?? 0.2;
    const slipPct = opts.slipPct ?? 0.1;

    // NEW filters
    const minVolPct = opts.minVolPct ?? 0;     // skip if ATR/price < x%
    const maxVolPct = opts.maxVolPct ?? 100;   // skip if ATR/price > x%
    const requireRisingADX = opts.requireRisingADX ?? false;
    const maxEMA50Dist = opts.maxEMA50Dist ?? 100;  // skip if price > x% above EMA50
    const requireRisingRSI = opts.requireRisingRSI ?? false;
    const requireHH24 = opts.requireHH24 ?? false;
    const skipFirstHoursUTC = opts.skipFirstHoursUTC ?? 0;  // skip first N hours after midnight UTC
    const minHoursBetweenTrades = opts.minHoursBetweenTrades ?? 0;

    const closes = candles.map(c => c.close);
    const e15 = ema(closes, 15);
    const e50 = ema(closes, 50);
    const e300 = ema(closes, 300);
    const e800 = ema(closes, 800);
    const rsi = rsiSeries(closes, 14);
    const atr = atrSeries(candles, 14);
    const adx = adxSeries(candles, 14);

    const trades = [];
    let position = null;
    let trendIsUp = false;
    let lastExitIdx = -Infinity;
    const minIdx = 850;

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
                const exitPrice = position.stop * (1 - slipPct / 100);
                position.exitTime = c.time;
                position.exitPrice = exitPrice;
                position.exitReason = 'TRAIL';
                position.barsHeld = i - position.entryIdx;
                position.pnlPct = ((exitPrice - position.entryPrice) / position.entryPrice) * 100 - feePct;
                trades.push(position);
                position = null;
                lastExitIdx = i;
                trendIsUp = newTrendUp;
                continue;
            }
            const profitPct = (c.close - position.entryPrice) / position.entryPrice;
            if (!fastAboveSlow && profitPct < 0.05) {
                const exitPrice = c.close * (1 - slipPct / 100);
                position.exitTime = c.time;
                position.exitPrice = exitPrice;
                position.exitReason = 'DEATH';
                position.barsHeld = i - position.entryIdx;
                position.pnlPct = ((exitPrice - position.entryPrice) / position.entryPrice) * 100 - feePct;
                trades.push(position);
                position = null;
                lastExitIdx = i;
                trendIsUp = newTrendUp;
                continue;
            }
            if (enableTimeStop) {
                const hoursHeld = i - position.entryIdx;
                if (hoursHeld >= 72 && profitPct < 0.005) {
                    const exitPrice = c.close * (1 - slipPct / 100);
                    position.exitTime = c.time;
                    position.exitPrice = exitPrice;
                    position.exitReason = 'TIME';
                    position.barsHeld = hoursHeld;
                    position.pnlPct = ((exitPrice - position.entryPrice) / position.entryPrice) * 100 - feePct;
                    trades.push(position);
                    position = null;
                    lastExitIdx = i;
                    trendIsUp = newTrendUp;
                    continue;
                }
            }
        }

        if (!position) {
            const goldenCross = !trendIsUp && newTrendUp;
            const rsiInZone = rsi[i] >= rsiMin && rsi[i] <= rsiMax;
            const adxOk = Number.isFinite(adx[i]) && adx[i] >= adxThr;
            let triggered = goldenCross && rsiInZone && adxOk;

            // ─── Existing filter ─────────────
            if (triggered && skipSun) {
                const dow = new Date(c.time + 'Z').getUTCDay();
                if (dow === 0) triggered = false;
            }

            // ─── NEW filters ─────────────────
            const atrPct = (atr[i] / c.close) * 100;
            if (triggered && atrPct < minVolPct) triggered = false;
            if (triggered && atrPct > maxVolPct) triggered = false;

            if (triggered && requireRisingADX) {
                if (!Number.isFinite(adx[i - 1]) || adx[i] <= adx[i - 1]) triggered = false;
            }

            if (triggered && Number.isFinite(e50[i])) {
                const distFromEma50 = ((c.close - e50[i]) / e50[i]) * 100;
                if (distFromEma50 > maxEMA50Dist) triggered = false;
            }

            if (triggered && requireRisingRSI) {
                if (!Number.isFinite(rsi[i - 1]) || rsi[i] <= rsi[i - 1]) triggered = false;
            }

            if (triggered && requireHH24) {
                const window = candles.slice(Math.max(0, i - 24), i);
                const recentHigh = Math.max(...window.map(x => x.high));
                if (c.close <= recentHigh) triggered = false;
            }

            if (triggered && skipFirstHoursUTC > 0) {
                const utcHour = new Date(c.time + 'Z').getUTCHours();
                if (utcHour < skipFirstHoursUTC) triggered = false;
            }

            if (triggered && minHoursBetweenTrades > 0) {
                if (i - lastExitIdx < minHoursBetweenTrades) triggered = false;
            }

            if (triggered) {
                const entryPrice = c.close * (1 + slipPct / 100);
                position = {
                    entryTime: c.time,
                    entryIdx: i,
                    entryPrice,
                    entryATR: atr[i],
                    highestPrice: c.high,
                    stop: entryPrice - atr[i] * atrMult,
                    adxAtEntry: adx[i]
                };
            }
        }
        trendIsUp = newTrendUp;
    }
    return trades;
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
    const start = new Date(trades[0].entryTime + 'Z').getTime();
    const end = new Date(trades[trades.length - 1].exitTime + 'Z').getTime();
    const years = (end - start) / (365.25 * 24 * 3600 * 1000);
    const cagr = years > 0 ? (Math.pow(equity / 100, 1 / years) - 1) * 100 : 0;
    return {
        trades: trades.length,
        winRate: (wins.length / trades.length) * 100,
        totalReturn: equity - 100,
        cagr,
        profitFactor: grossLoss > 0 ? grossWin / grossLoss : Infinity,
        maxDD,
        rrr: (equity - 100) / Math.max(maxDD, 0.5)
    };
}

function row(name, s) {
    if (!s.trades) return `${name.padEnd(40)}| keine Trades`;
    const ret = (s.totalReturn >= 0 ? '+' : '') + s.totalReturn.toFixed(0);
    const cagr = (s.cagr >= 0 ? '+' : '') + s.cagr.toFixed(1);
    const pf = s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2);
    return `${name.padEnd(40)}| ${String(s.trades).padStart(4)} | ${s.winRate.toFixed(0).padStart(3)}% | ${ret.padStart(5)}% | ${cagr.padStart(5)}% | ${pf.padStart(5)} | ${(-s.maxDD).toFixed(1).padStart(6)}% | ${s.rrr.toFixed(1).padStart(5)}`;
}

const candles = loadCSV(path.join(__dirname, 'data', 'btc_usdt_1h.csv'));
console.log(`${candles.length} Candles · 4.1 Jahre · alle Tests inkl. 0.3% Drag`);
console.log(`Baseline: Skip Sun + No Time Stop\n`);

const variants = [
    ['Baseline (current best)',                {}],

    ['+ Min Vol 0.5% (skip dead market)',      { minVolPct: 0.5 }],
    ['+ Min Vol 1.0%',                          { minVolPct: 1.0 }],
    ['+ Max Vol 4% (skip extreme)',            { maxVolPct: 4.0 }],
    ['+ Vol 0.8-3.5% (sweet spot)',            { minVolPct: 0.8, maxVolPct: 3.5 }],

    ['+ ADX rising (vs static ≥20)',           { requireRisingADX: true }],
    ['+ Max 8% above EMA50 (no FOMO)',         { maxEMA50Dist: 8 }],
    ['+ Max 5% above EMA50',                   { maxEMA50Dist: 5 }],
    ['+ RSI rising',                            { requireRisingRSI: true }],
    ['+ Higher High in 24h',                    { requireHH24: true }],

    ['+ Skip first 4h UTC (00:00-04:00)',      { skipFirstHoursUTC: 4 }],
    ['+ Skip first 2h UTC',                     { skipFirstHoursUTC: 2 }],

    ['+ Min 24h between trades',                { minHoursBetweenTrades: 24 }],
    ['+ Min 48h between trades',                { minHoursBetweenTrades: 48 }],
    ['+ Min 72h between trades',                { minHoursBetweenTrades: 72 }],

    ['COMBO Vol 0.8-3.5 + ADX rising',          { minVolPct: 0.8, maxVolPct: 3.5, requireRisingADX: true }],
    ['COMBO Vol 0.8-3.5 + Max 8% EMA50',        { minVolPct: 0.8, maxVolPct: 3.5, maxEMA50Dist: 8 }],
    ['COMBO Vol 0.8-3.5 + 24h between',         { minVolPct: 0.8, maxVolPct: 3.5, minHoursBetweenTrades: 24 }]
];

const results = variants.map(([name, opts]) => {
    const trades = runBacktest(candles, opts);
    return { name, opts, trades, stats: computeStats(trades) };
});

console.log('Strategie                               | Trd  | Win% | Total | CAGR  |   PF  |  MaxDD  |  R/DD');
console.log('----------------------------------------|------|------|-------|-------|-------|---------|------');
results.forEach(r => console.log(row(r.name, r.stats)));

// Find true winners (PF >= baseline AND R/DD >= baseline)
const baseline = results[0].stats;
const winners = results.slice(1).filter(r =>
    r.stats.trades >= 30 && r.stats.profitFactor >= baseline.profitFactor && r.stats.rrr >= baseline.rrr
);

console.log(`\n📊 Baseline: PF ${baseline.profitFactor.toFixed(2)}, R/DD ${baseline.rrr.toFixed(1)}, Return +${baseline.totalReturn.toFixed(0)}%`);
if (winners.length) {
    console.log(`\n🏆 ${winners.length} Filter verbessern Baseline (PF UND R/DD besser):`);
    winners.forEach(w => console.log(`   ${row(w.name, w.stats)}`));
} else {
    console.log(`\n❌ Kein zusätzlicher Filter verbessert die Baseline (PF ${baseline.profitFactor.toFixed(2)} + R/DD ${baseline.rrr.toFixed(1)}).`);
    console.log(`   Strategy ist bereits optimal — weitere Filter entfernen Edge mehr als sie zufügen.`);
}
