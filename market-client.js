// GitHub Pages serves static files; Vercel runs the same public-data handlers.
// Sharing handlers keeps calculations identical on both hosting targets.
(() => {
    const base = new URL('.', document.currentScript.src);
    const routes = new Set(['market/overview', 'binance/derivatives', 'bot/signal', 'bot/backtest', 'bot/candles']);
    const staticHost = location.hostname.endsWith('.github.io') || ['localhost', '127.0.0.1'].includes(location.hostname);
    window.MarketAPI = {
        staticHost,
        async get(route, query = '') {
            if (!routes.has(route)) throw new Error('Unknown market endpoint');
            if (!staticHost) {
                const response = await fetch(`/api/${route}${query ? '?' + query : ''}`, { signal: AbortSignal.timeout(45000), cache: 'no-store' });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
                return data;
            }
            const { default: handler } = await import(new URL(`api/${route}.js`, base));
            let status = 200;
            let payload;
            const response = { setHeader() {}, status(code) { status = code; return this; }, json(data) { payload = data; }, end() {} };
            await handler({ method: 'GET', query: Object.fromEntries(new URLSearchParams(query)) }, response);
            if (status >= 400) throw new Error(payload?.message || `HTTP ${status}`);
            return payload;
        }
    };
})();
