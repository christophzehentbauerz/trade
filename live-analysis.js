// =====================================================
// Live Trading Analysis
// =====================================================

// Volume Analysis Functions
function calculateOBV(prices, volumes) {
    if (!prices || !volumes || prices.length === 0) return { current: 0, trend: 'neutral', values: [0] };

    let obv = 0;
    const obvData = [0];

    for (let i = 1; i < Math.min(prices.length, volumes.length); i++) {
        if (prices[i] > prices[i - 1]) {
            obv += volumes[i]; // Price up = add volume
        } else if (prices[i] < prices[i - 1]) {
            obv -= volumes[i]; // Price down = subtract volume
        }
        obvData.push(obv);
    }

    // Determine trend (last 10 periods)
    const recent = obvData.slice(-10);
    const trend = recent[recent.length - 1] > recent[0] ? 'up' :
        recent[recent.length - 1] < recent[0] ? 'down' : 'neutral';

    return { current: obv, trend, values: obvData };
}

function calculateRVOL(currentVolume, historicalVolumes) {
    if (!currentVolume || !historicalVolumes || historicalVolumes.length < 20) {
        return { ratio: 1.0, status: 'normal' };
    }

    const avg = historicalVolumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const ratio = currentVolume / avg;

    let status = 'normal';
    if (ratio < 0.8) status = 'low';
    else if (ratio > 1.5 && ratio < 2.5) status = 'high';
    else if (ratio >= 2.5) status = 'extreme';

    return { ratio, status };
}

function detectOBVDivergence(prices, obvData) {
    if (!prices || !obvData || prices.length < 10 || obvData.length < 10) {
        return { divergence: false, type: 'none' };
    }

    const recentPrices = prices.slice(-10);
    const recentOBV = obvData.slice(-10);

    const priceTrend = recentPrices[9] > recentPrices[0] ? 'up' :
        recentPrices[9] < recentPrices[0] ? 'down' : 'neutral';
    const obvTrend = recentOBV[9] > recentOBV[0] ? 'up' :
        recentOBV[9] < recentOBV[0] ? 'down' : 'neutral';

    // Bearish divergence: Price up, OBV down
    if (priceTrend === 'up' && obvTrend === 'down') {
        return { divergence: true, type: 'bearish' };
    }

    // Bullish divergence: Price down, OBV up
    if (priceTrend === 'down' && obvTrend === 'up') {
        return { divergence: true, type: 'bullish' };
    }

    return { divergence: false, type: 'none' };
}

async function ensureAnalysisDataReady() {
    const hasCoreData =
        Number.isFinite(state.price) &&
        state.price > 0 &&
        Array.isArray(state.priceHistory) &&
        state.priceHistory.length >= 10;

    if (!hasCoreData && typeof updateDashboard === 'function') {
        await updateDashboard();
    }
}

async function generateLiveAnalysis() {
    console.log('🔬 Generiere Live-Analyse...');

    // Get current market data
    const currentPrice = state.price;
    const rsi = calculateRSI(state.priceHistory);
    const trend = determineTrend(state.priceHistory);
    const fearGreed = state.fearGreedIndex;
    const ath = state.ath;

    // Calculate indicators (using last 30 days of price history)
    const priceWindow = state.priceHistory.slice(-30);
    const volatility = calculateVolatility(priceWindow);

    // Detect Support/Resistance
    const sr = detectSupportResistance(priceWindow, currentPrice);

    // Use unified coach recommendation if available (source-of-truth)
    const unifiedRecommendation = typeof getUnifiedTradeRecommendation === 'function'
        ? getUnifiedTradeRecommendation()
        : null;

    // VOLUME ANALYSIS - Robust Data Fetching
    let volumeAnalysis = null;
    let volumes = [];

    // Try multiple sources for volume data
    if (window.historicalData && window.historicalData.total_volumes) {
        volumes = window.historicalData.total_volumes.map(v => v[1]);
    } else if (state.volumeHistory && state.volumeHistory.length > 0) {
        volumes = state.volumeHistory;
    }

    if (volumes.length > 0) {
        const currentVolume = state.volume24h || volumes[volumes.length - 1];

        const obvResult = calculateOBV(priceWindow, volumes.slice(-30));
        const rvolResult = calculateRVOL(currentVolume, volumes);
        const divergence = detectOBVDivergence(priceWindow, obvResult.values);

        volumeAnalysis = {
            obv: obvResult,
            rvol: rvolResult,
            divergence,
            currentVolume
        };
    } else {
        console.warn('⚠️ Keine Volumendaten verfügbar für Analyse');
    }

    // Calculate Confluence Score...

    // Calculate Confluence Score (same logic as backtester)
    const confluenceScore = calculateLiveConfluenceScore(
        currentPrice,
        rsi,
        trend,
        fearGreed,
        ath,
        sr,
        volatility
    );

    // Determine signal from unified coach recommendation (fallback to confluence)
    let signal = 'ABWARTEN';
    let confidence = Math.round(confluenceScore.total * 10);

    // Store confluence score globally for display
    window.lastConfluenceScore = confluenceScore;

    if (unifiedRecommendation) {
        signal = unifiedRecommendation.signal === 'NEUTRAL' ? 'ABWARTEN' : unifiedRecommendation.signal;
        confidence = Math.round(unifiedRecommendation.confidence ?? confidence);
    } else {
        // Fallback: pure confluence
        if (confluenceScore.total >= 6 && confluenceScore.direction === 'LONG') {
            signal = 'LONG';
        } else if (confluenceScore.total >= 6 && confluenceScore.direction === 'SHORT') {
            signal = 'SHORT';
        }
    }

    // Calculate Entry/SL/TP (prefer unified coach recommendation)
    let entry, stopLoss, takeProfit, slPercent, tpPercent;

    if (signal === 'LONG' || signal === 'SHORT') {
        if (unifiedRecommendation && unifiedRecommendation.entryZone && unifiedRecommendation.stopLoss && unifiedRecommendation.tp1) {
            entry = signal === 'LONG' ? unifiedRecommendation.entryZone[1] : unifiedRecommendation.entryZone[0];
            stopLoss = unifiedRecommendation.stopLoss;
            takeProfit = unifiedRecommendation.tp1;
            slPercent = unifiedRecommendation.slPercent / 100;
            tpPercent = signal === 'LONG'
                ? ((takeProfit - entry) / entry)
                : ((entry - takeProfit) / entry);
        } else {
            entry = currentPrice;
            slPercent = Math.min(0.03, volatility * 1.5);
            stopLoss = signal === 'LONG' ? entry * (1 - slPercent) : entry * (1 + slPercent);
            tpPercent = slPercent * 2.5;
            takeProfit = signal === 'LONG' ? entry * (1 + tpPercent) : entry * (1 - tpPercent);
        }
    }

    // Generate reasons
    const reasons = generateReasons(confluenceScore, rsi, trend, fearGreed, sr);

    // Format output
    const now = new Date();
    const dateStr = now.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    let output = `
🔴 BTC ANALYSE - ${dateStr}

💰 Aktueller Preis: $${formatNumber(currentPrice, 0)}

═══════════════════════════════════════

📈 EMPFEHLUNG: ${signal}

📊 KONFIDENZ: ${Math.round(confidence)}%

═══════════════════════════════════════
`;

    if (signal !== 'ABWARTEN' && signal !== 'EXIT') {
        output += `
📍 Entry:       $${formatNumber(entry, 0)}
🎯 Take Profit: $${formatNumber(takeProfit, 0)} (+${(tpPercent * 100).toFixed(1)}%)
🛑 Stop Loss:   $${formatNumber(stopLoss, 0)} (-${(slPercent * 100).toFixed(1)}%)

═══════════════════════════════════════
`;
    } else if (signal === 'EXIT') {
        output += `
🚫 EXIT SIGNAL - Position schließen!
Death Cross: EMA(15) unter EMA(300)

═══════════════════════════════════════
`;
    } else {
        output += `
⏸️ Aktuell keine klare Trading-Gelegenheit.
Warte auf bessere Signale (Konfidenz >= 50%).

═══════════════════════════════════════
`;
    }

    output += `
💡 WARUM?
${reasons.map(r => `- ${r}`).join('\n')}

═══════════════════════════════════════
⚠️ Keine Finanzberatung. DYOR.
`;

    // Store data for display
    window.lastAnalysisData = {
        smartMoneyData: null,
        useSmartMoney: false,
        signal,
        confidence,
        entry,
        stopLoss,
        takeProfit,
        slPercent,
        tpPercent,
        volumeAnalysis // NEW: Volume analysis data
    };

    return output;
}

function detectSupportResistance(priceWindow, currentPrice) {
    const levels = [];

    // Find local peaks and troughs
    for (let i = 2; i < priceWindow.length - 2; i++) {
        // Resistance (peak)
        if (priceWindow[i] > priceWindow[i - 1] && priceWindow[i] > priceWindow[i - 2] &&
            priceWindow[i] > priceWindow[i + 1] && priceWindow[i] > priceWindow[i + 2]) {
            levels.push({ price: priceWindow[i], type: 'resistance' });
        }
        // Support (trough)
        if (priceWindow[i] < priceWindow[i - 1] && priceWindow[i] < priceWindow[i - 2] &&
            priceWindow[i] < priceWindow[i + 1] && priceWindow[i] < priceWindow[i + 2]) {
            levels.push({ price: priceWindow[i], type: 'support' });
        }
    }

    // Find nearest support and resistance
    const resistances = levels.filter(l => l.type === 'resistance' && l.price > currentPrice);
    const supports = levels.filter(l => l.type === 'support' && l.price < currentPrice);

    const nearestResistance = resistances.length > 0
        ? resistances.reduce((a, b) => a.price < b.price ? a : b).price
        : currentPrice * 1.05;

    const nearestSupport = supports.length > 0
        ? supports.reduce((a, b) => a.price > b.price ? a : b).price
        : currentPrice * 0.95;

    const distanceToResistance = ((nearestResistance - currentPrice) / currentPrice) * 100;
    const distanceToSupport = ((currentPrice - nearestSupport) / currentPrice) * 100;

    return {
        nearestSupport,
        nearestResistance,
        distanceToSupport,
        distanceToResistance,
        atSupport: distanceToSupport < 2,
        atResistance: distanceToResistance < 2
    };
}

function calculateLiveConfluenceScore(price, rsi, trend, fearGreed, ath, sr, volatility) {
    const scores = {
        trend: 0,
        momentum: 0,
        srPosition: 0,
        marketStructure: 0,
        macro: 0
    };
    const hasFearGreed = Number.isFinite(fearGreed);

    // Determine direction first
    let direction = null;

    // LONG conditions
    if ((rsi < 45 && sr.distanceToSupport < 10) ||
        (trend === 'up' && rsi > 40 && rsi < 65) ||
        (hasFearGreed && fearGreed < 35)) {
        direction = 'LONG';
    }
    // SHORT conditions
    else if ((rsi > 55 && sr.distanceToResistance < 10) ||
        (trend === 'down' && rsi > 35 && rsi < 60) ||
        (hasFearGreed && fearGreed > 65)) {
        direction = 'SHORT';
    }

    if (!direction) {
        return { total: 0, breakdown: scores, direction: null };
    }

    // Score calculations (simplified from backtester)
    // 1. Trend (0-2)
    if (direction === 'LONG' && trend === 'up') scores.trend = 2;
    else if (direction === 'LONG' && trend === 'sideways') scores.trend = 1;
    else if (direction === 'SHORT' && trend === 'down') scores.trend = 2;
    else if (direction === 'SHORT' && trend === 'sideways') scores.trend = 1;

    // 2. Momentum (0-2)
    if (direction === 'LONG' && rsi < 45) scores.momentum = 2;
    else if (direction === 'LONG' && rsi < 55) scores.momentum = 1;
    else if (direction === 'SHORT' && rsi > 55) scores.momentum = 2;
    else if (direction === 'SHORT' && rsi > 45) scores.momentum = 1;

    // 3. S/R Position (0-2)
    if (direction === 'LONG' && sr.atSupport) scores.srPosition = 2;
    else if (direction === 'LONG' && sr.distanceToSupport < 8) scores.srPosition = 1;
    else if (direction === 'SHORT' && sr.atResistance) scores.srPosition = 2;
    else if (direction === 'SHORT' && sr.distanceToResistance < 8) scores.srPosition = 1;

    // 4. Market Structure (0-2)
    if (direction === 'LONG' && hasFearGreed && fearGreed < 35) scores.marketStructure = 2;
    else if (direction === 'LONG' && hasFearGreed && fearGreed < 50) scores.marketStructure = 1;
    else if (direction === 'SHORT' && hasFearGreed && fearGreed > 65) scores.marketStructure = 2;
    else if (direction === 'SHORT' && hasFearGreed && fearGreed > 50) scores.marketStructure = 1;

    // 5. Volume & Macro (0-2)
    // Replaced pure volatility macro with Volume/OBV/RVOL which is more actionable
    // If OBV trend matches direction OR RVOL is high/extreme -> +1 point each
    const volAnalysis = window.lastAnalysisData?.volumeAnalysis;

    if (volAnalysis) {
        // Point 1: RVOL confirmation (High volume interests)
        if (volAnalysis.rvol.status === 'high' || volAnalysis.rvol.status === 'extreme') {
            scores.macro = 1;
        }

        // Point 2: OBV Trend confirmation
        if (direction === 'LONG' && volAnalysis.obv.trend === 'up') scores.macro += 1;
        else if (direction === 'SHORT' && volAnalysis.obv.trend === 'down') scores.macro += 1;

    } else {
        // Fallback to Volatility if no volume data
        if (volatility > 2 && volatility < 5) scores.macro = 2;
        else if (volatility > 1.5 && volatility < 6) scores.macro = 1;
    }

    const total = Object.values(scores).reduce((a, b) => a + b, 0);

    return {
        total,
        breakdown: scores,
        direction
    };
}

function generateReasons(confluenceScore, rsi, trend, fearGreed, sr) {
    const reasons = [];

    if (confluenceScore.breakdown.trend >= 1) {
        const trendText = trend === 'up' ? 'Aufwaertstrend' : trend === 'down' ? 'Abwaertstrend' : 'Seitwaertsbewegung';
        reasons.push(`Trend: ${trendText} stuetzt das Signal`);
    }

    if (confluenceScore.breakdown.momentum >= 1) {
        if (confluenceScore.direction === 'LONG') {
            reasons.push(`RSI bei ${Math.round(rsi)} zeigt Oversold-Bedingungen`);
        } else {
            reasons.push(`RSI bei ${Math.round(rsi)} zeigt Overbought-Bedingungen`);
        }
    }

    if (confluenceScore.breakdown.srPosition >= 1) {
        if (confluenceScore.direction === 'LONG') {
            reasons.push(`Preis nahe Support bei $${formatNumber(sr.nearestSupport, 0)}`);
        } else {
            reasons.push(`Preis nahe Resistance bei $${formatNumber(sr.nearestResistance, 0)}`);
        }
    }

    if (confluenceScore.breakdown.marketStructure >= 1) {
        if (fearGreed < 35) {
            reasons.push(`Fear & Greed bei ${fearGreed} (Extreme Fear -> Kaufgelegenheit)`);
        } else if (fearGreed > 65) {
            reasons.push(`Fear & Greed bei ${fearGreed} (Extreme Greed -> Verkaufsgelegenheit)`);
        }
    }

    if (reasons.length < 3) {
        reasons.push(`Confluence Score: ${confluenceScore.total}/10`);
    }

    return reasons.slice(0, 4);
}

// Display analysis in formatted card
async function showLiveAnalysis() {
    await ensureAnalysisDataReady();
    const analysis = await generateLiveAnalysis();
    console.log(analysis);

    // Parse analysis data for formatted display
    const lines = analysis.split('\n').filter(l => l.trim());

    // Extract key information
    const dateMatch = analysis.match(/BTC ANALYSE - (.+)/);
    const priceMatch = analysis.match(/Aktueller Preis: \$(.+)/);
    const recommendationMatch = analysis.match(/EMPFEHLUNG: (.+)/);
    const confidenceMatch = analysis.match(/KONFIDENZ: (.+)/);
    const entryMatch = analysis.match(/Entry:\s+\$(.+)/);
    const tpMatch = analysis.match(/Take Profit: \$(.+?) \((.+?)\)/);
    const slMatch = analysis.match(/Stop Loss:\s+\$(.+?) \((.+?)\)/);

    const date = dateMatch ? dateMatch[1] : '';
    const price = priceMatch ? priceMatch[1] : '';
    const recommendation = recommendationMatch ? recommendationMatch[1].trim() : 'ABWARTEN';
    const confidence = confidenceMatch ? confidenceMatch[1].trim() : '0%';

    // Extract reasons
    const reasonsStart = analysis.indexOf('💡 WARUM?');
    const reasonsEnd = analysis.indexOf('═══════════════════════════════════════', reasonsStart + 1);
    let reasons = [];
    if (reasonsStart > -1 && reasonsEnd > -1) {
        const reasonsText = analysis.substring(reasonsStart, reasonsEnd);
        reasons = reasonsText.split('\n')
            .filter(l => l.trim().startsWith('-'))
            .map(l => l.trim().substring(1).trim());
    }

    // Build HTML
    let html = `
        <div class="analysis-header">
            <div class="analysis-timestamp">📅 ${date}</div>
            <div class="analysis-price">💰 Aktueller Preis: <strong>$${price}</strong></div>
        </div>
        
        <div class="analysis-recommendation ${recommendation.toLowerCase()}">
            <div class="recommendation-label">EMPFEHLUNG</div>
            <div class="recommendation-value">${recommendation}</div>
            <div class="confidence-bar">
                <div class="confidence-fill" style="width: ${confidence}"></div>
            </div>
            <div class="confidence-label">Konfidenz: ${confidence}</div>
        </div>
    `;

    if (recommendation !== 'ABWARTEN' && entryMatch) {
        const entry = entryMatch[1];
        const tp = tpMatch ? tpMatch[1] : '';
        const tpPercent = tpMatch ? tpMatch[2] : '';
        const sl = slMatch ? slMatch[1] : '';
        const slPercent = slMatch ? slMatch[2] : '';

        html += `
            <div class="trade-levels-display">
                <div class="level-item entry">
                    <div class="level-icon">📍</div>
                    <div class="level-info">
                        <div class="level-label">Entry</div>
                        <div class="level-value">$${entry}</div>
                    </div>
                </div>
                <div class="level-item tp">
                    <div class="level-icon">🎯</div>
                    <div class="level-info">
                        <div class="level-label">Take Profit</div>
                        <div class="level-value">$${tp}</div>
                        <div class="level-percent text-bullish">${tpPercent}</div>
                    </div>
                </div>
                <div class="level-item sl">
                    <div class="level-icon">🛑</div>
                    <div class="level-info">
                        <div class="level-label">Stop Loss</div>
                        <div class="level-value">$${sl}</div>
                        <div class="level-percent text-bearish">${slPercent}</div>
                    </div>
                </div>
            </div>
        `;
    } else {
        html += `
            <div class="no-trade-message">
                <div class="no-trade-icon">⏸️</div>
                <div class="no-trade-text">Aktuell keine klare Trading-Gelegenheit.</div>
                <div class="no-trade-subtext">Warte auf bessere Signale (Konfidenz ≥ 50%)</div>
            </div>
        `;
    }
    // Add Volume Analysis Section (if data available)
    const volumeAnalysis = window.lastAnalysisData?.volumeAnalysis;
    if (volumeAnalysis) {
        const { obv, rvol, divergence } = volumeAnalysis;

        // RVOL status colors
        const rvolColor = rvol.status === 'low' ? 'var(--bearish)' :
            rvol.status === 'extreme' ? 'var(--bearish)' :
                rvol.status === 'high' ? 'var(--bullish)' : 'var(--neutral)';

        const rvolIcon = rvol.status === 'low' ? '🔴' :
            rvol.status === 'extreme' ? '🔴' :
                rvol.status === 'high' ? '🟢' : '🟡';

        // OBV trend
        const obvIcon = obv.trend === 'up' ? '📈' : obv.trend === 'down' ? '📉' : '➡️';
        const obvColor = obv.trend === 'up' ? 'var(--bullish)' : obv.trend === 'down' ? 'var(--bearish)' : 'var(--neutral)';

        html += `
            <div class="volume-analysis-section">
                <div class="breakdown-title">📊 Volume Analysis</div>
                <div class="volume-analysis-grid">
                    <div class="volume-analysis-item">
                        <div class="volume-label">RVOL (Relative Volume)</div>
                        <div class="volume-value" style="color: ${rvolColor}">
                            ${rvolIcon} ${rvol.ratio.toFixed(2)}x
                        </div>
                        <div class="volume-status">${rvol.status === 'low' ? 'Niedrig' : rvol.status === 'high' ? 'Erhöht' : rvol.status === 'extreme' ? 'Extrem' : 'Normal'}</div>
                    </div>
                    <div class="volume-analysis-item">
                        <div class="volume-label">OBV Trend</div>
                        <div class="volume-value" style="color: ${obvColor}">
                            ${obvIcon} ${obv.trend === 'up' ? 'Steigend' : obv.trend === 'down' ? 'Fallend' : 'Neutral'}
                        </div>
                    </div>
                </div>
                ${divergence.divergence ? `
                    <div class="divergence-warning">
                        <span class="alert-icon">⚠️</span>
                        <span class="alert-text">
                            ${divergence.type === 'bearish' ? 'Bearish' : 'Bullish'} Divergenz: 
                            Preis und Volumen laufen auseinander
                        </span>
                    </div>
                ` : ''}
            </div>
        `;
    }

    //Add Score Breakdown
    if (window.lastConfluenceScore) {
        const breakdown = window.lastConfluenceScore.breakdown;
        html += `
            <div class="score-breakdown-section">
                <div class="breakdown-title">📊 Confluence Score Breakdown (${window.lastConfluenceScore.total}/10)</div>
                <div class="breakdown-grid">
                    <div class="breakdown-item">
                        <span class="breakdown-label">Trend</span>
                        <span class="breakdown-value">${breakdown.trend || 0}/2</span>
                    </div>
                    <div class="breakdown-item">
                        <span class="breakdown-label">Momentum</span>
                        <span class="breakdown-value">${breakdown.momentum || 0}/2</span>
                    </div>
                    <div class="breakdown-item">
                        <span class="breakdown-label">S/R Position</span>
                        <span class="breakdown-value">${breakdown.srPosition || 0}/2</span>
                    </div>
                    <div class="breakdown-item">
                        <span class="breakdown-label">Market Structure</span>
                        <span class="breakdown-value">${breakdown.marketStructure || 0}/2</span>
                    </div>
                    <div class="breakdown-item">
                        <span class="breakdown-label">Volume</span>
                        <span class="breakdown-value">${breakdown.macro || 0}/2</span>
                    </div>
                </div>
            </div>
        `;
    }

    // Add Risk Factors
    const riskFactors = [];
    const confInt = parseInt(confidence);
    if (confInt < 60) {
        riskFactors.push('Niedrige Konfidenz - erhöhtes Risiko');
    }
    if (slMatch) {
        const slPct = parseFloat(slMatch[2].replace('%', '').replace('+', '').replace('-', ''));
        if (slPct > 2) {
            riskFactors.push(`Stop Loss bei ${slPct.toFixed(1)}% - größerer möglicher Verlust`);
        }
    }
    if (recommendation !== 'ABWARTEN') {
        riskFactors.push('Kryptowährungen sind hochvolatil - nur investieren, was du verlieren kannst');
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

    if (reasons.length > 0) {
        html += `
            <div class="analysis-reasons">
                <div class="reasons-title">💡 Begründung</div>
                <ul class="reasons-list">
                    ${reasons.map(r => `<li>${r}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    html += `
        <div class="analysis-disclaimer">
            ⚠️ <strong>Disclaimer:</strong> Keine Finanzberatung. DYOR.
        </div>
    `;

    // Display
    document.getElementById('analysisContent').innerHTML = html;
    // iOS-Safe Scroll Lock
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.dataset.scrollY = scrollY; // Store for restore

    document.getElementById('analysisCardContainer').style.display = 'block';

    // Slight delay to ensure display:block is rendered before scrolling reset
    setTimeout(() => {
        document.getElementById('analysisCardContainer').scrollTop = 0;
    }, 10);

    // Scroll to analysis
    document.getElementById('analysisCardContainer').scrollIntoView({
        behavior: 'smooth',
        block: 'center'
    });
}

