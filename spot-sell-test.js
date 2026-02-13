/**
 * Smart Accumulator v3 - Sell Score Optimization Test
 * Compares v2 sell logic vs v3 with bull market dampener
 */

const https = require('https');

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });
}

function calculateRSI(data, period) {
    if (data.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = data[i] - data[i - 1];
        if (diff > 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period, avgLoss = losses / period;
    for (let i = period + 1; i < data.length; i++) {
        const diff = data[i] - data[i - 1];
        if (diff > 0) {
            avgGain = (avgGain * (period - 1) + diff) / period;
            avgLoss = (avgLoss * (period - 1)) / period;
        } else {
            avgGain = (avgGain * (period - 1)) / period;
            avgLoss = (avgLoss * (period - 1) - diff) / period;
        }
    }
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
}

function sma(data, period) {
    if (data.length < period) return 0;
    return data.slice(-period).reduce((a, b) => a + b, 0) / period;
}

async function fetchAllCandles() {
    let all = [];
    let startTime = new Date('2017-01-01').getTime();
    while (startTime < Date.now()) {
        const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000&startTime=${startTime}`;
        const raw = await fetchJSON(url);
        if (!raw.length) break;
        all = all.concat(raw.map(c => ({
            date: new Date(c[0]).toISOString().split('T')[0],
            high: parseFloat(c[2]),
            close: parseFloat(c[4])
        })));
        startTime = raw[raw.length - 1][0] + 86400000;
        await new Promise(r => setTimeout(r, 200));
    }
    return all;
}

function calcScores(candles, i) {
    const closes = candles.slice(0, i + 1).map(c => c.close);
    const highs = candles.slice(0, i + 1).map(c => c.high);
    const price = closes[closes.length - 1];
    const sma200 = sma(closes, 200);
    const sma50val = sma(closes, 50);
    const rsiDaily = calculateRSI(closes, 14);
    const weeklies = []; for (let w = 6; w < closes.length; w += 7) weeklies.push(closes[w]);
    const rsiWeekly = weeklies.length > 15 ? calculateRSI(weeklies, 14) : 50;
    const ath = Math.max(...highs);
    const athDown = ((ath - price) / ath) * 100;
    const smaRatio = price / sma200;

    // BUY SCORE (same as v2)
    let buyScore = 0;
    if (smaRatio < 0.85) buyScore += 35;
    else if (smaRatio < 1.0) buyScore += 30;
    else if (smaRatio < 1.1) buyScore += 20;
    else if (smaRatio < 1.3) buyScore += 10;
    else if (smaRatio >= 1.5) buyScore -= 10;
    if (rsiDaily < 30) buyScore += 25;
    else if (rsiDaily < 40) buyScore += 20;
    else if (rsiDaily < 50) buyScore += 12;
    else if (rsiDaily < 60) buyScore += 5;
    else if (rsiDaily >= 70) buyScore -= 5;
    buyScore += 3; // F&G neutral
    if (athDown > 60) buyScore += 10;
    else if (athDown > 40) buyScore += 8;
    else if (athDown > 25) buyScore += 5;
    else if (athDown > 15) buyScore += 2;
    if (rsiWeekly < 35) buyScore += 10;
    else if (rsiWeekly < 45) buyScore += 7;
    else if (rsiWeekly < 55) buyScore += 3;
    else if (rsiWeekly > 80) buyScore -= 5;
    buyScore = Math.max(0, Math.min(100, buyScore));

    // ═══ V2 SELL SCORE (original) ═══
    let sellV2 = 0;
    if (smaRatio > 1.5) sellV2 += 30; else if (smaRatio > 1.3) sellV2 += 15;
    if (rsiDaily > 80) sellV2 += 25; else if (rsiDaily > 70) sellV2 += 15;
    if (rsiWeekly > 80) sellV2 += 15; else if (rsiWeekly > 70) sellV2 += 10;
    if (athDown < 5) sellV2 += 10;
    sellV2 = Math.max(0, Math.min(100, sellV2));

    // ═══ V3 SELL SCORE (improved) ═══
    let sellV3 = 0;

    // 1. SMA200 Extension (Max 25) - How stretched is price above SMA?
    if (smaRatio > 2.0) sellV3 += 25;       // 100%+ above SMA → extreme
    else if (smaRatio > 1.6) sellV3 += 20;  // 60%+ above
    else if (smaRatio > 1.4) sellV3 += 12;  // 40%+ above
    else if (smaRatio > 1.3) sellV3 += 5;   // 30%+ above (milder)

    // 2. Daily RSI (Max 20) - tighter thresholds
    if (rsiDaily > 85) sellV3 += 20;
    else if (rsiDaily > 78) sellV3 += 12;
    else if (rsiDaily > 72) sellV3 += 5;

    // 3. Weekly RSI (Max 20) - KEY: weekly overbought is more reliable
    if (rsiWeekly > 85) sellV3 += 20;
    else if (rsiWeekly > 78) sellV3 += 12;
    else if (rsiWeekly > 72) sellV3 += 5;

    // 4. Near ATH (Max 10) - only counts if other factors align
    if (athDown < 3) sellV3 += 10;
    else if (athDown < 8) sellV3 += 5;

    // 5. Parabolic Extension (Max 15) - price way above SMA50 too
    const sma50ratio = price / sma50val;
    if (sma50ratio > 1.3) sellV3 += 15;
    else if (sma50ratio > 1.2) sellV3 += 8;
    else if (sma50ratio > 1.15) sellV3 += 3;

    // 6. DAMPENER: Bull Market Age
    // If price crossed above SMA200 recently, dampen sell score
    // Find how many consecutive days price has been above SMA200
    let daysAboveSMA = 0;
    for (let j = closes.length - 1; j >= Math.max(0, closes.length - 365); j--) {
        const s = sma(closes.slice(0, j + 1), 200);
        if (s > 0 && closes[j] > s) daysAboveSMA++;
        else break;
    }

    // If bull is young (< 60 days above SMA), dampen heavily
    if (daysAboveSMA < 30) sellV3 = Math.round(sellV3 * 0.3);
    else if (daysAboveSMA < 60) sellV3 = Math.round(sellV3 * 0.5);
    else if (daysAboveSMA < 120) sellV3 = Math.round(sellV3 * 0.7);
    // Mature bull (120+ days) → no dampening

    sellV3 = Math.max(0, Math.min(100, sellV3));

    return { date: candles[i].date, price, buyScore, sellV2, sellV3, smaRatio, rsiDaily, rsiWeekly, athDown, daysAboveSMA };
}

async function run() {
    console.log('📊 Fetching all BTC data...\n');
    const candles = await fetchAllCandles();
    console.log(`✅ ${candles.length} candles (${candles[0].date} → ${candles[candles.length - 1].date})\n`);

    const results = [];
    for (let i = 210; i < candles.length; i++) {
        results.push(calcScores(candles, i));
    }

    // Compare V2 vs V3 sell signals
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('🔴 SELL SIGNAL VERGLEICH: V2 vs V3');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    // Group V2 sell periods (threshold 35)
    const v2Periods = groupSellPeriods(results, 'sellV2', 35);
    const v3Periods = groupSellPeriods(results, 'sellV3', 35);

    console.log('──── V2 Sell Signale (Original, threshold ≥35) ────\n');
    let v2correct = 0, v2total = 0;
    for (const p of v2Periods) {
        const later = results.find(r => r.date >= addDays(p.end, 90));
        const draw = later ? ((later.price - p.maxPrice) / p.maxPrice * 100).toFixed(1) : null;
        const correct = draw !== null && draw < -10;
        if (draw !== null) { v2total++; if (correct) v2correct++; }
        const emoji = draw === null ? '⏳' : correct ? '✅' : draw < 0 ? '⚖️' : '❌';
        console.log(`  ${p.start} → ${p.end} | $${fmt(p.maxPrice)} | Score: ${p.maxScore} | 3M: ${draw !== null ? draw + '%' : '?'} ${emoji}`);
    }
    console.log(`\n  Ergebnis V2: ${v2correct}/${v2total} korrekt (${v2total > 0 ? Math.round(v2correct / v2total * 100) : 0}%)\n`);

    console.log('──── V3 Sell Signale (Verbessert, mit Bull-Dampener, threshold ≥35) ────\n');
    let v3correct = 0, v3total = 0;
    for (const p of v3Periods) {
        const later = results.find(r => r.date >= addDays(p.end, 90));
        const draw = later ? ((later.price - p.maxPrice) / p.maxPrice * 100).toFixed(1) : null;
        const correct = draw !== null && draw < -10;
        if (draw !== null) { v3total++; if (correct) v3correct++; }
        const emoji = draw === null ? '⏳' : correct ? '✅' : draw < 0 ? '⚖️' : '❌';
        const daysInfo = p.daysAbove ? ` | Bull: ${p.daysAbove}T` : '';
        console.log(`  ${p.start} → ${p.end} | $${fmt(p.maxPrice)} | Score: ${p.maxScore}${daysInfo} | 3M: ${draw !== null ? draw + '%' : '?'} ${emoji}`);
    }
    console.log(`\n  Ergebnis V3: ${v3correct}/${v3total} korrekt (${v3total > 0 ? Math.round(v3correct / v3total * 100) : 0}%)\n`);

    // Also show V3 with higher threshold (50)
    const v3PeriodsStrict = groupSellPeriods(results, 'sellV3', 50);
    console.log('──── V3 Sell Signale (STRICT, threshold ≥50) ────\n');
    let v3sCorrect = 0, v3sTotal = 0;
    for (const p of v3PeriodsStrict) {
        const later = results.find(r => r.date >= addDays(p.end, 90));
        const draw = later ? ((later.price - p.maxPrice) / p.maxPrice * 100).toFixed(1) : null;
        const correct = draw !== null && draw < -10;
        if (draw !== null) { v3sTotal++; if (correct) v3sCorrect++; }
        const emoji = draw === null ? '⏳' : correct ? '✅' : draw < 0 ? '⚖️' : '❌';
        console.log(`  ${p.start} → ${p.end} | $${fmt(p.maxPrice)} | Score: ${p.maxScore} | 3M: ${draw !== null ? draw + '%' : '?'} ${emoji}`);
    }
    console.log(`\n  Ergebnis V3 Strict: ${v3sCorrect}/${v3sTotal} korrekt (${v3sTotal > 0 ? Math.round(v3sCorrect / v3sTotal * 100) : 0}%)\n`);

    // Current state comparison
    const last = results[results.length - 1];
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('📍 AKTUELL');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');
    console.log(`  Buy: ${last.buyScore} | Sell V2: ${last.sellV2} | Sell V3: ${last.sellV3}`);
    console.log(`  RSI D: ${last.rsiDaily.toFixed(1)} | RSI W: ${last.rsiWeekly.toFixed(1)} | SMA: ${last.smaRatio.toFixed(2)} | ATH: -${last.athDown.toFixed(1)}% | Bull-Tage: ${last.daysAboveSMA}`);
}

function groupSellPeriods(results, key, threshold) {
    const signals = results.filter(r => r[key] >= threshold);
    let periods = [], cur = null;
    for (const s of signals) {
        if (!cur || daysDiff(cur.end, s.date) > 7) {
            if (cur) periods.push(cur);
            cur = { start: s.date, end: s.date, maxScore: s[key], maxPrice: s.price, daysAbove: s.daysAboveSMA };
        } else {
            cur.end = s.date;
            if (s[key] > cur.maxScore) { cur.maxScore = s[key]; cur.daysAbove = s.daysAboveSMA; }
            if (s.price > cur.maxPrice) cur.maxPrice = s.price;
        }
    }
    if (cur) periods.push(cur);
    return periods;
}

function daysDiff(d1, d2) { return Math.round((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24)); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().split('T')[0]; }
function fmt(n) { return Math.round(n).toLocaleString(); }

run().catch(console.error);
