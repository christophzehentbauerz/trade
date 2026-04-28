// =====================================================
// Bot Trade Journal — Replays bot strategy on history
// and renders the resulting trades + stats.
// =====================================================

const BACKTEST_URL = '/api/bot/backtest?days=90';
const TRADES_REFRESH_MS = 5 * 60 * 1000; // Re-replay every 5 min
let tradesRefreshTimer = null;
let openPositionState = null; // for live PnL updates

const fmtUSD = v => Number.isFinite(v) ? '$' + Math.round(v).toLocaleString('de-DE') : '—';
const fmtPct = (v, digits = 2) => Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%` : '—';
const fmtPF = v => Number.isFinite(v) ? v.toFixed(2) : '∞';

function fullDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleString('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Berlin'
    });
}

function shortDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Berlin'
    });
}

function relativeDate(iso) {
    const d = new Date(iso);
    const ms = Date.now() - d.getTime();
    const mins = Math.round(ms / 60000);
    const hrs = Math.round(ms / 3600000);
    const days = Math.round(ms / 86400000);
    if (mins < 60) return `vor ${mins} Min`;
    if (hrs < 24) return `vor ${hrs}h`;
    if (days === 1) return 'gestern';
    if (days < 30) return `vor ${days} Tagen`;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function reasonLabel(reason) {
    return ({
        TRAILING_STOP: '📉 Trailing Stop',
        DEATH_CROSS: '💀 Death Cross',
        TIME_STOP: '⏰ Time Stop',
        END_OF_DATA: '⏸ End of Data'
    })[reason] || reason;
}

function reasonExplain(reason) {
    return ({
        TRAILING_STOP: 'Stop wurde nachgezogen und ausgelöst',
        DEATH_CROSS: 'EMA15 fiel unter EMA300 (Bot exited)',
        TIME_STOP: 'Trade lief 72h ohne 0,5% Profit → Geschlossen',
        END_OF_DATA: 'Trade noch nicht beendet (Backtest-Ende)'
    })[reason] || '';
}

function renderStats(stats) {
    const el = document.getElementById('botTradeStats');
    if (!el || !stats || !stats.trades) return;
    el.innerHTML = `
        <div class="bt-stat"><div class="bt-stat-label">Trades</div><div class="bt-stat-value">${stats.trades}</div></div>
        <div class="bt-stat"><div class="bt-stat-label">Win Rate</div><div class="bt-stat-value">${stats.winRate.toFixed(0)}%</div></div>
        <div class="bt-stat"><div class="bt-stat-label">Return</div><div class="bt-stat-value ${stats.totalReturn >= 0 ? 'pos' : 'neg'}">${fmtPct(stats.totalReturn, 1)}</div></div>
        <div class="bt-stat"><div class="bt-stat-label">Profit Factor</div><div class="bt-stat-value">${fmtPF(stats.profitFactor)}</div></div>
        <div class="bt-stat"><div class="bt-stat-label">Max DD</div><div class="bt-stat-value neg">${fmtPct(-stats.maxDrawdown, 1)}</div></div>
        <div class="bt-stat"><div class="bt-stat-label">Best</div><div class="bt-stat-value pos">${fmtPct(stats.bestTrade, 1)}</div></div>
        <div class="bt-stat"><div class="bt-stat-label">Worst</div><div class="bt-stat-value neg">${fmtPct(stats.worstTrade, 1)}</div></div>
    `;
}

function renderLastTriggerHero(trades, openPosition) {
    const el = document.getElementById('botLastTrigger');
    if (!el) return;

    // Determine the most recent event: open position OR latest closed trade
    if (openPosition) {
        const livePrice = window.liveBTCPrice || openPosition.entryPrice;
        const livePnL = ((livePrice - openPosition.entryPrice) / openPosition.entryPrice) * 100;
        const pnlClass = livePnL > 0 ? 'pos' : 'neg';
        el.dataset.state = 'open';
        el.innerHTML = `
            <div class="lt-row">
                <div class="lt-status">
                    <span class="lt-badge open">📍 OFFEN seit ${openPosition.barsHeld}h</span>
                    <div class="lt-when">Eingestiegen: <strong>${fullDateTime(openPosition.entryTime)}</strong> <span class="lt-rel">(${relativeDate(openPosition.entryTime)})</span></div>
                </div>
                <div class="lt-pnl">
                    <div class="lt-pnl-label">Aktueller P/L (Live)</div>
                    <div class="lt-pnl-value ${pnlClass}" id="botLivePnL">${fmtPct(livePnL, 2)}</div>
                </div>
            </div>
            <div class="lt-detail-grid">
                <div class="lt-cell"><span class="lt-cell-label">Einstieg</span><span class="lt-cell-value">${fmtUSD(openPosition.entryPrice)}</span></div>
                <div class="lt-cell"><span class="lt-cell-label">Live-Preis</span><span class="lt-cell-value" id="botLivePrice">${fmtUSD(livePrice)}</span></div>
                <div class="lt-cell"><span class="lt-cell-label">Stop Loss</span><span class="lt-cell-value">${fmtUSD(openPosition.stop)}</span></div>
                <div class="lt-cell"><span class="lt-cell-label">Hoch bisher</span><span class="lt-cell-value">${fmtUSD(openPosition.highestPrice)}</span></div>
            </div>
        `;
        return;
    }

    if (trades && trades.length) {
        const last = trades[0]; // already reversed in API → newest first
        const won = last.pnlPct > 0;
        const cls = won ? 'win' : 'loss';
        el.dataset.state = cls;
        el.innerHTML = `
            <div class="lt-row">
                <div class="lt-status">
                    <span class="lt-badge ${cls}">${won ? '✅ Gewonnen' : '❌ Verloren'}</span>
                    <div class="lt-when">Letzter Trade: <strong>${fullDateTime(last.entryTime)}</strong> <span class="lt-rel">(${relativeDate(last.entryTime)})</span></div>
                </div>
                <div class="lt-pnl">
                    <div class="lt-pnl-label">Ergebnis</div>
                    <div class="lt-pnl-value ${won ? 'pos' : 'neg'}">${fmtPct(last.pnlPct, 2)}</div>
                </div>
            </div>
            <div class="lt-detail-grid">
                <div class="lt-cell"><span class="lt-cell-label">Einstieg</span><span class="lt-cell-value">${fmtUSD(last.entryPrice)}</span></div>
                <div class="lt-cell"><span class="lt-cell-label">Ausstieg</span><span class="lt-cell-value">${fmtUSD(last.exitPrice)}</span></div>
                <div class="lt-cell"><span class="lt-cell-label">Dauer</span><span class="lt-cell-value">${last.barsHeld}h</span></div>
                <div class="lt-cell"><span class="lt-cell-label">Grund</span><span class="lt-cell-value lt-reason">${reasonLabel(last.exitReason)}</span></div>
            </div>
            <div class="lt-explain">${reasonExplain(last.exitReason)} · Beendet: ${shortDateTime(last.exitTime)}</div>
        `;
        return;
    }

    el.dataset.state = 'none';
    el.innerHTML = `
        <div class="lt-empty">
            <strong>Noch kein Trigger in den letzten 90 Tagen.</strong>
            <div>Der Bot wartet auf das nächste saubere Setup (Fresh Cross + ADX≥20 + RSI in Zone).</div>
        </div>
    `;
}

function renderTradeList(trades, openPosition) {
    const el = document.getElementById('botTradeList');
    if (!el) return;

    if (!trades || !trades.length) {
        el.innerHTML = '<div class="bt-empty">Noch keine Trades in den letzten 90 Tagen.</div>';
        return;
    }

    let html = `<div class="bt-list-header">Frühere Trades</div>`;

    html += trades.map(t => {
        const cls = t.pnlPct > 0 ? 'win' : 'loss';
        return `
            <div class="bt-trade ${cls}">
                <div class="bt-trade-pnl ${cls}">${fmtPct(t.pnlPct, 1)}</div>
                <div class="bt-trade-prices">
                    <span class="bt-trade-entry">${fmtUSD(t.entryPrice)}</span>
                    <span class="bt-trade-arrow">→</span>
                    <span class="bt-trade-exit">${fmtUSD(t.exitPrice)}</span>
                </div>
                <div class="bt-trade-meta">
                    <span class="bt-trade-meta-item" title="${fullDateTime(t.entryTime)}">📅 ${shortDateTime(t.entryTime)}</span>
                    <span class="bt-trade-meta-item">⏱ ${t.barsHeld}h gehalten</span>
                    <span class="bt-trade-meta-item" title="${reasonExplain(t.exitReason)}">${reasonLabel(t.exitReason)}</span>
                </div>
            </div>
        `;
    }).join('');

    el.innerHTML = html;
}

// Live PnL update for open position
function updateLivePnL() {
    if (!openPositionState) return;
    const livePrice = window.liveBTCPrice;
    if (!Number.isFinite(livePrice)) return;
    const pnl = ((livePrice - openPositionState.entryPrice) / openPositionState.entryPrice) * 100;
    const pnlEl = document.getElementById('botLivePnL');
    const priceEl = document.getElementById('botLivePrice');
    if (pnlEl) {
        pnlEl.textContent = fmtPct(pnl, 2);
        pnlEl.className = `lt-pnl-value ${pnl > 0 ? 'pos' : 'neg'}`;
    }
    if (priceEl) priceEl.textContent = fmtUSD(livePrice);
}

async function loadBotTrades() {
    const statusEl = document.getElementById('botTradeStatus');
    if (statusEl) statusEl.textContent = 'Lade Backtest…';
    try {
        const res = await fetch(`${BACKTEST_URL}&_=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.message || data.error);

        openPositionState = data.openPosition || null;
        renderStats(data.stats);
        renderLastTriggerHero(data.recentTrades, data.openPosition);
        renderTradeList(data.recentTrades, data.openPosition);

        if (statusEl) {
            const lastUpdate = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            statusEl.textContent = `90 Tage Replay · aktualisiert ${lastUpdate}`;
        }
    } catch (e) {
        console.error('Bot trades load failed:', e);
        if (statusEl) statusEl.textContent = '⚠️ Trade-Historie nicht verfügbar';
        const list = document.getElementById('botTradeList');
        if (list) list.innerHTML = `<div class="bt-empty">Fehler: ${e.message}</div>`;
    }
}

function init() {
    loadBotTrades();
    if (tradesRefreshTimer) clearInterval(tradesRefreshTimer);
    tradesRefreshTimer = setInterval(loadBotTrades, TRADES_REFRESH_MS);

    // Live PnL via WebSocket price updates
    window.addEventListener('btc-live-price', updateLivePnL);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) loadBotTrades();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
