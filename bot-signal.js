// =====================================================
// Bot Live Signal Card + Chart
// Fetches /api/bot/signal and renders the same strategy
// the Telegram bot uses (EMA + RSI + ADX + Fresh Cross)
// =====================================================

const BOT_SIGNAL_URL = '/api/bot/signal';
const BOT_SIGNAL_REFRESH_MS = 60_000; // 1 min — Vercel response is cached for 60s anyway
const BOT_CHART_REFRESH_MS = 60_000;  // 1 min — refresh OHLC fully every minute
let botChart = null;
let botCandleSeries = null;
let botEma15Series = null;
let botEma300Series = null;
let botEma800Series = null;
let botSignalRefreshTimer = null;
let botChartRefreshTimer = null;
let botLastChartCandle = null; // {time, open, high, low, close}
let botLastChartLoadedAt = 0;
let botSignalLoading = false;
let botChartLoading = false;

const fmtUsd = (v, digits = 0) => {
    if (!Number.isFinite(v)) return '—';
    return '$' + v.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits });
};
const fmtNum = (v, digits = 1) => Number.isFinite(v) ? v.toFixed(digits) : '—';
const fmtPct = (v, digits = 2) => Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%` : '—';

function renderBotSignal(data) {
    const section = document.getElementById('botSignalSection');
    if (!section) return;

    const statusEl = document.getElementById('botSignalStatus');
    const badgeEl = document.getElementById('botSignalBadge');
    const labelEl = document.getElementById('botSignalLabel');
    const checksEl = document.getElementById('botChecksGrid');
    const levelsEl = document.getElementById('botTradeLevels');

    section.dataset.signal = data.signal;
    if (statusEl) {
        const candleTime = new Date(data.lastCandleTime);
        const candleHour = candleTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
        const apiTime = new Date(data.timestamp || Date.now());
        const apiTimeStr = apiTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
        statusEl.textContent = `Letzte 1h-Candle: ${candleHour} · API geprüft ${apiTimeStr}`;
        statusEl.title = `Indikatoren rechnen mit der zuletzt geschlossenen 1h-Candle (${candleHour}). Die Candle die jetzt entsteht zählt erst, wenn sie schließt.`;
    }
    if (badgeEl) {
        badgeEl.textContent = data.signal;
        badgeEl.className = `bot-signal-badge bot-signal-${data.signal.toLowerCase()}`;
    }
    if (labelEl) labelEl.textContent = data.signalLabel;

    const c = data.checks;
    const ind = data.indicators;
    if (checksEl) {
        const items = [
            { label: 'Golden Cross (EMA15>300)', ok: c.goldenCross, value: `${fmtUsd(ind.ema15)} / ${fmtUsd(ind.ema300)}` },
            { label: 'Über EMA800', ok: c.aboveHTF, value: fmtUsd(ind.ema800) },
            { label: 'RSI in Zone (45–70)', ok: c.rsiInZone, value: fmtNum(ind.rsi) },
            { label: 'ADX ≥ 20', ok: c.adxOk, value: fmtNum(ind.adx) },
            { label: 'Fresh Cross diese Stunde', ok: c.freshCross, value: c.freshCross ? 'JA' : (c.trendUp ? 'Schon im Trend' : 'Nein') }
        ];
        checksEl.innerHTML = items.map(i => `
            <div class="bot-check-item ${i.ok ? 'ok' : 'pending'}">
                <span class="bot-check-icon">${i.ok ? '✅' : '⏳'}</span>
                <span class="bot-check-label">${i.label}</span>
                <span class="bot-check-value">${i.value}</span>
            </div>
        `).join('');
    }

    if (levelsEl) {
        if (data.tradeLevels) {
            const t = data.tradeLevels;
            levelsEl.style.display = '';
            levelsEl.innerHTML = `
                <div class="bot-level entry">
                    <div class="bot-level-label">📍 Entry</div>
                    <div class="bot-level-value">${fmtUsd(t.entry)}</div>
                </div>
                <div class="bot-level sl">
                    <div class="bot-level-label">🛑 Stop Loss</div>
                    <div class="bot-level-value">${fmtUsd(t.stopLoss)}</div>
                    <div class="bot-level-pct">${fmtPct(t.stopLossPct)}</div>
                </div>
                <div class="bot-level tp">
                    <div class="bot-level-label">🎯 TP1 (1.5R)</div>
                    <div class="bot-level-value">${fmtUsd(t.tp1)}</div>
                    <div class="bot-level-pct">RR ${fmtNum(t.rr1, 2)}:1</div>
                </div>
                <div class="bot-level tp">
                    <div class="bot-level-label">🎯 TP2 (2.5R)</div>
                    <div class="bot-level-value">${fmtUsd(t.tp2)}</div>
                    <div class="bot-level-pct">RR ${fmtNum(t.rr2, 2)}:1</div>
                </div>
                <div class="bot-level tp">
                    <div class="bot-level-label">🎯 TP3 (4R)</div>
                    <div class="bot-level-value">${fmtUsd(t.tp3)}</div>
                    <div class="bot-level-pct">RR ${fmtNum(t.rr3, 2)}:1</div>
                </div>
            `;
        } else {
            levelsEl.style.display = 'none';
        }
    }

    // Chart: draw price line on entry/SL/TP
    if (botChart) drawBotPriceLevels(data.tradeLevels);
}

function renderBotError(error) {
    const statusEl = document.getElementById('botSignalStatus');
    const labelEl = document.getElementById('botSignalLabel');
    if (statusEl) statusEl.textContent = '⚠️ Bot-Signal nicht verfügbar';
    if (labelEl) labelEl.textContent = error?.message || 'API-Fehler';
    const badge = document.getElementById('botSignalBadge');
    if (badge) { badge.textContent = 'DATEN FEHLEN'; badge.className = 'bot-signal-badge'; }
    const levels = document.getElementById('botTradeLevels');
    if (levels) levels.style.display = 'none';
    const checks = document.getElementById('botChecksGrid');
    if (checks) checks.replaceChildren();
    document.getElementById('botSignalSection')?.setAttribute('data-signal', 'unavailable');
    drawBotPriceLevels(null);
}

async function fetchBotSignal() {
    if (botSignalLoading) return;
    botSignalLoading = true;
    try {
        const data = await window.MarketAPI.get('bot/signal');
        if (data.error) throw new Error(data.message || data.error);
        renderBotSignal(data);
    } catch (e) {
        console.error('Bot signal fetch failed:', e);
        renderBotError(e);
    } finally {
        botSignalLoading = false;
    }
}

// ─── Chart (TradingView Lightweight Charts) ───
function ensureBotChart() {
    if (botChart || typeof LightweightCharts === 'undefined') return;
    const container = document.getElementById('botChart');
    if (!container) return;

    botChart = LightweightCharts.createChart(container, {
        autoSize: true,
        layout: { background: { color: 'transparent' }, textColor: '#9ca3af', fontFamily: 'Inter, sans-serif' },
        grid: { vertLines: { color: 'rgba(148, 163, 184, 0.08)' }, horzLines: { color: 'rgba(148, 163, 184, 0.08)' } },
        timeScale: { timeVisible: true, borderColor: 'rgba(148, 163, 184, 0.2)' },
        rightPriceScale: { borderColor: 'rgba(148, 163, 184, 0.2)' },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal }
    });

    botCandleSeries = botChart.addCandlestickSeries({
        upColor: '#10b981', downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981', wickDownColor: '#ef4444'
    });

    botEma15Series = botChart.addLineSeries({ color: '#fbbf24', lineWidth: 1, title: 'EMA15' });
    botEma300Series = botChart.addLineSeries({ color: '#3b82f6', lineWidth: 1, title: 'EMA300' });
    botEma800Series = botChart.addLineSeries({ color: '#8b5cf6', lineWidth: 2, title: 'EMA800' });
}

function calcEMASeries(closes, period) {
    if (closes.length < period) return [];
    const k = 2 / (period + 1);
    const out = new Array(closes.length).fill(null);
    let e = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    out[period - 1] = e;
    for (let i = period; i < closes.length; i++) {
        e = closes[i] * k + e * (1 - k);
        out[i] = e;
    }
    return out;
}

async function loadBotChartData(isRefresh = false) {
    ensureBotChart();
    if (!botChart || !botCandleSeries) return;
    if (botChartLoading) return;
    botChartLoading = true;
    try {
        // Same BTCUSDT candle source as the strategy; share in-flight requests.
        const json = await window.MarketAPI.get('bot/candles');
        const candles = json.candles
            .filter(c => Number.isFinite(c.close))
            .map(c => ({ time: c.time / 1000, open: c.open, high: c.high, low: c.low, close: c.close }));

        botCandleSeries.setData(candles);

        const closes = candles.map(c => c.close);
        const e15 = calcEMASeries(closes, 15);
        const e300 = calcEMASeries(closes, 300);
        const e800 = calcEMASeries(closes, 800);

        const buildLine = (values) => candles.map((c, i) => values[i] != null ? { time: c.time, value: values[i] } : null).filter(Boolean);
        botEma15Series.setData(buildLine(e15));
        botEma300Series.setData(buildLine(e300));
        botEma800Series.setData(buildLine(e800));

        if (!isRefresh) botChart.timeScale().fitContent();

        botLastChartCandle = candles.length ? { ...candles[candles.length - 1] } : null;
        botLastChartLoadedAt = Date.now();
        renderChartFreshness();
    } catch (e) {
        console.error('Chart data load failed:', e);
        const status = document.getElementById('botChartFreshness');
        if (status) status.textContent = `Chart-Aktualisierung fehlgeschlagen: ${e.message}. Nächster Versuch in einer Minute.`;
        // Preserve the canvas so a later successful request can render again.
    } finally {
        botChartLoading = false;
    }
}

function renderChartFreshness() {
    const el = document.getElementById('botChartFreshness');
    if (!el || !botLastChartLoadedAt) return;
    const t = new Date(botLastChartLoadedAt);
    const time = t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    el.textContent = `1h-Candles: zuletzt geladen ${time} · Live-Preis tickt sekündlich`;
    el.title = 'Die letzte Candle im Chart formt sich gerade — ihr Schluss-Preis wird live über den Binance WebSocket aktualisiert. Vollständiger Reload alle 60 Sekunden.';
}

// Live price (Binance WS) → update the forming candle's close in real-time
function attachLivePriceUpdates() {
    window.addEventListener('btc-live-price', (e) => {
        if (!botCandleSeries || !botLastChartCandle) return;
        const livePrice = e?.detail?.price;
        if (!Number.isFinite(livePrice) || livePrice <= 0) return;

        const nowSec = Math.floor(Date.now() / 1000);
        const currentHourBucket = Math.floor(nowSec / 3600) * 3600;

        if (currentHourBucket > botLastChartCandle.time) {
            // New hour started — fetch a fresh full set instead of guessing OHLC
            loadBotChartData(true);
            return;
        }

        // Update the still-forming candle in place
        const c = botLastChartCandle;
        c.close = livePrice;
        if (livePrice > c.high) c.high = livePrice;
        if (livePrice < c.low) c.low = livePrice;
        botCandleSeries.update({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close
        });
    });
}

let botPriceLines = [];
function drawBotPriceLevels(levels) {
    if (!botCandleSeries) return;
    // Remove old lines
    botPriceLines.forEach(l => botCandleSeries.removePriceLine(l));
    botPriceLines = [];
    if (!levels) return;
    const add = (price, color, title) => {
        if (!Number.isFinite(price)) return;
        botPriceLines.push(botCandleSeries.createPriceLine({
            price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title
        }));
    };
    add(levels.entry, '#60a5fa', 'Entry');
    add(levels.stopLoss, '#ef4444', 'SL');
    add(levels.tp1, '#10b981', 'TP1');
    add(levels.tp2, '#10b981', 'TP2');
    add(levels.tp3, '#10b981', 'TP3');
}

function startBotSignalUpdates() {
    fetchBotSignal();
    loadBotChartData();
    attachLivePriceUpdates();

    if (botSignalRefreshTimer) clearInterval(botSignalRefreshTimer);
    botSignalRefreshTimer = setInterval(() => {
        fetchBotSignal();
    }, BOT_SIGNAL_REFRESH_MS);

    if (botChartRefreshTimer) clearInterval(botChartRefreshTimer);
    botChartRefreshTimer = setInterval(() => {
        loadBotChartData(true);
    }, BOT_CHART_REFRESH_MS);

    // Also refresh whenever the tab becomes visible again
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            fetchBotSignal();
            loadBotChartData(true);
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startBotSignalUpdates);
} else {
    startBotSignalUpdates();
}
