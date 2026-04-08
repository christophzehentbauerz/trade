function setCors(response) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function requireFinite(value, label, { positive = false } = {}) {
    if (!Number.isFinite(value) || (positive && value <= 0)) {
        throw new Error(`${label} invalid`);
    }
    return value;
}

export default async function handler(request, response) {
    setCors(response);

    if (request.method === 'OPTIONS') {
        response.status(204).end();
        return;
    }

    if (request.method !== 'GET') {
        response.status(405).json({ error: 'method_not_allowed' });
        return;
    }

    try {
        const [coinRes, historyRes] = await Promise.all([
            fetch('https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false'),
            fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=14&interval=daily')
        ]);

        if (!coinRes.ok) throw new Error(`CoinGecko coin HTTP ${coinRes.status}`);
        if (!historyRes.ok) throw new Error(`CoinGecko history HTTP ${historyRes.status}`);

        const [coin, history] = await Promise.all([coinRes.json(), historyRes.json()]);
        const marketData = coin?.market_data;
        const prices = Array.isArray(history?.prices) ? history.prices : [];
        const volumes = Array.isArray(history?.total_volumes) ? history.total_volumes : [];

        if (prices.length < 10) throw new Error('CoinGecko history too short');

        const payload = {
            price: requireFinite(Number(marketData?.current_price?.usd), 'price', { positive: true }),
            priceChange24h: requireFinite(Number(marketData?.price_change_percentage_24h), 'priceChange24h'),
            marketCap: requireFinite(Number(marketData?.market_cap?.usd), 'marketCap', { positive: true }),
            volume24h: requireFinite(Number(marketData?.total_volume?.usd), 'volume24h', { positive: true }),
            ath: requireFinite(Number(marketData?.ath?.usd), 'ath', { positive: true }),
            athChange: requireFinite(Number(marketData?.ath_change_percentage?.usd), 'athChange'),
            priceTimestamp: coin?.last_updated || marketData?.last_updated || null,
            priceHistoryTimestamp: prices.length ? new Date(prices[prices.length - 1][0]).toISOString() : null,
            priceHistory: prices.map(point => requireFinite(Number(point?.[1]), 'priceHistory point', { positive: true })),
            volumeHistory: volumes.map(point => {
                const value = Number(point?.[1]);
                return Number.isFinite(value) ? value : 0;
            })
        };

        response.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
        response.status(200).json(payload);
    } catch (error) {
        response.status(502).json({
            error: 'market_overview_unavailable',
            message: error?.message || 'CoinGecko market overview unavailable'
        });
    }
}
