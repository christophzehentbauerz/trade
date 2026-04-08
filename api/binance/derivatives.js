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
        const [fundingRes, openInterestRes, longShortRes] = await Promise.all([
            fetch('https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1'),
            fetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT'),
            fetch('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1')
        ]);

        if (!fundingRes.ok) throw new Error(`Funding HTTP ${fundingRes.status}`);
        if (!openInterestRes.ok) throw new Error(`Open interest HTTP ${openInterestRes.status}`);
        if (!longShortRes.ok) throw new Error(`Long/Short HTTP ${longShortRes.status}`);

        const [fundingRows, openInterest, longShortRows] = await Promise.all([
            fundingRes.json(),
            openInterestRes.json(),
            longShortRes.json()
        ]);

        if (!Array.isArray(fundingRows) || !fundingRows.length) throw new Error('Funding payload missing');
        if (!Array.isArray(longShortRows) || !longShortRows.length) throw new Error('Long/Short payload missing');

        const latestFunding = fundingRows[0];
        const latestLongShort = longShortRows[0];

        response.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=40');
        response.status(200).json({
            fundingRate: requireFinite(Number(latestFunding?.fundingRate), 'fundingRate'),
            fundingTimestamp: latestFunding?.fundingTime || null,
            openInterestContracts: requireFinite(Number(openInterest?.openInterest), 'openInterestContracts', { positive: true }),
            openInterestTimestamp: openInterest?.time || null,
            longShortRatio: requireFinite(Number(latestLongShort?.longShortRatio), 'longShortRatio', { positive: true }),
            longShortTimestamp: latestLongShort?.timestamp || null
        });
    } catch (error) {
        response.status(502).json({
            error: 'binance_derivatives_unavailable',
            message: error?.message || 'Binance derivatives unavailable'
        });
    }
}
