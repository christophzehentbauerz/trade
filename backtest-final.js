/**
 * Backtest FINAL — Combine winners with realistic costs.
 *
 * Key learnings from v3:
 *   ✅ Skip Sunday only (not Saturday) — better PF
 *   ✅ Remove Time Stop — winners run longer, +20% return
 *   ✅ Optional: Breakeven Stop — slight reduction in MaxDD
 *   ❌ 4h trend filter, Volume filter, RSI tightening, Pyramid — all hurt
 *
 * Tests below ALL include realistic costs (0.2% fee + 0.1% slippage = 0.3% drag/trade).
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
    const skipSun = opts.skipSun !== false; // default true
    const enableTimeStop = opts.enableTimeStop ?? false; // default false (no time stop)
    const useBreakeven = opts.useBreakeven ?? false;
    const adxThr = opts.adxThr ?? 20;
    const rsiMin = opts.rsiMin ?? 45;
    const rsiMax = opts.rsiMax ?? 70;
    const atrMult = opts.atrMult ?? 2.5;
    const feePct = opts.feePct ?? 0.2;
    const slipPct = opts.slipPct ?? 0.1;

    const closes = candles.map(c => c.close);
    const e15 = ema(closes, 15);
    const e300 = ema(closes, 300);
    const e800 = ema(closes, 800);
    const rsi = rsiSeries(closes, 14);
    const atr = atrSeries(candles, 14);
    const adx = adxSeries(candles, 14);

    const trades = [];
    let position = null;
    let trendIsUp = false;
    const minIdx = 850;

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
                position.exitReason = 'TRAIL';
                position.barsHeld = i - position.entryIdx;
                position.pnlPct = ((exitPrice - position.entryPrice) / position.entryPrice) * 100 - feePct;
                trades.push(position);
                position = null;
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

            if (triggered && skipSun) {
                const dow = new Date(c.time + 'Z').getUTCDay();
                if (dow === 0) triggered = false;
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

function computeStats(trades, candles) {
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
    // Years for CAGR
    const start = new Date(trades[0].entryTime + 'Z').getTime();
    const end = new Date(trades[trades.length - 1].exitTime + 'Z').getTime();
    const years = (end - start) / (365.25 * 24 * 3600 * 1000);
    const cagr = years > 0 ? (Math.pow(equity / 100, 1 / years) - 1) * 100 : 0;

    const exitMix = {};
    trades.forEach(t => exitMix[t.exitReason] = (exitMix[t.exitReason] || 0) + 1);

    return {
        trades: trades.length,
        winRate: (wins.length / trades.length) * 100,
        totalReturn: equity - 100,
        cagr,
        profitFactor: grossLoss > 0 ? grossWin / grossLoss : Infinity,
        maxDD,
        avgWin: wins.length ? grossWin / wins.length : 0,
        avgLoss: losses.length ? -grossLoss / losses.length : 0,
        rrr: (equity - 100) / Math.max(maxDD, 0.5),
        exits: exitMix,
        years
    };
}

function row(name, s) {
    if (!s.trades) return `${name.padEnd(36)}| keine Trades`;
    const ret = (s.totalReturn >= 0 ? '+' : '') + s.totalReturn.toFixed(0);
    const cagr = (s.cagr >= 0 ? '+' : '') + s.cagr.toFixed(1);
    const pf = s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2);
    return `${name.padEnd(36)}| ${String(s.trades).padStart(4)} | ${s.winRate.toFixed(0).padStart(3)}% | ${ret.padStart(5)}% | ${cagr.padStart(5)}% | ${pf.padStart(5)} | ${(-s.maxDD).toFixed(1).padStart(6)}% | ${s.rrr.toFixed(1).padStart(5)}`;
}

const candles = loadCSV(path.join(__dirname, 'data', 'btc_usdt_1h.csv'));
const years = ((new Date(candles[candles.length-1].time + 'Z') - new Date(candles[0].time + 'Z')) / (365.25*24*3600*1000)).toFixed(1);
console.log(`${candles.length} Candles · ${candles[0].time} → ${candles[candles.length - 1].time} · ${years} Jahre`);
console.log(`Alle Tests inkl. realistische Kosten: 0.2% Fee + 0.1% Slippage = 0.3% Drag/Trade\n`);

const variants = [
    ['Aktueller Bot (Original Baseline)',           { enableTimeStop: true, skipSun: false }],
    ['+ Skip Sonntag-Entries',                      { enableTimeStop: true, skipSun: true }],
    ['+ Time Stop entfernt',                        { enableTimeStop: false, skipSun: false }],
    ['NEU: Skip Sun + No Time Stop',                { enableTimeStop: false, skipSun: true }],
    ['NEU + Breakeven',                             { enableTimeStop: false, skipSun: true, useBreakeven: true }],
    ['NEU + Breakeven + RSI 40-72',                 { enableTimeStop: false, skipSun: true, useBreakeven: true, rsiMin: 40, rsiMax: 72 }],
    ['NEU + RSI 40-72',                             { enableTimeStop: false, skipSun: true, rsiMin: 40, rsiMax: 72 }],
    ['NEU + ATR 2.0 (tighter stop)',                { enableTimeStop: false, skipSun: true, atrMult: 2.0 }],
    ['NEU + ATR 3.0 (looser stop)',                 { enableTimeStop: false, skipSun: true, atrMult: 3.0 }],
    ['Buy & Hold (zum Vergleich)',                  null] // computed separately
];

const results = [];
for (const [name, opts] of variants) {
    if (opts === null) continue;
    const trades = runBacktest(candles, opts);
    results.push({ name, opts, trades, stats: computeStats(trades, candles) });
}

// Buy & Hold equivalent
const bhEntry = candles[850].close;
const bhExit = candles[candles.length - 1].close;
const bhRet = ((bhExit - bhEntry) / bhEntry) * 100;
const bhYears = (new Date(candles[candles.length - 1].time + 'Z') - new Date(candles[850].time + 'Z')) / (365.25*24*3600*1000);
const bhCagr = (Math.pow(bhExit / bhEntry, 1 / bhYears) - 1) * 100;
// Compute BH max drawdown
let bhPeak = bhEntry, bhMaxDD = 0;
for (let i = 850; i < candles.length; i++) {
    if (candles[i].high > bhPeak) bhPeak = candles[i].high;
    const dd = (bhPeak - candles[i].low) / bhPeak * 100;
    if (dd > bhMaxDD) bhMaxDD = dd;
}
const bhStats = { trades: 1, winRate: 100, totalReturn: bhRet, cagr: bhCagr, profitFactor: Infinity, maxDD: bhMaxDD, rrr: bhRet / bhMaxDD };
results.push({ name: 'Buy & Hold (zum Vergleich)', stats: bhStats });

console.log('Strategie                           | Trd  | Win% | Total | CAGR  |   PF  |  MaxDD  |  R/DD');
console.log('------------------------------------|------|------|-------|-------|-------|---------|------');
results.forEach(r => console.log(row(r.name, r.stats)));

console.log('\n📋 Exit-Reason Verteilung der besten Variante:');
const champ = results.find(r => r.name.startsWith('NEU + Breakeven') && !r.name.includes('RSI'));
if (champ && champ.stats.exits) {
    Object.entries(champ.stats.exits).forEach(([k, v]) => {
        const pct = ((v / champ.stats.trades) * 100).toFixed(0);
        console.log(`   ${k.padEnd(8)} ${String(v).padStart(3)} (${pct}%)`);
    });
}
