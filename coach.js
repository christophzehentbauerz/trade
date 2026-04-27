// =====================================================
// Coach Hero — Plain-German verdict + trade plan
// Aggregates /api/bot/signal + /api/market/overview into
// a single at-a-glance answer: "Should I trade now?"
// =====================================================

(function () {
    const REFRESH_MS = 60_000;
    let refreshTimer = null;

    const $ = id => document.getElementById(id);
    const fmtUSD = v => Number.isFinite(v) ? '$' + Math.round(v).toLocaleString('de-DE') : '—';
    const fmtPct = (v, d = 1) => Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(d)}%` : '—';

    // ─── Plain-German translators ─────────────────────────

    function buildVerdict(signal) {
        if (signal === 'LONG') return { word: 'JETZT KAUFEN', emoji: '🟢', class: 'buy' };
        if (signal === 'WATCH') return { word: 'BEOBACHTEN', emoji: '🟡', class: 'watch' };
        return { word: 'WARTEN', emoji: '⏸️', class: 'wait' };
    }

    function buildExplanation(signal, checks, ind) {
        const adx = ind.adx?.toFixed(0);
        const rsi = ind.rsi?.toFixed(0);

        if (signal === 'LONG') {
            return `Bitcoin hat soeben einen Aufwärts-Cross bestätigt (EMA15 über EMA300 und Preis über EMA800). ` +
                   `Der Trend hat ausreichend Schwung (ADX ${adx}) und der RSI ist mit ${rsi} in der gesunden Einstiegszone. ` +
                   `Das ist genau das Setup, auf das mein Coach wartet — ein guter Long-Einstieg.`;
        }

        if (signal === 'WATCH') {
            if (checks.trendUp && !checks.freshCross && checks.rsiInZone && checks.adxOk) {
                return `Bitcoin ist im Aufwärtstrend, aber das Setup ist nicht mehr frisch — der EMA-Cross liegt schon eine Weile zurück. ` +
                       `Wenn du nicht schon vorher eingestiegen bist, warte besser auf das nächste saubere Setup.`;
            }
            if (checks.trendUp && !checks.adxOk) {
                return `Bitcoin steigt zwar, aber dem Trend fehlt Power (ADX nur ${adx}, sollte mindestens 20 sein). ` +
                       `Das deutet auf eine Range-Phase hin — Risiko von Fehlsignalen ist hoch. Geduld zahlt sich aus.`;
            }
            if (checks.trendUp && !checks.rsiInZone) {
                if (ind.rsi > 70) {
                    return `Bitcoin ist im Aufwärtstrend, aber der RSI (${rsi}) ist überhitzt. ` +
                           `Wer hier nachkauft, trägt erhöhtes Korrekturrisiko. Lieber auf einen Pullback warten.`;
                }
                return `Bitcoin steigt, aber RSI (${rsi}) ist außerhalb der gesunden Einstiegszone (45–70). ` +
                       `Geduld bringt das bessere Setup.`;
            }
            return `Mehrere Bedingungen für ein sauberes Long-Setup sind nicht erfüllt. ` +
                   `Mein Coach empfiehlt zu warten.`;
        }

        // WAIT (no clear setup)
        if (!checks.goldenCross) {
            return `Bitcoin ist aktuell in einem Abwärtstrend (EMA15 unter EMA300). ` +
                   `Long-Einstiege wären hier gegen den Trend — sehr riskant. Geduld bis sich die Lage dreht.`;
        }
        if (!checks.aboveHTF) {
            return `Bitcoin handelt unter dem langfristigen Trend (EMA800). ` +
                   `Solange der Preis darunter bleibt, sind Long-Einstiege riskant. Warte auf den Reclaim.`;
        }
        return `Aktuelle Marktbedingungen sind nicht ideal für einen Einstieg. ` +
               `Der Coach wartet auf ein klares Signal.`;
    }

    function fearGreedContext(fg) {
        if (!Number.isFinite(fg)) return null;
        if (fg < 20) return { class: 'bull', headline: 'Extreme Angst', detail: `${fg}/100 — Marktstimmung panisch. Historisch oft eine gute Kaufgelegenheit.` };
        if (fg < 40) return { class: 'bull', headline: 'Angst', detail: `${fg}/100 — Marktstimmung vorsichtig. Mögliche Buy-the-Dip Zone.` };
        if (fg < 60) return { class: '', headline: 'Neutral', detail: `${fg}/100 — Markt unentschlossen.` };
        if (fg < 75) return { class: 'warn', headline: 'Gier', detail: `${fg}/100 — Markt heiß. Vorsicht bei FOMO-Käufen.` };
        return { class: 'bear', headline: 'Extreme Gier', detail: `${fg}/100 — Markt überhitzt. Korrekturrisiko erhöht.` };
    }

    function priceChangeContext(change24h) {
        if (!Number.isFinite(change24h)) return null;
        if (change24h > 5) return { class: 'bull', headline: `+${change24h.toFixed(2)}%`, detail: `Starker Anstieg in den letzten 24h. Hohe Volatilität.` };
        if (change24h > 1.5) return { class: 'bull', headline: `+${change24h.toFixed(2)}%`, detail: `Solider Tagesanstieg.` };
        if (change24h > -1.5) return { class: '', headline: `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`, detail: `Ruhiger Markt heute, kaum Bewegung.` };
        if (change24h > -5) return { class: 'bear', headline: `${change24h.toFixed(2)}%`, detail: `Spürbarer Rücksetzer in 24h.` };
        return { class: 'bear', headline: `${change24h.toFixed(2)}%`, detail: `Größerer Sell-Off — erhöhte Volatilität.` };
    }

    function trendContext(checks, ind) {
        const ema15 = ind.ema15;
        const ema300 = ind.ema300;
        const ema800 = ind.ema800;
        if (!Number.isFinite(ema15) || !Number.isFinite(ema300) || !Number.isFinite(ema800)) return null;

        const above800 = checks.aboveHTF;
        const golden = checks.goldenCross;

        if (above800 && golden) {
            return { class: 'bull', headline: 'Aufwärtstrend', detail: `Über kurzem & langfristigem Trend (EMA300 + EMA800).` };
        }
        if (!above800 && !golden) {
            return { class: 'bear', headline: 'Abwärtstrend', detail: `Unter kurzem & langfristigem Trend.` };
        }
        if (above800 && !golden) {
            return { class: 'warn', headline: 'Übergang', detail: `Über EMA800, aber kurzfristig schwächelnd.` };
        }
        return { class: 'warn', headline: 'Unsicher', detail: `Mixed signals zwischen kurzem & langfristigem Trend.` };
    }

    // ─── Confidence calculation ─────────────────────────

    function computeConfidence(signal, checks) {
        // Count how many of the 5 conditions are met
        const conditions = [checks.goldenCross, checks.aboveHTF, checks.rsiInZone, checks.adxOk, checks.freshCross];
        const met = conditions.filter(Boolean).length;
        if (signal === 'LONG') return 78 + Math.min(22, (met - 4) * 6); // 78–100
        if (signal === 'WATCH') return 35 + met * 8; // 35–75
        return Math.max(8, met * 8); // 8–32
    }

    // ─── Render ─────────────────────────────────────────

    function renderHero({ botSignal, market }) {
        const root = $('coachHero');
        if (!root) return;

        const verdict = buildVerdict(botSignal.signal);
        const conf = computeConfidence(botSignal.signal, botSignal.checks);
        const explanation = buildExplanation(botSignal.signal, botSignal.checks, botSignal.indicators);

        root.dataset.verdict = verdict.class;

        // Strip
        const lastUpdate = new Date(botSignal.lastCandleTime);
        const dateStr = lastUpdate.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
        const timeStr = lastUpdate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

        // Trade plan
        let planHtml = '';
        const t = botSignal.tradeLevels;
        if (t && (verdict.class === 'buy' || verdict.class === 'watch')) {
            planHtml = `
                <div class="coach-plan">
                    <div class="coach-plan-label">📍 Wenn du jetzt traden würdest</div>
                    <div class="coach-plan-grid">
                        <div class="coach-plan-item entry">
                            <div class="coach-plan-item-label">↪ Einstieg</div>
                            <div class="coach-plan-item-value">${fmtUSD(t.entry)}</div>
                            <div class="coach-plan-item-meta">aktueller Marktpreis</div>
                        </div>
                        <div class="coach-plan-item stop">
                            <div class="coach-plan-item-label">🛑 Stop Loss</div>
                            <div class="coach-plan-item-value">${fmtUSD(t.stopLoss)}</div>
                            <div class="coach-plan-item-meta">${fmtPct(t.stopLossPct, 2)} Risiko</div>
                        </div>
                        <div class="coach-plan-item target">
                            <div class="coach-plan-item-label">🎯 Ziel (TP1)</div>
                            <div class="coach-plan-item-value">${fmtUSD(t.tp1)}</div>
                            <div class="coach-plan-item-meta">+${(t.rr1 * Math.abs(t.stopLossPct)).toFixed(1)}% Gewinn (RR ${t.rr1.toFixed(1)}:1)</div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Context cards
        const ctxFG = market?.fearGreed ? fearGreedContext(market.fearGreed) : null;
        const ctxChange = market?.change24h != null ? priceChangeContext(market.change24h) : null;
        const ctxTrend = trendContext(botSignal.checks, botSignal.indicators);

        const ctxCard = (icon, label, ctx) => ctx ? `
            <div class="coach-ctx-card ${ctx.class}">
                <div class="coach-ctx-label">${icon} ${label}</div>
                <div class="coach-ctx-headline">${ctx.headline}</div>
                <div class="coach-ctx-detail">${ctx.detail}</div>
            </div>
        ` : '';

        const changeArrow = market?.change24h > 0 ? '↑' : market?.change24h < 0 ? '↓' : '·';
        const changeClass = market?.change24h > 0 ? 'up' : market?.change24h < 0 ? 'down' : '';

        root.innerHTML = `
            <div class="coach-strip">
                <div class="coach-strip-left">
                    <span class="coach-strip-icon">🤖</span>
                    <span>Mein Bitcoin-Coach · ${dateStr}</span>
                </div>
                <div class="coach-strip-right">
                    <span>Stand: ${timeStr} Uhr</span>
                </div>
            </div>

            <div class="coach-verdict-row">
                <div class="coach-verdict">
                    <div class="coach-verdict-badge">
                        <span class="coach-verdict-emoji">${verdict.emoji}</span>
                        <span>${verdict.word}</span>
                    </div>
                    <div class="coach-confidence">
                        <div class="coach-confidence-row">
                            <span>Konfidenz</span>
                            <span class="coach-confidence-value">${conf}%</span>
                        </div>
                        <div class="coach-confidence-bar">
                            <div class="coach-confidence-fill" style="width: ${conf}%"></div>
                        </div>
                    </div>
                </div>
                <div class="coach-price">
                    <div class="coach-price-label">Bitcoin Preis</div>
                    <div class="coach-price-value">${fmtUSD(botSignal.price)}</div>
                    ${Number.isFinite(market?.change24h) ? `
                        <div class="coach-price-change ${changeClass}">${changeArrow} ${fmtPct(market.change24h, 2)} heute</div>
                    ` : ''}
                </div>
            </div>

            <div class="coach-why">
                <div class="coach-why-label">💡 Was sagt der Coach</div>
                <div class="coach-why-text">${explanation}</div>
            </div>

            ${planHtml}

            <div class="coach-context">
                ${ctxCard('📈', 'Trend', ctxTrend)}
                ${ctxCard('😱', 'Stimmung', ctxFG)}
                ${ctxCard('⏱', '24h', ctxChange)}
            </div>
        `;
    }

    function renderError(msg) {
        const root = $('coachHero');
        if (!root) return;
        root.dataset.verdict = 'wait';
        root.innerHTML = `
            <div class="coach-error">
                ⚠️ Coach gerade nicht verfügbar — ${msg}<br>
                <small>Versuche es in einer Minute erneut.</small>
            </div>
        `;
    }

    async function loadCoach() {
        try {
            const [botRes, marketRes] = await Promise.all([
                fetch('/api/bot/signal', { cache: 'no-store' }),
                fetch('/api/market/overview').catch(() => null)
            ]);
            if (!botRes.ok) throw new Error(`Bot-API HTTP ${botRes.status}`);
            const botSignal = await botRes.json();
            if (botSignal.error) throw new Error(botSignal.message || botSignal.error);

            let market = null;
            if (marketRes && marketRes.ok) {
                try {
                    const m = await marketRes.json();
                    market = {
                        change24h: m.priceChange24h
                    };
                } catch (e) { /* market data optional */ }
            }

            // Try to read F&G from existing app state if available
            if (typeof state !== 'undefined' && Number.isFinite(state.fearGreedIndex)) {
                market = market || {};
                market.fearGreed = state.fearGreedIndex;
            }

            renderHero({ botSignal, market: market || {} });
        } catch (e) {
            console.error('Coach load failed:', e);
            renderError(e.message);
        }
    }

    function init() {
        loadCoach();
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(loadCoach, REFRESH_MS);

        // Refresh when tab becomes visible
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) loadCoach();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
