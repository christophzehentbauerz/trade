// =====================================================
// Bot Trade Journal — Replays bot strategy on history
// and renders the resulting trades + stats.
// =====================================================

const BACKTEST_URL = '/api/bot/backtest?days=90';

const fmtUSD = v => Number.isFinite(v) ? '$' + Math.round(v).toLocaleString('de-DE') : '—';
const fmtPct = (v, digits = 2) => Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%` : '—';
const fmtPF = v => Number.isFinite(v) ? v.toFixed(2) : '∞';

function relativeDate(iso) {
    const d = new Date(iso);
    const days = Math.round((Date.now() - d.getTime()) / 86400000);
    if (days === 0) return 'heute';
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

function renderTradeList(trades, openPosition) {
    const el = document.getElementById('botTradeList');
    if (!el) return;

    if (!trades || !trades.length) {
        el.innerHTML = '<div class="bt-empty">Noch keine Trades in den letzten 90 Tagen.</div>';
        return;
    }

    let html = '';

    if (openPosition) {
        const ageH = openPosition.barsHeld;
        html += `
            <div class="bt-trade open">
                <div class="bt-trade-status">📍 OFFEN</div>
                <div class="bt-trade-prices">
                    <span class="bt-trade-entry">${fmtUSD(openPosition.entryPrice)}</span>
                    <span class="bt-trade-arrow">→</span>
                    <span class="bt-trade-exit">Live</span>
                </div>
                <div class="bt-trade-meta">
                    <span class="bt-trade-meta-item">Stop: ${fmtUSD(openPosition.stop)}</span>
                    <span class="bt-trade-meta-item">Hoch: ${fmtUSD(openPosition.highestPrice)}</span>
                    <span class="bt-trade-meta-item">${ageH}h offen</span>
                </div>
            </div>
        `;
    }

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
                    <span class="bt-trade-meta-item">${relativeDate(t.entryTime)}</span>
                    <span class="bt-trade-meta-item">${t.barsHeld}h</span>
                    <span class="bt-trade-meta-item">${reasonLabel(t.exitReason)}</span>
                </div>
            </div>
        `;
    }).join('');

    el.innerHTML = html;
}

async function loadBotTrades() {
    const statusEl = document.getElementById('botTradeStatus');
    if (statusEl) statusEl.textContent = 'Lade Backtest…';
    try {
        const res = await fetch(BACKTEST_URL, { cache: 'force-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.message || data.error);

        renderStats(data.stats);
        renderTradeList(data.recentTrades, data.openPosition);

        if (statusEl) {
            statusEl.textContent = `90 Tage Replay · ${data.window.candles} Candles`;
        }
    } catch (e) {
        console.error('Bot trades load failed:', e);
        if (statusEl) statusEl.textContent = '⚠️ Trade-Historie nicht verfügbar';
        const list = document.getElementById('botTradeList');
        if (list) list.innerHTML = `<div class="bt-empty">Fehler: ${e.message}</div>`;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadBotTrades);
} else {
    loadBotTrades();
}
