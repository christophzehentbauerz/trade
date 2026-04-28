/**
 * Backtest v2 — Tests targeted improvements on top of baseline.
 * Baseline = Echter Cross + ADX≥20 (PF 1.94 in earlier run).
 *
 * Variants tested:
 *   v0  Baseline
 *   v1  + 4h trend confirmation (4h EMA50 > EMA200)
 *   v2  + Volume filter (1h vol > 1.2x 20h avg)
 *   v3  + Breakeven stop at +1R (move stop to entry once profit ≥ 1R)
 *   v4  ADX ≥ 22 (slightly stricter)
 *   v5  ADX ≥ 25 (stricter)
 *   v6  + Skip weekend entries (Sat 00:00 UTC – Sun 23:59 UTC)
 *   v7  + Volatility-adjusted ATR multiplier (0.8x in low-vol, 1.2x in high-vol)
 *   v8  + Pyramid: add 0.5x position at +2R if trend still strong
 *   vBEST Combination of the most promising
 */

const fs = require('fs');
const path = require('path');

// ─── Indicators (identical to backtest-adx.js) ────────────────────
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

// ─── Resampling ───────────────────────────────────────────────────
function resampleTo4h(candles) {
    const out = [];
    for (let i = 0; i + 4 <= candles.length; i += 4) {
        const slice = candles.slice(i, i + 4);
        out.push({
            time: slice[0].time,
            open: slice[0].open,
            high: Math.max(...slice.map(c => c.high)),
            low: Math.min(...slice.map(c => c.low)),
            close: slice[slice.length - 1].close,
            volume: slice.reduce((a, c) => a + c.volume, 0)
        });
    }
    return out;
}

// Map 1h index → corresponding 4h index
function build1hTo4hIndex(candles, candles4h) {
    const map = new Array(candles.length).fill(0);
    let j = 0;
    for (let i = 0; i < candles.length; i++) {
        // 4h candle at index k covers candles 4k..4k+3
        const fourHIdx = Math.min(Math.floor(i / 4), candles4h.length - 1);
        map[i] = fourHIdx;
    }
    return map;
}

// ─── Load data ────────────────────────────────────────────────────
function loadCSV(file) {
    const raw = fs.readFileSync(file, 'utf8').trim().split('\n');
    const out = [];
    for (let i = 1; i < raw.length; i++) {
        const r = raw[i].split(',');
        out.push({
            time: r[0],
            timeMs: new Date(r[0] + 'Z').getTime(),
            open: +r[1], high: +r[2], low: +r[3], close: +r[4],
            volume: +r[5]
        });
    }
    return out;
}

// ─── Strategy config ──────────────────────────────────────────────
const BASE_STRAT = {
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
    timeStopMinProfit: 0.005,
    adxPeriod: 14,
    adxThreshold: 20
};

function calcTrailingStop(entry, current, atr, mult = 1) {
    const profitATR = (current - entry) / atr;
    const t = BASE_STRAT.trail;
    let dist;
    if (profitATR >= t.tier3.triggerATR) dist = t.tier3.distanceATR;
    else if (profitATR >= t.tier2.triggerATR) dist = t.tier2.distanceATR;
    else dist = t.tier1.distanceATR;
    return { newStop: current - atr * dist * mult, profitATR };
}

// ─── Backtest engine ──────────────────────────────────────────────
function runBacktest(candles, opts = {}) {
    const adxThr = opts.adxThreshold ?? BASE_STRAT.adxThreshold;
    const useFourHFilter = !!opts.useFourHFilter;
    const useVolume = !!opts.useVolume;
    const useBreakeven = !!opts.useBreakeven;
    const skipWeekend = !!opts.skipWeekend;
    const useVolAdjATR = !!opts.useVolAdjATR;
    const usePyramid = !!opts.usePyramid;

    const closes = candles.map(c => c.close);
    const e15 = ema(closes, BASE_STRAT.emaFast);
    const e300 = ema(closes, BASE_STRAT.emaSlow);
    const e800 = ema(closes, BASE_STRAT.emaHTF);
    const rsi = rsiSeries(closes, BASE_STRAT.rsiPeriod);
    const atr = atrSeries(candles, BASE_STRAT.atrPeriod);
    const adx = adxSeries(candles, BASE_STRAT.adxPeriod);

    // 4h data for MTF confirmation
    let e50_4h, e200_4h, idx1hTo4h;
    if (useFourHFilter) {
        const candles4h = resampleTo4h(candles);
        const closes4h = candles4h.map(c => c.close);
        e50_4h = ema(closes4h, 50);
        e200_4h = ema(closes4h, 200);
        idx1hTo4h = build1hTo4hIndex(candles, candles4h);
    }

    const trades = [];
    let position = null;
    let trendIsUp = false;
    const minIdx = BASE_STRAT.emaHTF + 50;

    for (let i = minIdx; i < candles.length; i++) {
        const c = candles[i];
        const fastAboveSlow = e15[i] > e300[i];
        const priceAboveHtf = c.close > e800[i];
        const newTrendUp = fastAboveSlow && priceAboveHtf;

        // ─ Manage open position ─
        if (position) {
            if (c.high > position.highestPrice) position.highestPrice = c.high;

            // Volatility-adjusted trailing multiplier
            const volMult = useVolAdjATR
                ? (atr[i] / c.close > 0.025 ? 1.2 : (atr[i] / c.close < 0.012 ? 0.8 : 1.0))
                : 1.0;

            const ts = calcTrailingStop(position.entryPrice, position.highestPrice, position.entryATR, volMult);
            let newStop = ts.newStop;

            // Breakeven: once at +1R, move stop to entry
            if (useBreakeven && !position.breakevenLocked) {
                const profitATR = (c.close - position.entryPrice) / position.entryATR;
                if (profitATR >= 1.0) {
                    newStop = Math.max(newStop, position.entryPrice);
                    position.breakevenLocked = true;
                }
            }
            if (newStop > position.stop) position.stop = newStop;

            // Pyramid: at +2R if trend still strong → add half size
            if (usePyramid && !position.pyramided) {
                const profitATR = (c.close - position.entryPrice) / position.entryATR;
                if (profitATR >= 2.0 && fastAboveSlow && priceAboveHtf && Number.isFinite(adx[i]) && adx[i] >= adxThr) {
                    position.pyramided = true;
                    position.pyramidEntryPrice = c.close;
                }
            }

            if (c.close <= position.stop) {
                position.exitTime = c.time;
                position.exitPrice = c.close;
                position.exitReason = 'TRAILING_STOP';
                position.barsHeld = i - position.entryIdx;
                let pnl = (position.exitPrice - position.entryPrice) / position.entryPrice * 100;
                if (position.pyramided && position.pyramidEntryPrice) {
                    // Add 0.5x weighted return from pyramid leg
                    const pyrPnl = (position.exitPrice - position.pyramidEntryPrice) / position.pyramidEntryPrice * 100;
                    pnl = (pnl + pyrPnl * 0.5) / 1.5;
                }
                position.pnlPct = pnl;
                trades.push(position);
                position = null;
                trendIsUp = newTrendUp;
                continue;
            }
            const profitPct = (c.close - position.entryPrice) / position.entryPrice;
            if (!fastAboveSlow && profitPct < BASE_STRAT.deathCrossMaxProfit) {
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
            if (hoursHeld >= BASE_STRAT.timeStopHours && profitPct < BASE_STRAT.timeStopMinProfit) {
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

        // ─ Entry check ─
        if (!position) {
            const goldenCross = !trendIsUp && newTrendUp;
            const rsiInZone = rsi[i] >= BASE_STRAT.rsiMin && rsi[i] <= BASE_STRAT.rsiMax;
            const adxOk = Number.isFinite(adx[i]) && adx[i] >= adxThr;
            let triggered = goldenCross && rsiInZone && adxOk;

            if (triggered && useFourHFilter) {
                const fourHIdx = idx1hTo4h[i];
                const fhTrendUp = Number.isFinite(e50_4h[fourHIdx]) && Number.isFinite(e200_4h[fourHIdx]) && e50_4h[fourHIdx] > e200_4h[fourHIdx];
                if (!fhTrendUp) triggered = false;
            }

            if (triggered && useVolume) {
                const start = Math.max(0, i - 20);
                const slice = candles.slice(start, i);
                const avgVol = slice.reduce((a, x) => a + x.volume, 0) / Math.max(1, slice.length);
                if (c.volume < avgVol * 1.2) triggered = false;
            }

            if (triggered && skipWeekend) {
                const dow = new Date(c.time + 'Z').getUTCDay(); // 0=Sun, 6=Sat
                if (dow === 0 || dow === 6) triggered = false;
            }

            if (triggered) {
                position = {
                    entryTime: c.time,
                    entryIdx: i,
                    entryPrice: c.close,
                    entryATR: atr[i],
                    highestPrice: c.high,
                    stop: c.close - atr[i] * BASE_STRAT.atrMultiplier,
                    adxAtEntry: adx[i] || null,
                    breakevenLocked: false,
                    pyramided: false
                };
            }
        }
        trendIsUp = newTrendUp;
    }

    return trades;
}

// ─── Stats ────────────────────────────────────────────────────────
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
    // Sharpe-lite (return std)
    const returns = trades.map(t => t.pnlPct / 100);
    const meanR = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - meanR) ** 2, 0) / returns.length;
    const stdR = Math.sqrt(variance);
    const sharpe = stdR ? (meanR / stdR) * Math.sqrt(trades.length) : 0;

    return {
        trades: trades.length,
        wins: wins.length,
        losses: losses.length,
        winRate: (wins.length / trades.length) * 100,
        totalReturn: equity - 100,
        profitFactor: grossLoss > 0 ? grossWin / grossLoss : Infinity,
        maxDD,
        avgWin: wins.length ? grossWin / wins.length : 0,
        avgLoss: losses.length ? -grossLoss / losses.length : 0,
        sharpe,
        avgBarsHeld: trades.reduce((a, t) => a + t.barsHeld, 0) / trades.length
    };
}

function formatRow(name, s) {
    if (!s.trades) return `${name.padEnd(34)}| keine Trades`;
    const ret = (s.totalReturn >= 0 ? '+' : '') + s.totalReturn.toFixed(1);
    const pf = s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2);
    return `${name.padEnd(34)}| ${String(s.trades).padStart(4)} | ${s.winRate.toFixed(0).padStart(3)}% | ${ret.padStart(7)}% | ${pf.padStart(5)} | ${(-s.maxDD).toFixed(1).padStart(6)}% | ${s.sharpe.toFixed(2).padStart(5)} | +${s.avgWin.toFixed(2).padStart(5)}% | ${s.avgLoss.toFixed(2).padStart(6)}% | ${s.avgBarsHeld.toFixed(0).padStart(3)}h`;
}

// ─── Main ─────────────────────────────────────────────────────────
const dataFile = path.join(__dirname, 'data', 'btc_usdt_1h.csv');
console.log(`Lade ${dataFile} ...`);
const candles = loadCSV(dataFile);
console.log(`${candles.length} 1h-Candles geladen (${candles[0].time} → ${candles[candles.length - 1].time})\n`);

const variants = [
    ['v0  Baseline (Echter Cross + ADX≥20)', {}],
    ['v1  + 4h-Trend (4h EMA50 > EMA200)',   { useFourHFilter: true }],
    ['v2  + Volume-Filter (>1.2x 20h avg)',  { useVolume: true }],
    ['v3  + Breakeven-Stop bei +1R',         { useBreakeven: true }],
    ['v4  ADX ≥ 22',                         { adxThreshold: 22 }],
    ['v5  ADX ≥ 25',                         { adxThreshold: 25 }],
    ['v6  + Skip Wochenende (Sa/So)',        { skipWeekend: true }],
    ['v7  + Vol-adj ATR (0.8×–1.2×)',        { useVolAdjATR: true }],
    ['v8  + Pyramid bei +2R',                { usePyramid: true }],
    ['vBEST 4h + Breakeven + ADX25',         { useFourHFilter: true, useBreakeven: true, adxThreshold: 25 }],
    ['vBEST2 4h + Breakeven + ADX22',        { useFourHFilter: true, useBreakeven: true, adxThreshold: 22 }],
    ['vBEST3 4h + Breakeven + Vol-adj',      { useFourHFilter: true, useBreakeven: true, useVolAdjATR: true }]
];

const results = variants.map(([name, opts]) => {
    const trades = runBacktest(candles, opts);
    return { name, opts, trades, stats: computeStats(trades) };
});

console.log('Strategie                         | Trd  | Win% | Return  |   PF  |  MaxDD  | Sharp |  AvgWin |  AvgLoss | Hold');
console.log('----------------------------------|------|------|---------|-------|---------|-------|---------|----------|------');
results.forEach(r => console.log(formatRow(r.name, r.stats)));

// Save best variant trades
const best = results.reduce((a, b) =>
    (b.stats.profitFactor || 0) > (a.stats.profitFactor || 0) ? b : a, { stats: { profitFactor: 0 } });
console.log(`\n🏆 Bester Profit Factor: ${best.name} (PF ${best.stats.profitFactor.toFixed(2)})`);

const bestRR = results.reduce((a, b) => {
    const aScore = a.stats.trades ? (a.stats.totalReturn / Math.max(a.stats.maxDD, 1)) : 0;
    const bScore = b.stats.trades ? (b.stats.totalReturn / Math.max(b.stats.maxDD, 1)) : 0;
    return bScore > aScore ? b : a;
}, results[0]);
console.log(`🏆 Bestes Return/MaxDD-Verhältnis: ${bestRR.name} (${(bestRR.stats.totalReturn / Math.max(bestRR.stats.maxDD, 1)).toFixed(2)}x)`);

// Save trade CSVs for top variants
const resultsDir = path.join(__dirname, 'results');
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir);
for (const r of results) {
    const safeName = r.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    fs.writeFileSync(path.join(resultsDir, `v2_${safeName}.csv`),
        'entryTime,exitTime,entryPrice,exitPrice,pnlPct,barsHeld,exitReason,adxAtEntry,pyramided\n' +
        r.trades.map(t => `${t.entryTime},${t.exitTime},${t.entryPrice.toFixed(2)},${t.exitPrice.toFixed(2)},${t.pnlPct.toFixed(4)},${t.barsHeld},${t.exitReason},${t.adxAtEntry != null ? t.adxAtEntry.toFixed(2) : 'NaN'},${!!t.pyramided}`).join('\n')
    );
}
console.log(`\n${results.length} CSVs gespeichert in results/v2_*.csv`);
