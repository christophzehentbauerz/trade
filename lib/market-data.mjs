// Public market data only; no exchange account or API credentials required.
export async function fetchJson(url, { timeout = 30000, ...options } = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
            if (!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            if (attempt || /HTTP (4\d\d)/.test(error.message)) throw error;
        }
    }
}

const requests = new Map();
export async function fetchCandles(interval = '1h', count = 1000) {
    const key = `${interval}:${count}`;
    const existing = requests.get(key);
    if (existing && Date.now() < existing.expiresAt) return existing.promise;
    const entry = { expiresAt: Infinity };
    const promise = loadCandles(interval, count).then(candles => {
        entry.expiresAt = Date.now() + 30000;
        return candles;
    }).catch(error => { if (requests.get(key) === entry) requests.delete(key); throw error; });
    entry.promise = promise;
    requests.set(key, entry);
    return promise;
}

async function loadCandles(interval, count) {
    const durations = { '1h': 3600000, '4h': 14400000, '1d': 86400000 };
    const duration = durations[interval];
    if (!duration || !Number.isInteger(count) || count < 2 || count > 6000) {
        throw new Error('Invalid candle request');
    }
    let candles = [];
    let endTime;
    while (candles.length < count) {
        const query = new URLSearchParams({ symbol: 'BTCUSDT', interval, limit: String(Math.min(1000, count - candles.length)) });
        if (endTime !== undefined) query.set('endTime', String(endTime));
        const endpoint = typeof window === 'undefined' ? 'https://data-api.binance.vision' : 'https://api.binance.com';
        const rows = await fetchJson(`${endpoint}/api/v3/klines?${query}`);
        if (!Array.isArray(rows) || !rows.length) throw new Error('No BTC candles returned');
        const batch = rows.map(c => ({ time: +c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5], closeTime: +c[6] }));
        if (batch.some(c => ![c.time, c.open, c.high, c.low, c.close, c.volume, c.closeTime].every(Number.isFinite) || c.low <= 0 || c.high < c.low || c.close < c.low || c.close > c.high)) {
            throw new Error('Invalid BTC candle data');
        }
        candles = batch.concat(candles);
        endTime = batch[0].time - 1;
    }
    for (let i = 1; i < candles.length; i++) {
        if (candles[i].time - candles[i - 1].time !== duration) throw new Error('BTC candle history has gaps');
    }
    if (Date.now() - candles.at(-1).time > duration * 2 || candles.at(-1).time > Date.now() + 60000) {
        throw new Error('BTC candle history is not current');
    }
    return candles;
}
