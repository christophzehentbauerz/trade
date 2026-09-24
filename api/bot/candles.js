import { fetchCandles } from '../../lib/market-data.mjs';

export default async function handler(request, response) {
    if (request.method !== 'GET') return response.status(405).json({ error: 'method_not_allowed' });
    try {
        const candles = await fetchCandles('1h', 1000);
        response.setHeader('Cache-Control', 's-maxage=60');
        response.status(200).json({ candles });
    } catch (error) {
        response.status(502).json({ error: 'candles_unavailable', message: error.message });
    }
}
