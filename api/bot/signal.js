// =====================================================
// /api/bot/signal — Live signal using the same strategy
// as the Telegram bot (EMA15>EMA300, price>EMA800,
// RSI 45-70, ADX>=20, fresh cross).
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
    skipSundayEntries: true // backtest: PF 1.70 → 2.14
};

// ─── Indicators (mirror of telegram-bot/bot.js) ───
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

function rsi(closes, period = 14) {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const d = closes[i] - closes[i - 1];
        if (d > 0) gains += d; else losses -= d;
    }
    let ag = gains / period, al = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
        const d = closes[i] - closes[i - 1];
        if (d > 0) { ag = (ag * (period - 1) + d) / period; al = al * (period - 1) / period; }
        else { ag = ag * (period - 1) / period; al = (al * (period - 1) - d) / period; }
    }
    return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

function atr(candles, period = 14) {
    if (candles.length < period + 1) return 0;
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const k = 2 / (period + 1);
    let a = trs.slice(0, period).reduce((x, y) => x + y, 0) / period;
    for (let i = period; i < trs.length; i++) a = trs[i] * k + a * (1 - k);
    return a;
}

function adx(candles, period = 14) {
    const n = candles.length;
    if (n < period * 2 + 2) return NaN;
    const plusDM = [], minusDM = [], tr = [];
    for (let i = 1; i < n; i++) {
        const up = candles[i].high - candles[i - 1].high;
        const dn = candles[i - 1].low - candles[i].low;
        plusDM.push((up > dn && up > 0) ? up : 0);
        minusDM.push((dn > up && dn > 0) ? dn : 0);
        const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
        tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    let smTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
    let smP = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
    let smM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
    const dxArr = [];
    for (let i = period; i < tr.length; i++) {
        smTR = smTR - smTR / period + tr[i];
        smP = smP - smP / period + plusDM[i];
        smM = smM - smM / period + minusDM[i];
        const pDI = smTR ? 100 * smP / smTR : 0;
        const mDI = smTR ? 100 * smM / smTR : 0;
        const sum = pDI + mDI;
        dxArr.push(sum ? 100 * Math.abs(pDI - mDI) / sum : 0);
    }
    if (dxArr.length < period) return NaN;
    let v = dxArr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dxArr.length; i++) v = (v * (period - 1) + dxArr[i]) / period;
    return v;
}

// ─── Data fetching ───
async function fetchCandles1h() {
    try {
        const res = await fetch('https://min-api.cryptocompare.com/data/v2/histohour?fsym=BTC&tsym=USD&limit=2000');
        if (!res.ok) throw new Error(`CryptoCompare HTTP ${res.status}`);
        const data = await res.json();
        if (data.Response !== 'Success') throw new Error(data.Message || 'CryptoCompare error');
        return data.Data.Data.map(c => ({ time: c.time * 1000, open: c.open, high: c.high, low: c.low, close: c.close }));
    } catch (e) {
        // Fallback: Binance (may 451 from US IPs but Vercel is global)
        const res = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=1000');
        if (!res.ok) throw new Error(`Binance HTTP ${res.status}: ${e.message}`);
        const data = await res.json();
        return data.map(c => ({ time: c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4] }));
    }
}

// ─── Handler ───
export default async function handler(request, response) {
    setCors(response);
    if (request.method === 'OPTIONS') { response.status(204).end(); return; }
    if (request.method !== 'GET') { response.status(405).json({ error: 'method_not_allowed' }); return; }

    try {
        const allCandles = await fetchCandles1h();
        // Drop the still-forming candle
        const candles = allCandles.length > 1 ? allCandles.slice(0, -1) : allCandles;

        if (candles.length < STRAT.emaHTF + 50) {
            throw new Error(`Insufficient candles: ${candles.length}`);
        }

        const closes = candles.map(c => c.close);
        const last = candles[candles.length - 1];
        const prev = candles[candles.length - 2];

        // Current state
        const e15 = ema(closes, STRAT.emaFast);
        const e300 = ema(closes, STRAT.emaSlow);
        const e800 = ema(closes, STRAT.emaHTF);
        const i = closes.length - 1;
        const j = i - 1;

        const trendUp = e15[i] > e300[i] && last.close > e800[i];
        const trendUpPrev = e15[j] > e300[j] && prev.close > e800[j];
        const freshCross = !trendUpPrev && trendUp;

        const r = rsi(closes, STRAT.rsiPeriod);
        const rsiInZone = r >= STRAT.rsiMin && r <= STRAT.rsiMax;

        const a = atr(candles, STRAT.atrPeriod);
        const adxValue = adx(candles, STRAT.adxPeriod);
        const adxOk = Number.isFinite(adxValue) && adxValue >= STRAT.adxThreshold;
        const isSundayUTC = new Date().getUTCDay() === 0;
        const sundayBlock = STRAT.skipSundayEntries && isSundayUTC;

        // Signal classification
        let signal = 'NEUTRAL';
        let signalLabel = 'Abwarten';
        if (freshCross && rsiInZone && adxOk && !sundayBlock) {
            signal = 'LONG';
            signalLabel = 'Long Entry (Fresh Cross + ADX bestätigt)';
        } else if (freshCross && rsiInZone && adxOk && sundayBlock) {
            signal = 'WATCH';
            signalLabel = 'Setup vorhanden, aber Sonntag-Block aktiv (dünne Liquidität, schlechte historische Performance)';
        } else if (trendUp && rsiInZone && adxOk) {
            signal = 'WATCH';
            signalLabel = 'Trend bestätigt, aber kein frischer Cross — warten auf nächste Setup-Gelegenheit';
        } else if (trendUp && !rsiInZone) {
            signal = 'WATCH';
            signalLabel = 'Trend bestätigt, RSI außerhalb der Zone';
        } else if (trendUp && !adxOk) {
            signal = 'WATCH';
            signalLabel = `Trend bestätigt, aber ADX zu niedrig (${adxValue.toFixed(1)} < ${STRAT.adxThreshold})`;
        } else {
            signalLabel = e15[i] < e300[i] ? 'Death Cross — kein Long' : 'Trend nicht bestätigt';
        }

        // Trade levels
        const stopLoss = last.close - a * STRAT.atrMultiplier;
        const risk = last.close - stopLoss;
        const tp1 = last.close + risk * 1.5;
        const tp2 = last.close + risk * 2.5;
        const tp3 = last.close + risk * 4.0;

        response.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
        response.status(200).json({
            timestamp: new Date().toISOString(),
            lastCandleTime: new Date(last.time).toISOString(),
            price: last.close,
            signal,
            signalLabel,
            indicators: {
                ema15: e15[i],
                ema300: e300[i],
                ema800: e800[i],
                rsi: r,
                atr: a,
                adx: adxValue
            },
            checks: {
                trendUp,
                trendUpPrev,
                freshCross,
                rsiInZone,
                adxOk,
                aboveHTF: last.close > e800[i],
                goldenCross: e15[i] > e300[i],
                sundayBlock,
                weekdayUTC: new Date().toLocaleDateString('de-DE', { weekday: 'long', timeZone: 'UTC' })
            },
            tradeLevels: signal === 'LONG' || signal === 'WATCH' ? {
                entry: last.close,
                stopLoss,
                stopLossPct: ((stopLoss - last.close) / last.close) * 100,
                tp1, tp2, tp3,
                rr1: (tp1 - last.close) / risk,
                rr2: (tp2 - last.close) / risk,
                rr3: (tp3 - last.close) / risk
            } : null,
            strategy: {
                name: 'EMA15/300/800 + RSI 45-70 + ADX≥20 (Fresh Cross)',
                backtested: { trades: 68, winRate: null, returnPct: 38, profitFactor: 1.94, maxDDPct: -8 }
            }
        });
    } catch (error) {
        response.status(502).json({
            error: 'bot_signal_unavailable',
            message: error?.message || 'Failed to compute bot signal'
        });
    }
}
