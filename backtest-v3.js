/**
 * Backtest v3 — Combine winners from v2, tune parameters.
 *
 * v2 results identified:
 *   ✅ v6 Skip Weekend           PF 1.96, MaxDD -6.7%, Risk/Return 5.43
 *   ✅ v3 Breakeven Stop         neutral (no harm)
 *   ❌ everything else            either kills edge or adds risk
 *
 * v3 tests:
 *   - Skip Weekend alone (vs Skip Sat-only vs Skip Sun-only)
 *   - Skip Weekend + Breakeven
 *   - Different RSI windows (40-72, 50-65)
 *   - Different ATR multipliers (2.0, 2.5, 3.0)
 *   - Disable Death Cross exit
 *   - Disable Time Stop
 *   - Apply realistic fees & slippage to top variant
 */

const fs = require('fs');
const path = require('path');

// ─── Indicators ───────────────────────────────────────────────────
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

function loadCSV(file) {
    const raw = fs.readFileSync(file, 'utf8').trim().split('\n');
    const out = [];
    for (let i = 1; i < raw.length; i++) {
        const r = raw[i].split(',');
        out.push({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] });
    }
    return out;
}

const BASE = {
    emaFast: 15, emaSlow: 300, emaHTF: 800,
    rsiPeriod: 14,
    atrPeriod: 14,
    trail: { tier1: 2.5, tier2: 2.0, tier3: 4.0, tier2Trig: 3, tier3Trig: 5 },
    adxPeriod: 14
};

function calcTrailingStop(entry, current, atr) {
    const profitATR = (current - entry) / atr;
    let dist;
    if (profitATR >= BASE.trail.tier3Trig) dist = BASE.trail.tier3;
    else if (profitATR >= BASE.trail.tier2Trig) dist = BASE.trail.tier2;
    else dist = BASE.trail.tier1;
    return current - atr * dist;
}

function runBacktest(candles, opts = {}) {
    const rsiMin = opts.rsiMin ?? 45;
    const rsiMax = opts.rsiMax ?? 70;
    const atrMult = opts.atrMult ?? 2.5;
    const adxThr = opts.adxThr ?? 20;
    const skipSat = opts.skipSat ?? false;
    const skipSun = opts.skipSun ?? false;
    const useBreakeven = opts.useBreakeven ?? false;
    const enableDeathCross = opts.enableDeathCross ?? true;
    const enableTimeStop = opts.enableTimeStop ?? true;
    const feePct = opts.feePct ?? 0;       // round-trip fee %
    const slipPct = opts.slipPct ?? 0;     // round-trip slippage %

    const closes = candles.map(c => c.close);
    const e15 = ema(closes, BASE.emaFast);
    const e300 = ema(closes, BASE.emaSlow);
    const e800 = ema(closes, BASE.emaHTF);
    const rsi = rsiSeries(closes, BASE.rsiPeriod);
    const atr = atrSeries(candles, BASE.atrPeriod);
    const adx = adxSeries(candles, BASE.adxPeriod);

    const trades = [];
    let position = null;
    let trendIsUp = false;
    const minIdx = BASE.emaHTF + 50;

    for (let i = minIdx; i < candles.length; i++) {
        const c = candles[i];
        const fastAboveSlow = e15[i] > e300[i];
        const priceAboveHtf = c.close > e800[i];
        const newTrendUp = fastAboveSlow && priceAboveHtf;

        if (position) {
            if (c.high > position.highestPrice) position.highestPrice = c.high;
            let newStop = calcTrailingStop(position.entryPrice, position.highestPrice, position.entryATR);
            if (useBreakeven && !position.beLocked) {
                if ((c.close - position.entryPrice) / position.entryATR >= 1.0) {
                    newStop = Math.max(newStop, position.entryPrice);
                    position.beLocked = true;
                }
            }
            if (newStop > position.stop) position.stop = newStop;

            if (c.close <= position.stop) {
                const exitPrice = position.stop * (1 - slipPct / 100);
                position.exitTime = c.time;
                position.exitPrice = exitPrice;
                position.exitReason = 'TRAILING_STOP';
                position.barsHeld = i - position.entryIdx;
                position.pnlPct = ((exitPrice - position.entryPrice) / position.entryPrice) * 100 - feePct;
                trades.push(position);
                position = null;
                trendIsUp = newTrendUp;
                continue;
            }
            const profitPct = (c.close - position.entryPrice) / position.entryPrice;
            if (enableDeathCross && !fastAboveSlow && profitPct < 0.05) {
                const exitPrice = c.close * (1 - slipPct / 100);
                position.exitTime = c.time;
                position.exitPrice = exitPrice;
                position.exitReason = 'DEATH_CROSS';
                position.barsHeld = i - position.entryIdx;
                position.pnlPct = ((exitPrice - position.entryPrice) / position.entryPrice) * 100 - feePct;
                trades.push(position);
                position = null;
                trendIsUp = newTrendUp;
                continue;
            }
            const hoursHeld = i - position.entryIdx;
            if (enableTimeStop && hoursHeld >= 72 && profitPct < 0.005) {
                const exitPrice = c.close * (1 - slipPct / 100);
                position.exitTime = c.time;
                position.exitPrice = exitPrice;
                position.exitReason = 'TIME_STOP';
                position.barsHeld = hoursHeld;
                position.pnlPct = ((exitPrice - position.entryPrice) / position.entryPrice) * 100 - feePct;
                trades.push(position);
                position = null;
                trendIsUp = newTrendUp;
                continue;
            }
        }

        if (!position) {
            const goldenCross = !trendIsUp && newTrendUp;
            const rsiInZone = rsi[i] >= rsiMin && rsi[i] <= rsiMax;
            const adxOk = Number.isFinite(adx[i]) && adx[i] >= adxThr;
            let triggered = goldenCross && rsiInZone && adxOk;

            if (triggered && (skipSat || skipSun)) {
                const dow = new Date(c.time + 'Z').getUTCDay(); // 0=Sun, 6=Sat
                if ((skipSat && dow === 6) || (skipSun && dow === 0)) triggered = false;
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
                    adxAtEntry: adx[i],
                    beLocked: false
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
    const returns = trades.map(t => t.pnlPct / 100);
    const meanR = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - meanR) ** 2, 0) / returns.length;
    const stdR = Math.sqrt(variance);
    const sharpe = stdR ? (meanR / stdR) * Math.sqrt(trades.length) : 0;
    return {
        trades: trades.length,
        winRate: (wins.length / trades.length) * 100,
        totalReturn: equity - 100,
        profitFactor: grossLoss > 0 ? grossWin / grossLoss : Infinity,
        maxDD,
        avgWin: wins.length ? grossWin / wins.length : 0,
        avgLoss: losses.length ? -grossLoss / losses.length : 0,
        sharpe,
        rrr: (equity - 100) / Math.max(maxDD, 0.5)
    };
}

function row(name, s) {
    if (!s.trades) return `${name.padEnd(40)}| keine Trades`;
    const ret = (s.totalReturn >= 0 ? '+' : '') + s.totalReturn.toFixed(1);
    const pf = s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2);
    return `${name.padEnd(40)}| ${String(s.trades).padStart(4)} | ${s.winRate.toFixed(0).padStart(3)}% | ${ret.padStart(7)}% | ${pf.padStart(5)} | ${(-s.maxDD).toFixed(1).padStart(6)}% | ${s.rrr.toFixed(1).padStart(5)} | ${s.sharpe.toFixed(2).padStart(5)}`;
}

const candles = loadCSV(path.join(__dirname, 'data', 'btc_usdt_1h.csv'));
console.log(`${candles.length} Candles · ${candles[0].time} → ${candles[candles.length - 1].time}\n`);

const variants = [
    ['Baseline (v0)',                                {}],

    ['Skip Sa+So (v6)',                              { skipSat: true, skipSun: true }],
    ['Skip Sa only',                                 { skipSat: true }],
    ['Skip So only',                                 { skipSun: true }],

    ['v6 + Breakeven',                               { skipSat: true, skipSun: true, useBreakeven: true }],
    ['v6 + Breakeven + ADX22',                       { skipSat: true, skipSun: true, useBreakeven: true, adxThr: 22 }],

    ['RSI 40-72',                                    { rsiMin: 40, rsiMax: 72 }],
    ['RSI 50-65',                                    { rsiMin: 50, rsiMax: 65 }],
    ['RSI 45-65 (no overheat)',                      { rsiMax: 65 }],

    ['ATR mult 2.0 (tighter stop)',                  { atrMult: 2.0 }],
    ['ATR mult 3.0 (looser stop)',                   { atrMult: 3.0 }],

    ['No Death Cross exit',                          { enableDeathCross: false }],
    ['No Time Stop',                                 { enableTimeStop: false }],
    ['No Death Cross + No Time Stop',                { enableDeathCross: false, enableTimeStop: false }],

    ['v6 + No Death Cross',                          { skipSat: true, skipSun: true, enableDeathCross: false }],
    ['v6 + No Time Stop',                            { skipSat: true, skipSun: true, enableTimeStop: false }],

    ['v6 + Realistic costs (0.2% fee + 0.1% slip)',  { skipSat: true, skipSun: true, feePct: 0.2, slipPct: 0.1 }],
    ['Baseline + Realistic costs',                   { feePct: 0.2, slipPct: 0.1 }]
];

const results = variants.map(([name, opts]) => {
    const trades = runBacktest(candles, opts);
    return { name, opts, trades, stats: computeStats(trades) };
});

console.log('Strategie                               | Trd  | Win% | Return  |   PF  |  MaxDD  |  R/DD | Sharp');
console.log('----------------------------------------|------|------|---------|-------|---------|-------|------');
results.forEach(r => console.log(row(r.name, r.stats)));

// Best by 3 metrics
const valid = results.filter(r => r.stats.trades > 20);
const byPF = [...valid].sort((a, b) => b.stats.profitFactor - a.stats.profitFactor)[0];
const byRRR = [...valid].sort((a, b) => b.stats.rrr - a.stats.rrr)[0];
const byReturn = [...valid].sort((a, b) => b.stats.totalReturn - a.stats.totalReturn)[0];

console.log(`\n🏆 Höchster PF:        ${byPF.name} (${byPF.stats.profitFactor.toFixed(2)})`);
console.log(`🏆 Bester R/DD:        ${byRRR.name} (${byRRR.stats.rrr.toFixed(1)}x)`);
console.log(`🏆 Höchster Return:    ${byReturn.name} (+${byReturn.stats.totalReturn.toFixed(1)}%)`);
