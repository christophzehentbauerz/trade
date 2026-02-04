// =====================================================
// Live Trading Analysis
// Uses the SAME scoring as the main dashboard (app.js)
// Same thresholds, same weights, same SL/TP levels
// =====================================================

async function generateLiveAnalysis() {
    console.log('🔬 Generiere Live-Analyse...');

    // Use the scores already calculated by the dashboard (single source of truth)
    const currentPrice = state.price;
    const signal = state.signal;
    const confidence = state.confidence;
    const weightedScore = state.weightedScore || calculateWeightedScore();
    const rsi = calculateRSI(state.priceHistory);
    const trend = determineTrend(state.priceHistory);
    const fearGreed = state.fearGreedIndex;

    // Entry/SL/TP — SAME as dashboard (app.js) and bot.js
    // SL: 6%, TP1: 4%, TP2: 8%, TP3: 12%
    let entry, stopLoss, tp1, tp2, tp3;

    if (signal !== 'NEUTRAL') {
        entry = currentPrice;

        if (signal === 'LONG') {
            stopLoss = currentPrice * 0.94;  // -6%
            tp1 = currentPrice * 1.04;       // +4%
            tp2 = currentPrice * 1.08;       // +8%
            tp3 = currentPrice * 1.12;       // +12%
        } else {
            stopLoss = currentPrice * 1.06;  // +6%
            tp1 = currentPrice * 0.96;       // -4%
            tp2 = currentPrice * 0.92;       // -8%
            tp3 = currentPrice * 0.88;       // -12%
        }
    }

    // Generate reasons based on what drove the score
    const reasons = [];

    if (signal === 'LONG') {
        if (rsi < 40) reasons.push(`RSI bei ${Math.round(rsi)} - ueberverkaufte Bedingungen`);
        if (trend === 'up') reasons.push('Aufwaertstrend unterstuetzt LONG');
        if (fearGreed < 35) reasons.push(`Fear & Greed bei ${fearGreed} - Angst als Kaufsignal (Kontraindikator)`);
        if (state.fundingRate < 0) reasons.push('Negative Funding Rate - Shorts zahlen');
        if (state.newsSentimentScore > 0) reasons.push('News-Sentiment ist bullish');
    } else if (signal === 'SHORT') {
        if (rsi > 60) reasons.push(`RSI bei ${Math.round(rsi)} - ueberkaufte Bedingungen`);
        if (trend === 'down') reasons.push('Abwaertstrend unterstuetzt SHORT');
        if (fearGreed > 65) reasons.push(`Fear & Greed bei ${fearGreed} - Gier als Verkaufssignal (Kontraindikator)`);
        if (state.fundingRate > 0.03) reasons.push('Hohe Funding Rate - Longs zahlen');
        if (state.newsSentimentScore < 0) reasons.push('News-Sentiment ist bearish');
    } else {
        reasons.push(`Score bei ${weightedScore.toFixed(1)}/10 - im neutralen Bereich (4.2-5.8)`);
        if (rsi >= 40 && rsi <= 60) reasons.push(`RSI bei ${Math.round(rsi)} - neutral`);
        if (fearGreed >= 35 && fearGreed <= 65) reasons.push(`Fear & Greed bei ${fearGreed} - keine Extreme`);
    }

    if (reasons.length < 2) {
        reasons.push(`Gesamtscore: ${weightedScore.toFixed(1)}/10`);
    }

    return {
        signal,
        confidence,
        weightedScore,
        currentPrice,
        entry,
        stopLoss,
        tp1, tp2, tp3,
        rsi,
        trend,
        fearGreed,
        reasons: reasons.slice(0, 4),
        scores: state.scores
    };
}

// Display analysis in formatted card
async function showLiveAnalysis() {
    const data = await generateLiveAnalysis();
    console.log('Live Analysis:', data);

    const now = new Date();
    const dateStr = now.toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const signalClass = data.signal === 'LONG' ? 'long' : data.signal === 'SHORT' ? 'short' : 'abwarten';

    let html = `
        <div class="analysis-header">
            <div class="analysis-timestamp">📅 ${dateStr}</div>
            <div class="analysis-price">💰 Aktueller Preis: <strong>$${formatNumber(data.currentPrice, 0)}</strong></div>
        </div>

        <div class="analysis-recommendation ${signalClass}">
            <div class="recommendation-label">EMPFEHLUNG</div>
            <div class="recommendation-value">${data.signal === 'NEUTRAL' ? 'ABWARTEN' : data.signal}</div>
            <div class="confidence-bar">
                <div class="confidence-fill" style="width: ${Math.round(data.confidence)}%"></div>
            </div>
            <div class="confidence-label">Konfidenz: ${Math.round(data.confidence)}% | Score: ${data.weightedScore.toFixed(1)}/10</div>
        </div>
    `;

    if (data.signal !== 'NEUTRAL' && data.entry) {
        html += `
            <div class="trade-levels-display">
                <div class="level-item entry">
                    <div class="level-icon">📍</div>
                    <div class="level-info">
                        <div class="level-label">Entry</div>
                        <div class="level-value">$${formatNumber(data.entry, 0)}</div>
                    </div>
                </div>
                <div class="level-item sl">
                    <div class="level-icon">🛑</div>
                    <div class="level-info">
                        <div class="level-label">Stop Loss</div>
                        <div class="level-value">$${formatNumber(data.stopLoss, 0)}</div>
                        <div class="level-percent text-bearish">(-6%)</div>
                    </div>
                </div>
                <div class="level-item tp">
                    <div class="level-icon">🎯</div>
                    <div class="level-info">
                        <div class="level-label">TP1 / TP2 / TP3</div>
                        <div class="level-value">$${formatNumber(data.tp1, 0)} / $${formatNumber(data.tp2, 0)} / $${formatNumber(data.tp3, 0)}</div>
                        <div class="level-percent text-bullish">(+4% / +8% / +12%)</div>
                    </div>
                </div>
            </div>
        `;
    } else {
        html += `
            <div class="no-trade-message">
                <div class="no-trade-icon">⏸️</div>
                <div class="no-trade-text">Aktuell keine klare Trading-Gelegenheit.</div>
                <div class="no-trade-subtext">Score muss >= 5.8 (LONG) oder <= 4.2 (SHORT) sein.</div>
            </div>
        `;
    }

    // Score Breakdown — same categories as dashboard
    html += `
        <div class="score-breakdown-section">
            <div class="breakdown-title">📊 Score Breakdown (${data.weightedScore.toFixed(1)}/10)</div>
            <div class="breakdown-grid">
                <div class="breakdown-item">
                    <span class="breakdown-label">Technisch (35%)</span>
                    <span class="breakdown-value">${data.scores.technical.toFixed(1)}/10</span>
                </div>
                <div class="breakdown-item">
                    <span class="breakdown-label">Momentum (25%)</span>
                    <span class="breakdown-value">${data.scores.onchain.toFixed(1)}/10</span>
                </div>
                <div class="breakdown-item">
                    <span class="breakdown-label">Sentiment (20%)</span>
                    <span class="breakdown-value">${data.scores.sentiment.toFixed(1)}/10</span>
                </div>
                <div class="breakdown-item">
                    <span class="breakdown-label">Makro (20%)</span>
                    <span class="breakdown-value">${data.scores.macro.toFixed(1)}/10</span>
                </div>
            </div>
        </div>
    `;

    // Risk factors
    const riskFactors = [];
    if (data.confidence < 60) {
        riskFactors.push('Niedrige Konfidenz - erhoehtes Risiko');
    }
    if (data.signal !== 'NEUTRAL') {
        riskFactors.push('Stop Loss bei 6% - maximaler Verlust pro Trade');
        riskFactors.push('Kryptowaehrungen sind hochvolatil - nur investieren, was du verlieren kannst');
    }

    if (riskFactors.length > 0) {
        html += `
            <div class="risk-factors-section">
                <div class="risk-title">⚠️ Risikofaktoren</div>
                <ul class="risk-list">
                    ${riskFactors.map(r => `<li>${r}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    // Reasons
    if (data.reasons.length > 0) {
        html += `
            <div class="analysis-reasons">
                <div class="reasons-title">💡 Begruendung</div>
                <ul class="reasons-list">
                    ${data.reasons.map(r => `<li>${r}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    html += `
        <div class="analysis-disclaimer">
            ⚠️ <strong>Disclaimer:</strong> Keine Finanzberatung. DYOR.
        </div>
    `;

    document.getElementById('analysisContent').innerHTML = html;
    document.getElementById('analysisCardContainer').style.display = 'block';

    document.getElementById('analysisCardContainer').scrollIntoView({
        behavior: 'smooth',
        block: 'center'
    });
}
