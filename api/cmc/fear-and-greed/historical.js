export default async function handler(request, response) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        response.status(204).end();
        return;
    }

    if (request.method !== 'GET') {
        response.status(405).json({ error: 'method_not_allowed' });
        return;
    }

    const apiKey = process.env.CMC_API_KEY;
    if (!apiKey) {
        response.status(500).json({
            error: 'missing_api_key',
            message: 'CMC_API_KEY ist in Vercel nicht gesetzt.'
        });
        return;
    }

    const rawLimit = Array.isArray(request.query.limit) ? request.query.limit[0] : request.query.limit;
    const limit = Number.parseInt(rawLimit || '8', 10);
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 8;

    try {
        const upstream = await fetch(`https://pro-api.coinmarketcap.com/v3/fear-and-greed/historical?limit=${safeLimit}`, {
            headers: {
                Accept: 'application/json',
                'X-CMC_PRO_API_KEY': apiKey
            }
        });

        const text = await upstream.text();
        response.status(upstream.status);
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.send(text);
    } catch (error) {
        response.status(502).json({
            error: 'cmc_unreachable',
            message: error?.message || 'CoinMarketCap konnte nicht erreicht werden.'
        });
    }
}
