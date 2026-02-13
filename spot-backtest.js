/**
 * Smart Accumulator v2 - Extended Historical Backtest
 * Fetches ALL available BTC daily data from Binance (~2017-2026)
 */

const https = require('https');

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function calculateRSI(data, period) {
    if (data.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = data[i] - data[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
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

function calculateSMA(data, period) {
    if (data.length < period) return 0;
    const slice = data.slice(data.length - period);
    return slice.reduce((a, b) => a + b, 0) / period;
}

async function fetchAllCandles() {
    console.log('📊 Fetching ALL BTC daily data from Binance...\n');

    let all = [];
    let startTime = new Date('2017-01-01').getTime();
    const endTime = Date.now();

    while (startTime < endTime) {
        const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000&startTime=${startTime}`;
        const raw = await fetchJSON(url);
        if (!raw.length) break;

        const candles = raw.map(c => ({
            date: new Date(c[0]).toISOString().split('T')[0],
            ts: c[0],
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4])
        }));

        all = all.concat(candles);
        startTime = raw[raw.length - 1][0] + 86400000; // Next day
        process.stdout.write(`  ✅ ${all.length} candles loaded (until ${candles[candles.length - 1].date})\r`);

        // Rate limit
        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`\n\n✅ Total: ${all.length} candles (${all[0].date} → ${all[all.length - 1].date})\n`);
    return all;
}

async function run() {
    const candles = await fetchAllCandles();

    const startIdx = 210;
    const buySignals = [];
    const sellSignals = [];
    const allResults = [];

    for (let i = startIdx; i < candles.length; i++) {
        const closes = candles.slice(0, i + 1).map(c => c.close);
        const highs = candles.slice(0, i + 1).map(c => c.high);
        const price = closes[closes.length - 1];
        const date = candles[i].date;

        const sma200 = calculateSMA(closes, 200);
        const rsiDaily = calculateRSI(closes, 14);

        const weeklies = [];
        for (let w = 6; w < closes.length; w += 7) weeklies.push(closes[w]);
        const rsiWeekly = weeklies.length > 15 ? calculateRSI(weeklies, 14) : 50;

        const ath = Math.max(...highs);
        const athDown = ((ath - price) / ath) * 100;
        const fearGreed = 50; // Default

        // BUY SCORE
        let buyScore = 0;
        const smaRatio = price / sma200;
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

        if (fearGreed < 15) buyScore += 20;
        else if (fearGreed < 25) buyScore += 15;
        else if (fearGreed < 40) buyScore += 8;
        else if (fearGreed < 55) buyScore += 3;
        else if (fearGreed >= 75) buyScore -= 5;

        if (athDown > 60) buyScore += 10;
        else if (athDown > 40) buyScore += 8;
        else if (athDown > 25) buyScore += 5;
        else if (athDown > 15) buyScore += 2;

        if (rsiWeekly < 35) buyScore += 10;
        else if (rsiWeekly < 45) buyScore += 7;
        else if (rsiWeekly < 55) buyScore += 3;
        else if (rsiWeekly > 80) buyScore -= 5;

        buyScore = Math.max(0, Math.min(100, buyScore));

        // SELL SCORE
        let sellScore = 0;
        if (smaRatio > 1.5) sellScore += 30;
        else if (smaRatio > 1.3) sellScore += 15;
        if (rsiDaily > 80) sellScore += 25;
        else if (rsiDaily > 70) sellScore += 15;
        if (fearGreed > 80) sellScore += 20;
        else if (fearGreed > 70) sellScore += 10;
        if (rsiWeekly > 80) sellScore += 15;
        else if (rsiWeekly > 70) sellScore += 10;
        if (athDown < 5) sellScore += 10;
        sellScore = Math.max(0, Math.min(100, sellScore));

        let zone;
        if (sellScore >= 60) zone = '🔴 EUPHORIA';
        else if (sellScore >= 35) zone = '⚠️ EXPENSIVE';
        else if (buyScore >= 75) zone = '🔥 FIRE SALE';
        else if (buyScore >= 50) zone = '🟢 ACCUMULATION';
        else if (buyScore >= 25) zone = '⚖️ FAIR VALUE';
        else zone = '⚠️ EXPENSIVE';

        allResults.push({ date, price, buyScore, sellScore, zone, rsiDaily, rsiWeekly, smaRatio, athDown });

        if (buyScore >= 50) buySignals.push({ date, price, buyScore, zone, rsiDaily, athDown });
        if (sellScore >= 35) sellSignals.push({ date, price, sellScore, zone, rsiDaily, smaRatio });
    }

    // ═══ SELL SIGNALS ═══
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('🔴 SELL SIGNALS (Score >= 35) - Wann hätte man Gewinne mitnehmen sollen?');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    let sellPeriods = groupPeriods(sellSignals, 'sellScore', 'price');
    for (const p of sellPeriods) {
        const dur = daysDiff(p.start, p.end);
        // Find price 3 months later
        const laterIdx = allResults.findIndex(r => r.date >= addDays(p.end, 90));
        const laterPrice = laterIdx >= 0 ? allResults[laterIdx].price : null;
        const drawdown = laterPrice ? ((laterPrice - p.maxPrice) / p.maxPrice * 100).toFixed(1) : '?';

        console.log(`  ${p.zone}  ${p.start} → ${p.end} (${dur > 0 ? dur + 'T' : '1T'}) | Peak: $${fmt(p.maxPrice)} | Score: ${p.maxScore}`);
        if (laterPrice) {
            const emoji = drawdown < -10 ? '✅ Richtig!' : drawdown > 10 ? '❌ Zu früh' : '⚖️ OK';
            console.log(`     → 3 Monate später: $${fmt(laterPrice)} (${drawdown > 0 ? '+' : ''}${drawdown}%) ${emoji}`);
        }
        console.log('');
    }

    // ═══ BUY SIGNALS ═══
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('🟢 BUY SIGNALS (Score >= 50) - Wann wären die besten Käufe gewesen?');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    let buyPeriods = groupPeriods(buySignals, 'buyScore', 'price');
    const curPrice = candles[candles.length - 1].close;

    for (const p of buyPeriods) {
        const dur = daysDiff(p.start, p.end);
        const ret = ((curPrice - p.bestPrice) / p.bestPrice * 100).toFixed(1);

        // Find price 6 months later
        const laterIdx = allResults.findIndex(r => r.date >= addDays(p.start, 180));
        const laterPrice = laterIdx >= 0 ? allResults[laterIdx].price : null;
        const ret6m = laterPrice ? ((laterPrice - p.bestPrice) / p.bestPrice * 100).toFixed(1) : '?';

        console.log(`  ${p.zone}  ${p.start} → ${p.end} (${dur > 0 ? dur + 'T' : '1T'}) | Buy: $${fmt(p.bestPrice)} | Score: ${p.maxScore}`);
        const retEmoji = ret > 50 ? '🚀' : ret > 0 ? '✅' : '❌';
        console.log(`     → Heute ($${fmt(curPrice)}): ${ret > 0 ? '+' : ''}${ret}% ${retEmoji}`);
        if (laterPrice) {
            const ret6mEmoji = ret6m > 30 ? '🚀' : ret6m > 0 ? '✅' : '❌';
            console.log(`     → 6M Return: ${ret6m > 0 ? '+' : ''}${ret6m}% ${ret6mEmoji}`);
        }
        console.log('');
    }

    // ═══ STATISTICS ═══
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('📊 STATISTIK');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    // Buy signal accuracy
    let buyWins = 0, buyTotal = 0;
    for (const p of buyPeriods) {
        const laterIdx = allResults.findIndex(r => r.date >= addDays(p.start, 180));
        if (laterIdx >= 0) {
            buyTotal++;
            if (allResults[laterIdx].price > p.bestPrice) buyWins++;
        }
    }
    console.log(`  Buy Signale gesamt: ${buyPeriods.length}`);
    console.log(`  Davon profitabel nach 6M: ${buyWins}/${buyTotal} (${buyTotal > 0 ? Math.round(buyWins / buyTotal * 100) : 0}%)\n`);

    // Sell signal accuracy
    let sellWins = 0, sellTotal = 0;
    for (const p of sellPeriods) {
        const laterIdx = allResults.findIndex(r => r.date >= addDays(p.end, 90));
        if (laterIdx >= 0) {
            sellTotal++;
            if (allResults[laterIdx].price < p.maxPrice) sellWins++;
        }
    }
    console.log(`  Sell Signale gesamt: ${sellPeriods.length}`);
    console.log(`  Davon korrekt (Preis fiel danach): ${sellWins}/${sellTotal} (${sellTotal > 0 ? Math.round(sellWins / sellTotal * 100) : 0}%)\n`);

    // Fire Sale accuracy
    const fireSales = buyPeriods.filter(p => p.maxScore >= 75);
    let fsWins = 0, fsTotal = 0;
    for (const p of fireSales) {
        const laterIdx = allResults.findIndex(r => r.date >= addDays(p.start, 365));
        if (laterIdx >= 0) {
            fsTotal++;
            if (allResults[laterIdx].price > p.bestPrice * 1.3) fsWins++; // 30%+ return
        }
    }
    console.log(`  🔥 FIRE SALE Signale: ${fireSales.length}`);
    console.log(`  Davon 30%+ Return nach 1 Jahr: ${fsWins}/${fsTotal} (${fsTotal > 0 ? Math.round(fsWins / fsTotal * 100) : 0}%)\n`);

    // Current status
    const last = allResults[allResults.length - 1];
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('📍 AKTUELL');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');
    console.log(`  ${last.date} | $${fmt(last.price)} | Buy: ${last.buyScore} | Sell: ${last.sellScore} | ${last.zone}`);
    console.log(`  RSI D: ${last.rsiDaily.toFixed(1)} | RSI W: ${last.rsiWeekly.toFixed(1)} | SMA-Ratio: ${last.smaRatio.toFixed(2)} | ATH: -${last.athDown.toFixed(1)}%`);
    console.log(`\n  ℹ️ Fear & Greed wurde überall als 50 angenommen.`);
    console.log(`  Real wären Buy-Scores in Panik +10-20pts höher, Sell-Scores in Gier +10-20pts höher.\n`);
}

function groupPeriods(signals, scoreKey, priceKey) {
    let periods = [];
    let cur = null;
    for (const s of signals) {
        if (!cur || daysDiff(cur.end, s.date) > 7) {
            if (cur) periods.push(cur);
            cur = { start: s.date, end: s.date, maxScore: s[scoreKey], maxPrice: s.price, bestPrice: s.price, zone: s.zone, count: 1 };
        } else {
            cur.end = s.date;
            cur.count++;
            if (s[scoreKey] > cur.maxScore) {
                cur.maxScore = s[scoreKey];
                cur.zone = s.zone;
            }
            if (s.price > cur.maxPrice) cur.maxPrice = s.price;
            if (s.price < cur.bestPrice) cur.bestPrice = s.price;
        }
    }
    if (cur) periods.push(cur);
    return periods;
}

function daysDiff(d1, d2) {
    return Math.round((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24));
}

function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

function fmt(n) {
    return Math.round(n).toLocaleString();
}

run().catch(console.error);
