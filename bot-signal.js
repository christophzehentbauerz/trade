// =====================================================
// Bot Live Signal Card + Chart
// Fetches /api/bot/signal and renders the same strategy
// the Telegram bot uses (EMA + RSI + ADX + Fresh Cross)
// =====================================================

const BOT_SIGNAL_URL = '/api/bot/signal';
const BOT_SIGNAL_REFRESH_MS = 60_000; // 1 min — Vercel response is cached for 60s anyway
let botChart = null;
let botCandleSeries = null;
let botEma15Series = null;
let botEma300Series = null;
let botEma800Series = null;
let botSignalRefreshTimer = null;

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
    if (statusEl) statusEl.textContent = `Stand: ${new Date(data.lastCandleTime).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`;
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
    if (botChart && data.tradeLevels) {
        drawBotPriceLevels(data.tradeLevels);
    }
}

function renderBotError(error) {
    const statusEl = document.getElementById('botSignalStatus');
    const labelEl = document.getElementById('botSignalLabel');
    if (statusEl) statusEl.textContent = '⚠️ Bot-Signal nicht verfügbar';
    if (labelEl) labelEl.textContent = error?.message || 'API-Fehler';
}

async function fetchBotSignal() {
    try {
        const res = await fetch(BOT_SIGNAL_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.message || data.error);
        renderBotSignal(data);
    } catch (e) {
        console.error('Bot signal fetch failed:', e);
        renderBotError(e);
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

async function loadBotChartData() {
    ensureBotChart();
    if (!botChart || !botCandleSeries) return;
    try {
        // Use CryptoCompare 1h candles directly — same source as bot
        const res = await fetch('https://min-api.cryptocompare.com/data/v2/histohour?fsym=BTC&tsym=USD&limit=500');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.Response !== 'Success') throw new Error(json.Message);
        const candles = json.Data.Data
            .filter(c => Number.isFinite(c.close))
            .map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }));

        botCandleSeries.setData(candles);

        const closes = candles.map(c => c.close);
        const e15 = calcEMASeries(closes, 15);
        const e300 = calcEMASeries(closes, 300);
        const e800 = calcEMASeries(closes, 500); // use shorter for visualization since we only have 500 bars

        const buildLine = (values) => candles.map((c, i) => values[i] != null ? { time: c.time, value: values[i] } : null).filter(Boolean);
        botEma15Series.setData(buildLine(e15));
        botEma300Series.setData(buildLine(e300));
        botEma800Series.setData(buildLine(e800));

        botChart.timeScale().fitContent();
    } catch (e) {
        console.error('Chart data load failed:', e);
        const container = document.getElementById('botChart');
        if (container) container.innerHTML = `<div class="chart-error">Chart-Daten nicht verfügbar: ${e.message}</div>`;
    }
}

let botPriceLines = [];
function drawBotPriceLevels(levels) {
    if (!botCandleSeries) return;
    // Remove old lines
    botPriceLines.forEach(l => botCandleSeries.removePriceLine(l));
    botPriceLines = [];
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
    if (botSignalRefreshTimer) clearInterval(botSignalRefreshTimer);
    botSignalRefreshTimer = setInterval(() => {
        fetchBotSignal();
    }, BOT_SIGNAL_REFRESH_MS);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startBotSignalUpdates);
} else {
    startBotSignalUpdates();
}
