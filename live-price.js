// =====================================================
// Live Price via Binance WebSocket
// Streams BTCUSDT ticker in real-time. Falls back gracefully
// if WS is blocked (geo, firewall).
// =====================================================

(function () {
    const WS_URL = 'wss://stream.binance.com:9443/ws/btcusdt@ticker';
    const RECONNECT_BASE_MS = 2_000;
    const RECONNECT_MAX_MS = 60_000;
    let socket = null;
    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let lastPrice = null;
    let lastUpdateTs = 0;
    let stalenessCheckTimer = null;

    function $(selector) { return document.querySelector(selector); }

    function setLiveBadge(state) {
        const badge = document.getElementById('liveStatusBadge');
        if (!badge) return;
        badge.dataset.state = state;
        const labels = { live: '🟢 LIVE', stale: '🟡 STALE', offline: '🔴 OFFLINE' };
        badge.textContent = labels[state] || '⚪ INIT';
        badge.title = state === 'live' ? 'Echtzeit-Stream von Binance' :
                      state === 'stale' ? 'Letztes Update > 30s alt' :
                      'WebSocket nicht verbunden — fallback auf 5min Polling';
    }

    function pulseTickerCell(cellId, direction) {
        const el = document.getElementById(cellId);
        if (!el) return;
        el.classList.remove('price-tick-up', 'price-tick-down');
        // Force reflow for animation restart
        void el.offsetWidth;
        el.classList.add(direction === 'up' ? 'price-tick-up' : 'price-tick-down');
    }

    function updateTickerPrice(price, change24h) {
        const priceEl = document.getElementById('btcPrice');
        if (!priceEl) return;
        const direction = lastPrice == null ? null : (price > lastPrice ? 'up' : price < lastPrice ? 'down' : null);
        priceEl.textContent = Math.round(price).toLocaleString('de-DE');
        if (direction) pulseTickerCell('btcPrice', direction);

        const changeEl = document.getElementById('priceChange');
        if (changeEl && Number.isFinite(change24h)) {
            const valueEl = changeEl.querySelector('.change-value');
            if (valueEl) {
                const sign = change24h >= 0 ? '+' : '';
                valueEl.textContent = `${sign}${change24h.toFixed(2)}%`;
                valueEl.className = `change-value ${change24h >= 0 ? 'text-bullish' : 'text-bearish'}`;
            }
        }

        lastPrice = price;
        lastUpdateTs = Date.now();
        setLiveBadge('live');

        // Sync globals so other modules can pick up the live price
        if (typeof window !== 'undefined') {
            window.liveBTCPrice = price;
            window.dispatchEvent(new CustomEvent('btc-live-price', { detail: { price, change24h, ts: lastUpdateTs } }));
        }
    }

    function checkStaleness() {
        if (!lastUpdateTs) return;
        const age = Date.now() - lastUpdateTs;
        if (age > 30_000 && socket && socket.readyState === WebSocket.OPEN) {
            setLiveBadge('stale');
        }
    }

    function scheduleReconnect() {
        if (reconnectTimer) return;
        reconnectAttempts++;
        const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts - 1), RECONNECT_MAX_MS);
        console.warn(`Live price WS reconnect in ${delay}ms (attempt ${reconnectAttempts})`);
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, delay);
    }

    function connect() {
        if (typeof WebSocket === 'undefined') {
            setLiveBadge('offline');
            return;
        }
        try {
            socket = new WebSocket(WS_URL);
        } catch (e) {
            console.error('Live price WS init failed:', e);
            setLiveBadge('offline');
            scheduleReconnect();
            return;
        }

        socket.addEventListener('open', () => {
            console.log('🟢 Binance live price WS connected');
            reconnectAttempts = 0;
            setLiveBadge('live');
        });

        socket.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                // Binance ticker payload: c = lastPrice, P = priceChangePercent
                const price = parseFloat(data.c);
                const change = parseFloat(data.P);
                if (Number.isFinite(price) && price > 0) {
                    updateTickerPrice(price, change);
                }
            } catch (e) {
                console.warn('Live price WS parse error:', e.message);
            }
        });

        socket.addEventListener('close', (e) => {
            console.warn(`Live price WS closed (code=${e.code})`);
            setLiveBadge('offline');
            scheduleReconnect();
        });

        socket.addEventListener('error', (e) => {
            console.warn('Live price WS error', e);
            // close handler will fire and trigger reconnect
        });
    }

    function init() {
        setLiveBadge('offline');
        connect();
        if (stalenessCheckTimer) clearInterval(stalenessCheckTimer);
        stalenessCheckTimer = setInterval(checkStaleness, 5_000);

        // Pause WS when tab is hidden, resume on visible
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (socket) socket.close();
            } else if (!socket || socket.readyState >= WebSocket.CLOSING) {
                reconnectAttempts = 0;
                connect();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
