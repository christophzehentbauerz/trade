/**
 * BTC Market Intelligence Dashboard
 * Real-time Bitcoin market analysis with signal generation
 */

// =====================================================
// Configuration
// =====================================================

const CONFIG = {
    refreshInterval: 300000, // 5 minutes in ms
    apis: {
        coinGecko: 'https://api.coingecko.com/api/v3',
        fearGreed: 'https://api.alternative.me/fng/',
        fearGreedCmc: 'https://pro-api.coinmarketcap.com/v3/fear-and-greed/historical',
        binance: 'https://api.binance.com/api/v3',
        binanceFutures: 'https://fapi.binance.com/fapi/v1',
        cryptoCompareNews: 'https://min-api.cryptocompare.com/data/v2/news/'
    },
    weights: {
        technical: 0.35,
        onchain: 0.25,
        sentiment: 0.20,
        macro: 0.20
    }
};

// =====================================================
// State Management
// =====================================================

let state = {
    price: null,
    priceChange24h: null,
    marketCap: null,
    volume24h: null,
    ath: null,
    athChange: null,
    fearGreedIndex: null,
    fearGreedSource: 'CoinMarketCap',
    fearGreedMode: 'cmc',
    fearGreedHistory: [],
    fundingRate: null,
    openInterest: null,
    longShortRatio: { long: null, short: null, available: false },
    priceTimestamp: null,
    priceHistoryTimestamp: null,
    fearGreedTimestamp: null,
    fearGreedIsCurrent: false,
    fundingTimestamp: null,
    openInterestTimestamp: null,
    longShortTimestamp: null,
    newsTimestamp: null,
    priceHistory: [],
    volumeHistory: [],
    scores: {
        technical: 5,
        onchain: 5,
        sentiment: 5,
        macro: 5
    },
    signal: 'NEUTRAL',
    confidence: 50,
    lastUpdate: null,
    dataQuality: {
        mode: 'loading',
        summary: 'Lade...',
        issues: [],
        warnings: []
    },
    sourceQuality: {
        status: 'loading',
        freshnessLabel: 'Lade...',
        confidence: 0,
        confidenceLabel: 'Lade...',
        reducedBy: [],
        verdict: {
            status: 'loading',
            label: 'Lade...',
            summary: 'Tagesurteil wird vorbereitet',
            blocked: true,
            restricted: true,
            reasons: []
        },
        sources: {}
    },
    newsItems: [],
    eventFilter: {
        level: 'loading',
        label: 'Lade...',
        summary: 'Event-Filter wird geladen',
        upcoming: [],
        headlines: [],
        sources: []
    }
};

const DEFAULT_TRADER_PROFILE = {
    style: 'Konservativ',
    focus: 'Intraday + Swing BTC',
    execution: 'Breakout oder Pullback',
    maxLeverage: 3,
    minRR: 2,
    maxOpenTrades: 1,
    avoidWeekends: true,
    avoidMacroRisk: true,
    preferSpotOnRiskDays: true
};

let TRADER_PROFILE = { ...DEFAULT_TRADER_PROFILE };

const EVENT_OVERRIDE_KEY = 'btc-event-risk-override';
const TRADER_PROFILE_KEY = 'btc-trader-profile';
const SIGNAL_AUDIT_COLLAPSED_KEY = 'btc-signal-audit-collapsed';
const SIGNAL_AUDIT_STATE_KEY = 'btc-signal-audit-state';
const SIGNAL_AUDIT_FILTER_KEY = 'btc-signal-audit-filter';
const CMC_CONFIG_KEY = 'btc-cmc-config';

const OFFICIAL_EVENT_SCHEDULE = [
    { id: 'fomc-2026-03', title: 'FOMC Zinsentscheid', startsAt: '2026-03-18T14:00:00-04:00', category: 'macro', source: 'Fed', url: 'https://www.federalreserve.gov/newsevents/2026-march.htm' },
    { id: 'nfp-2026-04', title: 'Employment Situation (NFP)', startsAt: '2026-04-03T08:30:00-04:00', category: 'macro', source: 'BLS', url: 'https://www.bls.gov/schedule/2026/' },
    { id: 'cpi-2026-04', title: 'Consumer Price Index (CPI)', startsAt: '2026-04-10T08:30:00-04:00', category: 'macro', source: 'BLS', url: 'https://www.bls.gov/cpi/' },
    { id: 'fomc-2026-04', title: 'FOMC Zinsentscheid', startsAt: '2026-04-29T14:00:00-04:00', category: 'macro', source: 'Fed', url: 'https://www.federalreserve.gov/newsevents/2026-04.htm' },
    { id: 'nfp-2026-05', title: 'Employment Situation (NFP)', startsAt: '2026-05-08T08:30:00-04:00', category: 'macro', source: 'BLS', url: 'https://www.bls.gov/schedule/2026/' },
    { id: 'cpi-2026-05', title: 'Consumer Price Index (CPI)', startsAt: '2026-05-12T08:30:00-04:00', category: 'macro', source: 'BLS', url: 'https://www.bls.gov/schedule/2026/' },
    { id: 'nfp-2026-06', title: 'Employment Situation (NFP)', startsAt: '2026-06-05T08:30:00-04:00', category: 'macro', source: 'BLS', url: 'https://www.bls.gov/schedule/2026/' },
    { id: 'cpi-2026-06', title: 'Consumer Price Index (CPI)', startsAt: '2026-06-10T08:30:00-04:00', category: 'macro', source: 'BLS', url: 'https://www.bls.gov/schedule/2026/' },
    { id: 'fomc-2026-06', title: 'FOMC Zinsentscheid', startsAt: '2026-06-17T14:00:00-04:00', category: 'macro', source: 'Fed', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm?mod=article_inline' },
    { id: 'nfp-2026-07', title: 'Employment Situation (NFP)', startsAt: '2026-07-02T08:30:00-04:00', category: 'macro', source: 'BLS', url: 'https://www.bls.gov/schedule/2026/' },
    { id: 'fomc-2026-07', title: 'FOMC Zinsentscheid', startsAt: '2026-07-29T14:00:00-04:00', category: 'macro', source: 'Fed', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm?mod=article_inline' },
    { id: 'fomc-2026-09', title: 'FOMC Zinsentscheid', startsAt: '2026-09-16T14:00:00-04:00', category: 'macro', source: 'Fed', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm?mod=article_inline' },
    { id: 'fomc-2026-10', title: 'FOMC Zinsentscheid', startsAt: '2026-10-28T14:00:00-04:00', category: 'macro', source: 'Fed', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm?mod=article_inline' },
    { id: 'fomc-2026-12', title: 'FOMC Zinsentscheid', startsAt: '2026-12-09T14:00:00-05:00', category: 'macro', source: 'Fed', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm?mod=article_inline' }
];

let countdownInterval = null;
let remainingSeconds = 300;
let previousSignal = 'NEUTRAL'; // Track signal changes for notifications
let dashboardUpdatePromise = null;
let queuedDashboardRefresh = false;

function calculateNeutralConfidence(weightedScore) {
    const distanceToThreshold = Math.min(
        Math.abs(weightedScore - 3.5),
        Math.abs(weightedScore - 6.5)
    );
    return Math.round(Math.max(42, Math.min(58, 42 + (distanceToThreshold * 10))));
}

function normalizeReasonCode(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48) || 'unspecified';
}

function isFiniteNumber(value) {
    return Number.isFinite(value);
}

function isPositiveFiniteNumber(value) {
    return Number.isFinite(value) && value > 0;
}

function requireArray(value, label) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`${label} payload missing`);
    }
    return value;
}

function requireFiniteNumber(value, label, { positive = false } = {}) {
    if (!Number.isFinite(value) || (positive && value <= 0)) {
        throw new Error(`${label} invalid`);
    }
    return value;
}

function getSourceModeLabel(source) {
    if (!source) return 'Unbekannt';
    if (source.fallbackUsed) return 'Fallback';
    if (source.status === 'stale') return 'Veraltet';
    if (source.id === 'eventRisk') return 'Berechnet';
    return 'Live';
}

function classifyAuditEvent(payload) {
    const signal = payload?.signal || 'NO_TRADE';
    const permission = payload?.permission || 'n/a';

    if ((signal === 'LONG' || signal === 'SHORT') && permission === 'TRADE ERLAUBT') {
        return 'trade-call';
    }
    if (permission === 'WAIT FOR CONFIRMATION' || permission === 'NUR BEI TRIGGER') {
        return 'watchlist';
    }
    return 'blocked';
}

function buildAuditChangeSummary(previousPayload, payload) {
    if (!previousPayload) {
        return 'Erster erfasster Zustand';
    }

    const changes = [];
    if (previousPayload.signal !== payload.signal) {
        changes.push(`Signal ${previousPayload.signal || 'n/a'} -> ${payload.signal}`);
    }
    if (previousPayload.permission !== payload.permission) {
        changes.push(`Freigabe ${previousPayload.permission || 'n/a'} -> ${payload.permission}`);
    }
    if ((previousPayload.stages?.trigger?.value || '') !== (payload.stages?.trigger?.value || '')) {
        changes.push(`Trigger ${previousPayload.stages?.trigger?.value || 'n/a'} -> ${payload.stages?.trigger?.value || 'n/a'}`);
    }
    if ((previousPayload.stages?.execution?.value || '') !== (payload.stages?.execution?.value || '')) {
        changes.push(`Execution ${previousPayload.stages?.execution?.value || 'n/a'} -> ${payload.stages?.execution?.value || 'n/a'}`);
    }

    return changes.length ? changes.join(' | ') : 'Kein struktureller Zustandswechsel, nur Detailupdate';
}

function getAuditSignature(payload) {
    return JSON.stringify({
        signal: payload?.signal || 'NEUTRAL',
        permission: payload?.permission || 'n/a',
        blockedReasons: payload?.blockedReasons || [],
        qualityMode: payload?.quality?.mode || 'unknown'
    });
}

function normalizeStoredAuditLog() {
    try {
        const key = 'btc_signal_audit_log';
        const rawEntries = JSON.parse(localStorage.getItem(key) || '[]');
        if (!Array.isArray(rawEntries) || !rawEntries.length) {
            return;
        }

        const chronological = rawEntries
            .filter(entry => entry && entry.payload)
            .slice()
            .reverse();

        const normalized = [];
        let previousPayload = null;
        let previousSignature = null;

        chronological.forEach(entry => {
            const payload = entry.payload || {};
            const normalizedPayload = {
                signal: payload.signal || 'NO_TRADE',
                confidence: Number.isFinite(payload.confidence) ? payload.confidence : 0,
                permission: payload.permission || 'n/a',
                quality: payload.quality || { summary: 'n/a', mode: 'unknown' },
                blockedReasons: Array.isArray(payload.blockedReasons) ? payload.blockedReasons.filter(Boolean) : [],
                stages: payload.stages || null,
                reasonCodes: Array.isArray(payload.reasonCodes) && payload.reasonCodes.length
                    ? payload.reasonCodes
                    : (Array.isArray(payload.blockedReasons) ? payload.blockedReasons.map(normalizeReasonCode).filter(Boolean) : [])
            };

            const signature = getAuditSignature(normalizedPayload);
            if (signature === previousSignature) {
                return;
            }

            normalizedPayload.eventType = classifyAuditEvent(normalizedPayload);
            normalizedPayload.changeSummary = buildAuditChangeSummary(previousPayload, normalizedPayload);

            normalized.push({
                ts: entry.ts || new Date().toISOString(),
                source: entry.source || 'dashboard',
                payload: normalizedPayload
            });

            previousPayload = normalizedPayload;
            previousSignature = signature;
        });

        const latestFirst = normalized.reverse().slice(0, 100);
        localStorage.setItem(key, JSON.stringify(latestFirst));
        if (latestFirst.length) {
            localStorage.setItem(SIGNAL_AUDIT_STATE_KEY, getAuditSignature(latestFirst[0].payload));
        } else {
            localStorage.removeItem(SIGNAL_AUDIT_STATE_KEY);
        }
    } catch (_) {
        // Ignore storage normalization failures
    }
}

function clearSignalAuditLog() {
    try {
        localStorage.removeItem('btc_signal_audit_log');
        localStorage.removeItem(SIGNAL_AUDIT_STATE_KEY);
    } catch (_) {
        // Ignore storage cleanup failures
    }
}

function logSignalSnapshot(source, payload) {
    try {
        const stateKey = SIGNAL_AUDIT_STATE_KEY;
        const signature = getAuditSignature(payload);
        const previousSignature = localStorage.getItem(stateKey);
        if (previousSignature === signature) {
            return false;
        }

        const key = 'btc_signal_audit_log';
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        const previousPayload = existing[0]?.payload || null;
        const enrichedPayload = {
            ...payload,
            eventType: classifyAuditEvent(payload),
            changeSummary: buildAuditChangeSummary(previousPayload, payload)
        };
        existing.unshift({
            ts: new Date().toISOString(),
            source,
            payload: enrichedPayload
        });
        localStorage.setItem(key, JSON.stringify(existing.slice(0, 100)));
        localStorage.setItem(stateKey, signature);
        return true;
    } catch (_) {
        // Ignore logging failures
        return false;
    }
}

function renderSignalAuditLog() {
    const el = document.getElementById('signalAuditList');
    if (!el) return;

    try {
        const entries = JSON.parse(localStorage.getItem('btc_signal_audit_log') || '[]').slice(0, 20);
        if (!entries.length) {
            el.innerHTML = '<div class=\"audit-empty\">Noch keine Audit-Einträge vorhanden.</div>';
            return;
        }

        el.innerHTML = entries.map(entry => {
            const signal = String(entry?.payload?.signal || 'NEUTRAL');
            const signalClass = signal.toLowerCase();
            const permission = entry?.payload?.permission || 'n/a';
            const quality = entry?.payload?.quality?.summary || 'n/a';
            const blocked = (entry?.payload?.blockedReasons || []).slice(0, 2).join(' | ') || 'keine';
            const time = entry?.ts ? new Date(entry.ts).toLocaleString('de-DE') : 'n/a';
            return `<div class=\"audit-item\">
                <div class=\"audit-time\">${time}</div>
                <div class=\"audit-signal ${signalClass}\">${signal.replace('_', ' ')}</div>
                <div class=\"audit-meta\"><strong>Freigabe:</strong> ${permission}<br><strong>Qualität:</strong> ${quality}<br><strong>Blocker:</strong> ${blocked}</div>
            </div>`;
        }).join('');
    } catch (_) {
        el.innerHTML = '<div class=\"audit-empty\">Audit-Log konnte nicht geladen werden.</div>';
    }
}

function renderSignalAuditLogV2() {
    const el = document.getElementById('signalAuditList');
    if (!el) return;

    try {
        const filterValue = document.getElementById('signalAuditFilter')?.value || localStorage.getItem(SIGNAL_AUDIT_FILTER_KEY) || 'all';
        const entries = JSON.parse(localStorage.getItem('btc_signal_audit_log') || '[]')
            .filter(entry => {
                const eventType = entry?.payload?.eventType || 'blocked';
                if (filterValue === 'calls') return eventType === 'trade-call';
                if (filterValue === 'watchlist') return eventType === 'watchlist';
                if (filterValue === 'blocked') return eventType === 'blocked';
                return true;
            })
            .slice(0, 20);

        if (!entries.length) {
            el.innerHTML = '<div class="audit-empty">Keine Audit-Eintraege fuer diesen Filter vorhanden.</div>';
            return;
        }

        el.innerHTML = entries.map(entry => {
            const signal = String(entry?.payload?.signal || 'NEUTRAL');
            const signalClass = signal.toLowerCase();
            const permission = entry?.payload?.permission || 'n/a';
            const quality = entry?.payload?.quality?.summary || 'n/a';
            const blocked = (entry?.payload?.blockedReasons || []).slice(0, 2).join(' | ') || 'keine';
            const time = entry?.ts ? new Date(entry.ts).toLocaleString('de-DE') : 'n/a';
            const eventType = entry?.payload?.eventType || 'blocked';
            const eventLabel = eventType === 'trade-call' ? 'Trade-Call' : eventType === 'watchlist' ? 'Beobachten' : 'Blocker';
            const changeSummary = entry?.payload?.changeSummary || 'Kein Delta';
            const reasonCodes = (entry?.payload?.reasonCodes || []).slice(0, 3);
            const triggerState = entry?.payload?.stages?.trigger?.value || 'n/a';
            const executionState = entry?.payload?.stages?.execution?.value || permission;

            return `<div class="audit-item">
                <div class="audit-time">${time}</div>
                <div class="audit-signal-wrap">
                    <div class="audit-signal ${signalClass}">${signal.replace('_', ' ')}</div>
                    <div class="audit-event ${eventType}">${eventLabel}</div>
                </div>
                <div class="audit-meta"><strong>Freigabe:</strong> ${permission}<br><strong>Einstieg/Freigabe:</strong> ${triggerState} / ${executionState}<br><strong>Qualität:</strong> ${quality}<br><strong>Änderung:</strong> ${changeSummary}<br><strong>Blocker:</strong> ${blocked}${reasonCodes.length ? `<br><strong>Codes:</strong> ${reasonCodes.join(', ')}` : ''}</div>
            </div>`;
        }).join('');
    } catch (_) {
        el.innerHTML = '<div class="audit-empty">Audit-Log konnte nicht geladen werden.</div>';
    }
}

function setSignalAuditCollapsed(collapsed) {
    const section = document.getElementById('signalAuditSection');
    const toggleBtn = document.getElementById('toggleSignalAudit');
    if (!section || !toggleBtn) return;

    section.classList.toggle('collapsed', collapsed);
    toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    toggleBtn.textContent = collapsed ? 'Signalprotokoll öffnen' : 'Signalprotokoll schließen';
}

function initSignalAuditToggle() {
    const toggleBtn = document.getElementById('toggleSignalAudit');
    if (!toggleBtn) return;

    let collapsed = true;
    try {
        const saved = localStorage.getItem(SIGNAL_AUDIT_COLLAPSED_KEY);
        collapsed = saved === null ? true : saved === 'true';
    } catch (_) {
        collapsed = true;
    }

    setSignalAuditCollapsed(collapsed);

    toggleBtn.addEventListener('click', () => {
        const nextCollapsed = !document.getElementById('signalAuditSection')?.classList.contains('collapsed');
        localStorage.setItem(SIGNAL_AUDIT_COLLAPSED_KEY, String(nextCollapsed));
        setSignalAuditCollapsed(nextCollapsed);
    });
}

function initSignalAuditFilter() {
    const filterEl = document.getElementById('signalAuditFilter');
    if (!filterEl) return;

    const savedFilter = localStorage.getItem(SIGNAL_AUDIT_FILTER_KEY) || 'all';
    filterEl.value = ['all', 'calls', 'watchlist', 'blocked'].includes(savedFilter) ? savedFilter : 'all';
    filterEl.addEventListener('change', () => {
        localStorage.setItem(SIGNAL_AUDIT_FILTER_KEY, filterEl.value);
        renderSignalAuditLogV2();
    });
}

function initSignalAuditReset() {
    const resetBtn = document.getElementById('resetSignalAudit');
    if (!resetBtn) return;

    resetBtn.addEventListener('click', () => {
        clearSignalAuditLog();
        renderSignalAuditLogV2();
    });
}

function loadTraderProfile() {
    try {
        const saved = JSON.parse(localStorage.getItem(TRADER_PROFILE_KEY) || '{}');
        TRADER_PROFILE = {
            ...DEFAULT_TRADER_PROFILE,
            ...saved
        };
    } catch (_) {
        TRADER_PROFILE = { ...DEFAULT_TRADER_PROFILE };
    }
}

function saveTraderProfile() {
    localStorage.setItem(TRADER_PROFILE_KEY, JSON.stringify(TRADER_PROFILE));
}

function updateTraderProfileUI() {
    const ids = {
        style: 'profileStyleSelect',
        execution: 'profileExecutionSelect',
        maxLeverage: 'profileMaxLeverage',
        minRR: 'profileMinRR',
        maxOpenTrades: 'profileMaxOpenTrades',
        avoidWeekends: 'profileAvoidWeekends',
        avoidMacroRisk: 'profileAvoidMacroRisk',
        preferSpotOnRiskDays: 'profilePreferSpot'
    };

    Object.entries(ids).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') {
            el.checked = Boolean(TRADER_PROFILE[key]);
        } else {
            el.value = String(TRADER_PROFILE[key]);
        }
    });
}

// =====================================================
// Notification System
// =====================================================

const NotificationSystem = {
    audioContext: null,
    notificationsEnabled: false,
    soundEnabled: true,
    alertHideTimeout: null,

    // Initialize notification permissions
    async init() {
        // Check if browser supports notifications
        if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                this.notificationsEnabled = true;
            } else if (Notification.permission !== 'denied') {
                // Will request permission when user clicks the button
            }
        }

        // Load saved preferences
        const savedPrefs = localStorage.getItem('btc-notification-prefs');
        if (savedPrefs) {
            const prefs = JSON.parse(savedPrefs);
            this.soundEnabled = prefs.soundEnabled !== false;
            this.notificationsEnabled = prefs.notificationsEnabled && Notification.permission === 'granted';
        }

        this.updateUI();
    },

    // Request notification permission
    async requestPermission() {
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            this.notificationsEnabled = permission === 'granted';
            this.savePreferences();
            this.updateUI();
            return permission === 'granted';
        }
        return false;
    },

    // Toggle notifications
    toggleNotifications() {
        if (!this.notificationsEnabled && Notification.permission !== 'granted') {
            this.requestPermission();
        } else {
            this.notificationsEnabled = !this.notificationsEnabled;
            this.savePreferences();
            this.updateUI();
        }
    },

    // Toggle sound
    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        this.savePreferences();
        this.updateUI();
    },

    // Save preferences to localStorage
    savePreferences() {
        localStorage.setItem('btc-notification-prefs', JSON.stringify({
            soundEnabled: this.soundEnabled,
            notificationsEnabled: this.notificationsEnabled
        }));
    },

    // Update UI to reflect current state
    updateUI() {
        const notifBtn = document.getElementById('toggleNotifications');
        const soundBtn = document.getElementById('toggleSound');
        const statusEl = document.getElementById('notificationStatus');

        if (notifBtn) {
            notifBtn.classList.toggle('active', this.notificationsEnabled);
            notifBtn.textContent = this.notificationsEnabled ? '🔔 Benachrichtigungen AN' : '🔕 Benachrichtigungen AUS';
        }

        if (soundBtn) {
            soundBtn.classList.toggle('active', this.soundEnabled);
            soundBtn.textContent = this.soundEnabled ? '🔊 Sound AN' : '🔇 Sound AUS';
        }

        if (statusEl) {
            if (this.notificationsEnabled || this.soundEnabled) {
                statusEl.textContent = '✅ Du wirst benachrichtigt wenn ein Trade-Signal erscheint';
                statusEl.className = 'notification-status active';
            } else {
                statusEl.textContent = '⚠️ Aktiviere Benachrichtigungen um informiert zu werden';
                statusEl.className = 'notification-status inactive';
            }
        }
    },

    // Play alert sound
    playSound(type = 'signal') {
        if (!this.soundEnabled) return;

        try {
            // Create audio context on first use
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            if (type === 'long') {
                // Ascending tones for LONG
                oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
                oscillator.frequency.setValueAtTime(550, this.audioContext.currentTime + 0.1);
                oscillator.frequency.setValueAtTime(660, this.audioContext.currentTime + 0.2);
            } else if (type === 'short') {
                // Descending tones for SHORT
                oscillator.frequency.setValueAtTime(660, this.audioContext.currentTime);
                oscillator.frequency.setValueAtTime(550, this.audioContext.currentTime + 0.1);
                oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime + 0.2);
            } else {
                // Simple beep
                oscillator.frequency.setValueAtTime(520, this.audioContext.currentTime);
            }

            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.4);

            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.4);
        } catch (e) {
            console.log('Sound not available:', e);
        }
    },

    // Send browser notification
    sendNotification(title, body, type = 'signal') {
        if (!this.notificationsEnabled || Notification.permission !== 'granted') return;

        const icon = type === 'long' ? '🟢' : type === 'short' ? '🔴' : '📊';

        const notification = new Notification(title, {
            body: body,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">' + icon + '</text></svg>',
            badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">₿</text></svg>',
            tag: 'btc-signal',
            requireInteraction: true
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
        };

        // Auto close after 30 seconds
        setTimeout(() => notification.close(), 30000);
    },

    // Check for signal change and notify
    checkSignalChange(newSignal, confidence, price, source = 'Coach-Konfluenz', context = {}) {
        if (previousSignal === newSignal) return;

        const oldSignal = previousSignal;
        previousSignal = newSignal;
        const permission = context.permission || 'n/a';
        const tradeAllowed = permission === 'TRADE ERLAUBT';

        // Only notify on first load if it's not neutral
        if (oldSignal === 'NEUTRAL' && newSignal === 'NEUTRAL') return;

        // Notify on LONG or SHORT signal
        if (newSignal === 'LONG' && tradeAllowed) {
            const title = 'LONG Signal erkannt';
            const body = `BTC: $${price.toLocaleString()} | Konfidenz: ${Math.round(confidence)}% | Quelle: ${source}`;

            this.playSound('long');
            this.sendNotification(title, body, 'long');
            this.showInPageAlert('long', confidence, price, source);

        } else if (newSignal === 'SHORT' && tradeAllowed) {
            const title = 'SHORT Signal erkannt';
            const body = `BTC: $${price.toLocaleString()} | Konfidenz: ${Math.round(confidence)}% | Quelle: ${source}`;

            this.playSound('short');
            this.sendNotification(title, body, 'short');
            this.showInPageAlert('short', confidence, price, source);

        } else if (
            (newSignal === 'NEUTRAL' || !tradeAllowed) &&
            (oldSignal === 'LONG' || oldSignal === 'SHORT')
        ) {
            // Signal changed from active to neutral
            const title = 'Signal zurueckgesetzt';
            const body = tradeAllowed
                ? 'Das aktive Signal ist wieder neutral geworden.'
                : `Signal ist nicht handelbar: ${permission}`;

            this.sendNotification(title, body, 'neutral');
        }
    },

    // Show in-page alert popup
    hideInPageAlert(immediate = false) {
        const alertBox = document.getElementById('signalAlert');
        if (!alertBox) return;

        if (this.alertHideTimeout) {
            clearTimeout(this.alertHideTimeout);
            this.alertHideTimeout = null;
        }

        alertBox.classList.remove('show');

        const cleanup = () => {
            if (!alertBox.classList.contains('show')) {
                alertBox.innerHTML = '';
            }
        };

        if (immediate) {
            cleanup();
            return;
        }

        window.setTimeout(cleanup, 360);
    },

    showInPageAlert(type, confidence, price, source = 'Coach-Konfluenz') {
        const alertBox = document.getElementById('signalAlert');
        if (!alertBox) return;

        this.hideInPageAlert(true);

        const emoji = type === 'long' ? 'LONG' : 'SHORT';
        const signal = type === 'long' ? 'LONG' : 'SHORT';
        const color = type === 'long' ? 'bullish' : 'bearish';

        alertBox.className = `signal-alert ${color}`;
        alertBox.innerHTML = `
            <div class="alert-content">
                <div class="alert-icon">${emoji}</div>
                <div class="alert-text">
                    <div class="alert-title">Neues ${signal} Signal!</div>
                    <div class="alert-details">BTC: $${price.toLocaleString()} | Konfidenz: ${Math.round(confidence)}%</div>
                    <div class="alert-details">Quelle: ${source}</div>
                </div>
                <button class="alert-close" type="button" aria-label="Signal schliessen">x</button>
            </div>
        `;

        const closeBtn = alertBox.querySelector('.alert-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideInPageAlert());
        }

        alertBox.classList.add('show');

        // Auto hide after 10 seconds
        this.alertHideTimeout = window.setTimeout(() => {
            this.hideInPageAlert();
        }, 10000);
    }
};

// =====================================================
// API Fetch Functions
// =====================================================

function getCoinMarketCapConfig() {
    const fileConfig = window.CMC_CONFIG || {};
    let storedConfig = {};

    try {
        storedConfig = JSON.parse(localStorage.getItem(CMC_CONFIG_KEY) || '{}');
    } catch (_) {
        storedConfig = {};
    }

    const hostedDefaultProxy = typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol)
        ? '/api/cmc/fear-and-greed/historical'
        : '';

    return {
        apiKey: fileConfig.apiKey || storedConfig.apiKey || '',
        proxyUrl: fileConfig.proxyUrl || storedConfig.proxyUrl || hostedDefaultProxy,
        allowBrowserKey: Boolean(fileConfig.allowBrowserKey || storedConfig.allowBrowserKey)
    };
}

function parseFearGreedTimestamp(timestamp) {
    if (timestamp === null || timestamp === undefined || timestamp === '') return null;

    if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
        return timestamp > 1e12 ? timestamp : timestamp * 1000;
    }

    if (typeof timestamp === 'string') {
        const trimmed = timestamp.trim();
        if (/^\d+$/.test(trimmed)) {
            const numeric = Number.parseInt(trimmed, 10);
            return numeric > 1e12 ? numeric : numeric * 1000;
        }

        const parsed = Date.parse(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function getUtcDateKey(input = Date.now()) {
    const date = new Date(input);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function normalizeFearGreedHistoryItem(item) {
    const timestampMs = parseFearGreedTimestamp(item?.timestamp);
    return {
        value: Number(item?.value),
        classification: item?.classification || 'Unknown',
        timestamp: item?.timestamp ?? null,
        timestampMs,
        utcDateKey: timestampMs ? getUtcDateKey(timestampMs) : null
    };
}

function finalizeFearGreedPayload(source, history) {
    const normalizedHistory = history
        .map(normalizeFearGreedHistoryItem)
        .filter(item => Number.isFinite(item.value) && item.value >= 0 && item.value <= 100)
        .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0))
        .slice(0, 7);

    if (!normalizedHistory.length) return null;

    const todayUtc = getUtcDateKey();
    const currentItem = normalizedHistory.find(item => item.utcDateKey === todayUtc) || normalizedHistory[0];

    return {
        source,
        current: Math.round(currentItem.value),
        currentTimestamp: currentItem.timestamp,
        isCurrent: currentItem.utcDateKey === todayUtc,
        history: normalizedHistory.map(({ value, classification, timestamp }) => ({
            value,
            classification,
            timestamp
        }))
    };
}

function getMinutesOld(timestampMs) {
    if (!Number.isFinite(timestampMs)) return null;
    return Math.max(0, (Date.now() - timestampMs) / 60000);
}

function classifyRecencyStatus(timestampMs, freshMinutes, staleMinutes) {
    const ageMinutes = getMinutesOld(timestampMs);
    if (ageMinutes === null) return 'missing';
    if (ageMinutes <= freshMinutes) return 'fresh';
    if (ageMinutes <= staleMinutes) return 'stale';
    return 'missing';
}

function buildSourceEntry({
    id,
    label,
    source,
    rawTimestamp = null,
    normalizedTimestamp = null,
    status = 'missing',
    usedInScoring = false,
    fallbackUsed = false,
    critical = false,
    notes = [],
    value = null
}) {
    return {
        id,
        label,
        source: source || 'unbekannt',
        rawTimestamp,
        normalizedTimestamp,
        status,
        usedInScoring,
        fallbackUsed,
        critical,
        notes: notes.filter(Boolean),
        value,
        confidenceImpact: 0
    };
}

function deriveConfidenceImpact(source) {
    const basePenalty = source.critical
        ? { fresh: 0, degraded: 4, stale: 10, missing: 20, invalid: 26 }
        : { fresh: 0, degraded: 3, stale: 6, missing: 10, invalid: 14 };

    return basePenalty[source.status] ?? 12;
}

function getConfidenceLabel(score) {
    if (score >= 85) return 'Hoch';
    if (score >= 65) return 'Mittel';
    if (score >= 40) return 'Niedrig';
    return 'Sehr niedrig';
}

function getFreshnessLabel(status) {
    if (status === 'fresh') return 'Frisch';
    if (status === 'degraded') return 'Fallback';
    if (status === 'stale') return 'Teilweise veraltet';
    if (status === 'invalid') return 'Ungueltig';
    if (status === 'missing') return 'Unvollstaendig';
    return 'Lade...';
}

function describeSourceStatus(source) {
    if (source.status === 'fresh') return `${source.label} ist aktuell`;
    if (source.status === 'degraded') return `${source.label} nutzt Fallback-Daten`;
    if (source.status === 'stale') return `${source.label} ist veraltet`;
    if (source.status === 'invalid') return `${source.label} ist unplausibel`;
    return `${source.label} fehlt`;
}

function buildSourceQualityModel(fetchResults = []) {
    const [priceOk, historyOk, fgOk, fundingOk, oiOk, lsOk, newsOk] = fetchResults;
    const nowIso = new Date().toISOString();
    const priceTimestampMs = parseFearGreedTimestamp(state.priceTimestamp);
    const historyTimestampMs = parseFearGreedTimestamp(state.priceHistoryTimestamp);
    const fearGreedTimestampMs = parseFearGreedTimestamp(state.fearGreedTimestamp);
    const fundingTimestampMs = parseFearGreedTimestamp(state.fundingTimestamp);
    const openInterestTimestampMs = parseFearGreedTimestamp(state.openInterestTimestamp);
    const longShortTimestampMs = parseFearGreedTimestamp(state.longShortTimestamp);
    const newsTimestampMs = parseFearGreedTimestamp(state.newsTimestamp);
    const calendarFutureCount = OFFICIAL_EVENT_SCHEDULE.filter(event => new Date(event.startsAt).getTime() >= Date.now()).length;
    const fearGreedUsesFallback = state.fearGreedSource.includes('Fallback')
        || (state.fearGreedMode === 'cmc' && state.fearGreedSource.includes('Alternative.me'));

    const sources = {
        btcPrice: buildSourceEntry({
            id: 'btcPrice',
            label: 'Bitcoin-Preis',
            source: 'CoinGecko',
            rawTimestamp: state.priceTimestamp,
            normalizedTimestamp: priceTimestampMs ? new Date(priceTimestampMs).toISOString() : null,
            status: !priceOk ? 'missing' : (!Number.isFinite(state.price) || state.price <= 0 ? 'invalid' : classifyRecencyStatus(priceTimestampMs, 180, 720)),
            usedInScoring: priceOk && Number.isFinite(state.price) && state.price > 0,
            critical: true,
            notes: !priceOk ? ['Fetch fehlgeschlagen'] : []
        }),
        priceChange24h: buildSourceEntry({
            id: 'priceChange24h',
            label: '24h-Veraenderung',
            source: 'CoinGecko',
            rawTimestamp: state.priceTimestamp,
            normalizedTimestamp: priceTimestampMs ? new Date(priceTimestampMs).toISOString() : null,
            status: !priceOk ? 'missing' : (!Number.isFinite(state.priceChange24h) ? 'invalid' : classifyRecencyStatus(priceTimestampMs, 180, 720)),
            usedInScoring: priceOk && Number.isFinite(state.priceChange24h),
            critical: true
        }),
        athDistance: buildSourceEntry({
            id: 'athDistance',
            label: 'ATH / ATH-Distanz',
            source: 'CoinGecko',
            rawTimestamp: state.priceTimestamp,
            normalizedTimestamp: priceTimestampMs ? new Date(priceTimestampMs).toISOString() : null,
            status: !priceOk ? 'missing' : (!Number.isFinite(state.ath) || !Number.isFinite(state.athChange) || state.ath <= 0 ? 'invalid' : classifyRecencyStatus(priceTimestampMs, 180, 720)),
            usedInScoring: priceOk && Number.isFinite(state.ath) && Number.isFinite(state.athChange),
            critical: true
        }),
        priceHistory: buildSourceEntry({
            id: 'priceHistory',
            label: 'Preis-Historie',
            source: 'CoinGecko',
            rawTimestamp: state.priceHistoryTimestamp,
            normalizedTimestamp: historyTimestampMs ? new Date(historyTimestampMs).toISOString() : null,
            status: !historyOk ? 'missing' : (!Array.isArray(state.priceHistory) || state.priceHistory.length < 10 ? 'invalid' : classifyRecencyStatus(historyTimestampMs, 1440, 2880)),
            usedInScoring: historyOk && Array.isArray(state.priceHistory) && state.priceHistory.length >= 10,
            critical: true
        }),
        fearGreed: buildSourceEntry({
            id: 'fearGreed',
            label: 'Fear & Greed',
            source: state.fearGreedSource,
            rawTimestamp: state.fearGreedTimestamp,
            normalizedTimestamp: fearGreedTimestampMs ? new Date(fearGreedTimestampMs).toISOString() : null,
            status: !fgOk
                ? 'missing'
                : (!Number.isFinite(state.fearGreedIndex) || state.fearGreedIndex < 0 || state.fearGreedIndex > 100
                    ? 'invalid'
                    : (state.fearGreedIsCurrent
                        ? (fearGreedUsesFallback || state.fearGreedSource.includes('CMC nicht') ? 'degraded' : 'fresh')
                        : 'stale')),
            usedInScoring: fgOk && Number.isFinite(state.fearGreedIndex) && state.fearGreedIsCurrent,
            fallbackUsed: fearGreedUsesFallback,
            critical: true,
            notes: state.fearGreedIsCurrent ? [] : ['nicht vom aktuellen UTC-Tag']
        }),
        fundingRate: buildSourceEntry({
            id: 'fundingRate',
            label: 'Funding Rate',
            source: 'Binance Futures',
            rawTimestamp: state.fundingTimestamp,
            normalizedTimestamp: fundingTimestampMs ? new Date(fundingTimestampMs).toISOString() : null,
            status: !fundingOk ? 'missing' : (!Number.isFinite(state.fundingRate) ? 'invalid' : classifyRecencyStatus(fundingTimestampMs, 720, 1440)),
            usedInScoring: fundingOk && Number.isFinite(state.fundingRate),
            critical: false
        }),
        openInterest: buildSourceEntry({
            id: 'openInterest',
            label: 'Open Interest',
            source: 'Binance Futures',
            rawTimestamp: state.openInterestTimestamp,
            normalizedTimestamp: openInterestTimestampMs ? new Date(openInterestTimestampMs).toISOString() : null,
            status: !oiOk ? 'missing' : (!Number.isFinite(state.openInterest) || state.openInterest <= 0 ? 'invalid' : classifyRecencyStatus(openInterestTimestampMs, 60, 240)),
            usedInScoring: oiOk && Number.isFinite(state.openInterest) && state.openInterest > 0,
            critical: false
        }),
        longShortRatio: buildSourceEntry({
            id: 'longShortRatio',
            label: 'Long/Short-Ratio',
            source: 'Binance Futures',
            rawTimestamp: state.longShortTimestamp,
            normalizedTimestamp: longShortTimestampMs ? new Date(longShortTimestampMs).toISOString() : null,
            status: !lsOk ? 'missing' : (!state.longShortRatio.available || !Number.isFinite(state.longShortRatio.long) || !Number.isFinite(state.longShortRatio.short) ? 'invalid' : classifyRecencyStatus(longShortTimestampMs, 180, 480)),
            usedInScoring: lsOk && state.longShortRatio.available,
            critical: true,
            notes: lsOk ? [] : ['kein Ersatzwert erlaubt']
        }),
        eventRisk: buildSourceEntry({
            id: 'eventRisk',
            label: 'Event-Risk',
            source: 'Fed/BLS + CryptoCompare',
            rawTimestamp: nowIso,
            normalizedTimestamp: nowIso,
            status: calendarFutureCount === 0 ? 'stale' : (!newsOk ? 'degraded' : 'fresh'),
            usedInScoring: true,
            fallbackUsed: !newsOk,
            critical: false,
            notes: !newsOk ? ['News-Feed fehlt, Kalender-only Modus'] : []
        })
    };

    const reducedBy = [];
    let confidence = 100;

    Object.values(sources).forEach(source => {
        const impact = deriveConfidenceImpact(source);
        source.confidenceImpact = impact;
        confidence -= impact;
        if (impact > 0) {
            reducedBy.push(`${describeSourceStatus(source)} (-${impact})`);
        }
    });

    const criticalNotFresh = Object.values(sources).filter(source => source.critical && source.status !== 'fresh');
    const criticalBroken = Object.values(sources).filter(source => source.critical && (source.status === 'missing' || source.status === 'invalid'));
    if (criticalNotFresh.length >= 2) {
        confidence -= 5;
        reducedBy.push(`Mehrere kritische Quellen nicht frisch (-5)`);
    }

    confidence = Math.max(0, Math.min(100, Math.round(confidence)));

    const blocked = sources.btcPrice.status === 'missing'
        || sources.btcPrice.status === 'invalid'
        || sources.priceHistory.status === 'missing'
        || sources.priceHistory.status === 'invalid'
        || criticalBroken.length >= 2
        || confidence < 25;
    const restricted = !blocked && (
        confidence < 55
        || ['stale', 'missing', 'invalid'].includes(sources.fearGreed.status)
        || ['stale', 'missing', 'invalid'].includes(sources.longShortRatio.status)
        || criticalNotFresh.length > 0
    );

    const verdictReasons = [];
    if (!sources.fearGreed.usedInScoring) verdictReasons.push('Fear & Greed fliesst heute nicht voll in den Score ein');
    if (!sources.longShortRatio.usedInScoring) verdictReasons.push('Long/Short-Ratio fehlt oder ist unplausibel');
    if (sources.eventRisk.status === 'degraded') verdictReasons.push('Event-Risk laeuft ohne News-Feed nur im Kalender-Modus');
    if (blocked && confidence < 35) verdictReasons.push('Die Datengrundlage ist fuer ein belastbares Tagesurteil zu schwach');

    return {
        status: blocked ? 'blocked' : restricted ? 'restricted' : 'robust',
        freshnessLabel: getFreshnessLabel(blocked ? 'missing' : restricted ? 'stale' : 'fresh'),
        confidence,
        confidenceLabel: getConfidenceLabel(confidence),
        reducedBy,
        verdict: {
            status: blocked ? 'blocked' : restricted ? 'restricted' : 'robust',
            label: blocked ? 'Kein belastbares Urteil' : restricted ? 'Urteil eingeschraenkt' : 'Urteil belastbar',
            summary: blocked
                ? 'Kritische Signaldaten fehlen oder sind zu schwach.'
                : restricted
                    ? 'Das Tagesurteil ist nutzbar, aber nur mit Vorbehalt.'
                    : 'Alle Kerndaten sind frisch und plausibel.',
            blocked,
            restricted,
            reasons: verdictReasons
        },
        sources
    };
}

function isSourceUsable(id) {
    const source = state.sourceQuality?.sources?.[id];
    return Boolean(source?.usedInScoring);
}

function getEffectiveFearGreedValue() {
    return isSourceUsable('fearGreed') && Number.isFinite(state.fearGreedIndex)
        ? state.fearGreedIndex
        : null;
}

async function fetchWithTimeout(url, timeout = 10000, options = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

async function fetchPriceData() {
    try {
        const data = await fetchWithTimeout(
            `${CONFIG.apis.coinGecko}/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false`
        );

        const marketData = data?.market_data;
        state.price = requireFiniteNumber(Number(marketData?.current_price?.usd), 'CoinGecko price', { positive: true });
        state.priceChange24h = requireFiniteNumber(Number(marketData?.price_change_percentage_24h), 'CoinGecko 24h change');
        state.marketCap = requireFiniteNumber(Number(marketData?.market_cap?.usd), 'CoinGecko market cap', { positive: true });
        state.volume24h = requireFiniteNumber(Number(marketData?.total_volume?.usd), 'CoinGecko volume', { positive: true });
        state.ath = requireFiniteNumber(Number(marketData?.ath?.usd), 'CoinGecko ATH', { positive: true });
        state.athChange = requireFiniteNumber(Number(marketData?.ath_change_percentage?.usd), 'CoinGecko ATH change');
        state.priceTimestamp = data?.last_updated || marketData?.last_updated || new Date().toISOString();

        return true;
    } catch (error) {
        console.error('Error fetching price data:', error);
        state.price = null;
        state.priceChange24h = null;
        state.marketCap = null;
        state.volume24h = null;
        state.ath = null;
        state.athChange = null;
        state.priceTimestamp = null;
        return false;
    }
}

async function fetchPriceHistory() {
    try {
        const data = await fetchWithTimeout(
            `${CONFIG.apis.coinGecko}/coins/bitcoin/market_chart?vs_currency=usd&days=14&interval=daily`
        );

        const prices = requireArray(data?.prices, 'CoinGecko history');
        if (prices.length < 10) throw new Error('CoinGecko history too short');

        state.priceHistory = prices.map(point => requireFiniteNumber(Number(point?.[1]), 'CoinGecko history point', { positive: true }));
        state.priceHistoryTimestamp = prices.length
            ? new Date(prices[prices.length - 1][0]).toISOString()
            : null;

        // Store full historical data for advanced analysis (Volume, OBV, etc.)
        window.historicalData = data;
        if (Array.isArray(data?.total_volumes)) {
            state.volumeHistory = data.total_volumes.map(point => {
                const volume = Number(point?.[1]);
                return Number.isFinite(volume) ? volume : 0;
            });
        }

        return true;
    } catch (error) {
        console.error('Error fetching price history:', error);
        state.priceHistory = [];
        state.volumeHistory = [];
        state.priceHistoryTimestamp = null;
        return false;
    }
}

async function fetchFearGreedIndex() {
    const cmcConfig = getCoinMarketCapConfig();
    const mapAlternativeFearGreed = (payload) => {
        if (!payload?.data?.length) return null;
        return finalizeFearGreedPayload('Alternative.me', payload.data.slice(0, 7).map(d => ({
                value: parseInt(d.value, 10),
                classification: d.value_classification || 'Unknown',
                timestamp: d.timestamp
            })));
    };

    const mapCmcFearGreed = (payload) => {
        const rows =
            payload?.data?.points ||
            payload?.data?.items ||
            payload?.data?.list ||
            payload?.data;

        if (!Array.isArray(rows) || rows.length === 0) return null;

        return finalizeFearGreedPayload('CoinMarketCap', rows.map(row => ({
                value: Number(row.value ?? row.score ?? row.index),
                classification: row.value_classification || row.label || row.name || 'Unknown',
                timestamp: row.timestamp || row.time || row.date || row.createdAt || null
            })));
    };

    try {
        const mode = state.fearGreedMode || 'cmc';
        let cmc = null;
        let alt = null;

        try {
            const cmcUrl = cmcConfig.proxyUrl
                ? `${cmcConfig.proxyUrl.replace(/\/$/, '')}?limit=8`
                : `${CONFIG.apis.fearGreedCmc}?limit=8`;
            const cmcHeaders = cmcConfig.apiKey && !cmcConfig.proxyUrl && cmcConfig.allowBrowserKey
                ? { 'X-CMC_PRO_API_KEY': cmcConfig.apiKey }
                : {};

            if (cmcConfig.proxyUrl || (cmcConfig.apiKey && cmcConfig.allowBrowserKey)) {
                const cmcData = await fetchWithTimeout(cmcUrl, 8000, {
                    headers: cmcHeaders
                });
                cmc = mapCmcFearGreed(cmcData);
            }
        } catch (cmcError) {
            console.warn('CMC Fear & Greed unavailable:', cmcError?.message || cmcError);
        }

        try {
            const altData = await fetchWithTimeout(`${CONFIG.apis.fearGreed}?limit=8`, 10000);
            alt = mapAlternativeFearGreed(altData);
        } catch (altError) {
            console.warn('Alternative.me Fear & Greed unavailable:', altError?.message || altError);
        }

        let normalized = null;

        if (mode === 'cmc' && cmc?.isCurrent) {
            normalized = cmc;
        } else if (mode === 'cmc' && cmc) {
            normalized = {
                ...cmc,
                source: 'CoinMarketCap (nicht aktuell fuer heute)',
                isCurrent: false
            };
        } else if (mode === 'cmc') {
            normalized = {
                source: cmcConfig.proxyUrl || cmcConfig.apiKey
                    ? 'CoinMarketCap (nicht verfuegbar)'
                    : 'CoinMarketCap (API-Key oder Proxy fehlt)',
                current: null,
                currentTimestamp: null,
                isCurrent: false,
                history: []
            };
        } else if (mode === 'alt' && alt) {
            normalized = alt;
        } else if (mode === 'avg' && cmc && alt && cmc.isCurrent && alt.isCurrent) {
            const combinedHistory = [];
            const maxLen = Math.min(cmc.history.length, alt.history.length);
            for (let i = 0; i < maxLen; i++) {
                const value = Math.round((cmc.history[i].value + alt.history[i].value) / 2);
                combinedHistory.push({
                    value,
                    classification: 'AVG',
                    timestamp: cmc.history[i].timestamp || alt.history[i].timestamp
                });
            }

            normalized = {
                source: 'AVG (CMC + Alternative)',
                current: combinedHistory[0]?.value ?? Math.round((cmc.current + alt.current) / 2),
                currentTimestamp: combinedHistory[0]?.timestamp ?? cmc.currentTimestamp ?? alt.currentTimestamp ?? null,
                isCurrent: true,
                history: combinedHistory.length ? combinedHistory : [ { value: Math.round((cmc.current + alt.current) / 2), classification: 'AVG', timestamp: null } ]
            };
        } else {
            normalized = (cmc?.isCurrent ? cmc : null) || (alt?.isCurrent ? alt : null) || cmc || alt;
            if (normalized) {
                normalized = {
                    ...normalized,
                    source: `${normalized.source} (Fallback)`
                };
            }
        }

        if (!normalized) throw new Error('No usable Fear & Greed payload');

        state.fearGreedIndex = normalized.current;
        state.fearGreedHistory = normalized.history;
        state.fearGreedSource = normalized.source;
        state.fearGreedTimestamp = normalized.currentTimestamp || null;
        state.fearGreedIsCurrent = Boolean(normalized.isCurrent);
        return true;
    } catch (error) {
        console.error('Error fetching Fear & Greed:', error);
        state.fearGreedIndex = null;
        state.fearGreedHistory = [];
        state.fearGreedSource = 'Keine aktuelle Quelle';
        state.fearGreedTimestamp = null;
        state.fearGreedIsCurrent = false;
        return false;
    }
}

async function fetchFundingRate() {
    try {
        const data = await fetchWithTimeout(
            `${CONFIG.apis.binanceFutures}/fundingRate?symbol=BTCUSDT&limit=1`
        );

        const rows = requireArray(data, 'Funding rate');
        const latest = rows[0];
        state.fundingRate = requireFiniteNumber(Number(latest?.fundingRate), 'Funding rate') * 100;
        state.fundingTimestamp = latest?.fundingTime || null;
        return true;
    } catch (error) {
        console.error('Error fetching funding rate:', error);
        state.fundingRate = null;
        state.fundingTimestamp = null;
        return false;
    }
}

async function fetchOpenInterest() {
    try {
        const data = await fetchWithTimeout(
            `${CONFIG.apis.binanceFutures}/openInterest?symbol=BTCUSDT`
        );

        const openInterestContracts = requireFiniteNumber(Number(data?.openInterest), 'Open interest', { positive: true });
        if (!isPositiveFiniteNumber(state.price)) {
            throw new Error('Open interest requires live BTC price');
        }
        state.openInterest = openInterestContracts * state.price;
        state.openInterestTimestamp = data?.time || null;
        return true;
    } catch (error) {
        console.error('Error fetching open interest:', error);
        state.openInterest = null;
        state.openInterestTimestamp = null;
        return false;
    }
}

async function fetchLongShortRatio() {
    try {
        const data = await fetchWithTimeout(
            `${CONFIG.apis.binanceFutures.replace('/fapi/v1', '/futures/data')}/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1`
        );

        const rows = requireArray(data, 'Long/Short ratio');
        const latest = rows[0];
        const ratio = requireFiniteNumber(Number(latest?.longShortRatio), 'Long/Short ratio', { positive: true });
        const longPercent = (ratio / (1 + ratio)) * 100;
        const shortPercent = 100 - longPercent;
        requireFiniteNumber(longPercent, 'Long percentage');
        requireFiniteNumber(shortPercent, 'Short percentage');

        state.longShortRatio = {
            long: longPercent,
            short: shortPercent,
            available: true
        };
        state.longShortTimestamp = latest?.timestamp || null;
        return true;
    } catch (error) {
        console.error('Error fetching L/S ratio:', error);
        state.longShortRatio = { long: null, short: null, available: false };
        state.longShortTimestamp = null;
        return false;
    }
}

async function fetchCryptoNews() {
    try {
        const data = await fetchWithTimeout(
            `${CONFIG.apis.cryptoCompareNews}?lang=EN&categories=BTC,Regulation,Market&excludeCategories=Sponsored`,
            10000
        );

        const newsRows = requireArray(data?.Data, 'CryptoCompare news');
        state.newsItems = newsRows.slice(0, 12).map(item => ({
                title: item?.title || 'Untitled',
                source: item?.source_info?.name || item?.source || 'CryptoCompare',
                url: item?.url || '',
                publishedAt: item?.published_on ? new Date(item.published_on * 1000).toISOString() : null
            }))
            .filter(item => item.title && item.publishedAt);
        state.newsTimestamp = state.newsItems[0]?.publishedAt || null;

        return state.newsItems.length > 0;
    } catch (error) {
        console.error('Error fetching crypto news:', error);
        state.newsItems = [];
        state.newsTimestamp = null;
        return false;
    }
}

// =====================================================
// Technical Analysis Calculations
// =====================================================

function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = prices.length - period; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
    }

    if (losses === 0) return 100;

    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgGain / avgLoss;

    return 100 - (100 / (1 + rs));
}

function calculateEMA(prices, period) {
    if (prices.length === 0) return 0;

    const multiplier = 2 / (period + 1);
    let ema = prices[0];

    for (let i = 1; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
    }

    return ema;
}

function calculateVolatility(prices) {
    if (prices.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
        returns.push((prices[i] - prices[i - 1]) / prices[i - 1] * 100);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

    return Math.sqrt(variance);
}

function determineTrend(prices) {
    if (prices.length < 7) return 'sideways';

    const recent = prices.slice(-7);
    const older = prices.slice(-14, -7);

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    const change = ((recentAvg - olderAvg) / olderAvg) * 100;

    if (change > 3) return 'up';
    if (change < -3) return 'down';
    return 'sideways';
}

// =====================================================
// Score Calculation
// =====================================================

function calculateScores() {
    const effectiveFearGreed = getEffectiveFearGreedValue();

    // Technical Score
    const rsi = calculateRSI(state.priceHistory);
    let techScore = 5;

    // RSI scoring
    if (rsi < 30) techScore += 2.5; // Oversold = bullish
    else if (rsi > 70) techScore -= 2.5; // Overbought = bearish
    else if (rsi < 40) techScore += 1;
    else if (rsi > 60) techScore -= 1;

    // Trend scoring
    const trend = determineTrend(state.priceHistory);
    if (trend === 'up') techScore += 1.5;
    else if (trend === 'down') techScore -= 1.5;

    // ATH distance
    if (state.athChange > -20) techScore += 0.5;
    else if (state.athChange < -40) techScore -= 1;

    state.scores.technical = Math.max(0, Math.min(10, techScore));

    // Sentiment Score (including Fear & Greed as contrarian)
    let sentimentScore = 5;

    // Fear & Greed as contrarian indicator
    if (Number.isFinite(effectiveFearGreed)) {
        if (effectiveFearGreed <= 20) sentimentScore += 3; // Extreme fear = buy
        else if (effectiveFearGreed <= 35) sentimentScore += 1.5;
        else if (effectiveFearGreed >= 80) sentimentScore -= 3; // Extreme greed = sell
        else if (effectiveFearGreed >= 65) sentimentScore -= 1.5;
    }

    // Funding rate
    if (Number.isFinite(state.fundingRate)) {
        if (state.fundingRate < -0.01) sentimentScore += 1.5; // Negative = bullish
        else if (state.fundingRate > 0.05) sentimentScore -= 1.5; // High positive = bearish
    }

    // Long/Short ratio (contrarian)
    if (state.longShortRatio.available && state.longShortRatio.short > 55) sentimentScore += 1; // More shorts = bullish
    else if (state.longShortRatio.available && state.longShortRatio.long > 55) sentimentScore -= 1; // More longs = bearish

    state.scores.sentiment = Math.max(0, Math.min(10, sentimentScore));

    // On-Chain Score (simplified without real on-chain data)
    // Using price momentum and volume as proxy
    let onchainScore = 5;

    if (state.priceChange24h > 5) onchainScore += 1;
    else if (state.priceChange24h < -5) onchainScore -= 1;

    // Volume analysis (higher volume on up days is bullish)
    if (state.priceChange24h > 0 && state.volume24h > state.marketCap * 0.03) {
        onchainScore += 0.5;
    }

    state.scores.onchain = Math.max(0, Math.min(10, onchainScore));

    // Macro & Volume Score
    // Replaces pure Macro. Includes OBV, RVOL and ATH distance.
    let macroScore = 5;

    // Price relative to ATH (Macro Context)
    if (state.athChange > -15) macroScore += 1;
    else if (state.athChange < -50) macroScore -= 1.5;
    else if (state.athChange < -30) macroScore -= 0.5;

    // Volume Analysis (if available)
    if (window.historicalData && window.historicalData.total_volumes && typeof calculateOBV === 'function') {
        const volumes = window.historicalData.total_volumes.map(v => v[1]);
        const obvPrices = state.priceHistory.slice(-30);
        const obvVols = volumes.slice(-30);

        const obvResult = calculateOBV(obvPrices, obvVols);

        // OBV Trend Impact
        if (obvResult.trend === 'up') macroScore += 1.5;
        else if (obvResult.trend === 'down') macroScore -= 1.5;

        // RVOL Impact (Intensity)
        const currentVol = state.volume24h;
        const rvolResult = calculateRVOL(currentVol, volumes);

        if (rvolResult.ratio > 1.5) {
            // High volume validates the move
            if (state.priceChange24h > 0) macroScore += 1;
            else macroScore -= 1;
        }
    }

    state.scores.macro = Math.max(0, Math.min(10, macroScore));

    // Calculate weighted total
    const weightedScore =
        state.scores.technical * CONFIG.weights.technical +
        state.scores.onchain * CONFIG.weights.onchain +
        state.scores.sentiment * CONFIG.weights.sentiment +
        state.scores.macro * CONFIG.weights.macro;

    // Determine signal and confidence
    if (weightedScore >= 6.5) {
        state.signal = 'LONG';
        state.confidence = Math.min(85, 50 + (weightedScore - 5) * 7);
    } else if (weightedScore <= 3.5) {
        state.signal = 'SHORT';
        state.confidence = Math.min(85, 50 + (5 - weightedScore) * 7);
    } else {
        state.signal = 'NEUTRAL';
        state.confidence = calculateNeutralConfidence(weightedScore);
    }

    return weightedScore;
}

// =====================================================
// UI Update Functions
// =====================================================

function formatNumber(num, decimals = 2) {
    if (num === null || num === undefined) return '--';
    return num.toLocaleString('de-DE', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatCurrency(num) {
    if (num === null || num === undefined) return '$--';

    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;

    return `$${formatNumber(num)}`;
}

function updatePriceCard() {
    const changeEl = document.getElementById('priceChange');
    const changeValue = changeEl.querySelector('.change-value');
    const fearGreedTickerEl = document.getElementById('tickerFearGreed');
    document.getElementById('btcPrice').textContent = Number.isFinite(state.price) ? formatNumber(state.price, 0) : 'Nicht verfuegbar';
    if (Number.isFinite(state.priceChange24h)) {
        changeValue.textContent = `${state.priceChange24h >= 0 ? '+' : ''}${formatNumber(state.priceChange24h)}%`;
        changeEl.className = `price-change ${state.priceChange24h >= 0 ? 'positive' : 'negative'}`;
    } else {
        changeValue.textContent = 'Kein Live-Wert';
        changeEl.className = 'price-change';
    }

    document.getElementById('marketCap').textContent = Number.isFinite(state.marketCap) ? formatCurrency(state.marketCap) : 'Nicht verfuegbar';
    document.getElementById('volume24h').textContent = Number.isFinite(state.volume24h) ? formatCurrency(state.volume24h) : 'Nicht verfuegbar';
    document.getElementById('ath').textContent = Number.isFinite(state.ath) ? formatCurrency(state.ath) : 'Nicht verfuegbar';
    document.getElementById('athChange').textContent = Number.isFinite(state.athChange) ? `${formatNumber(state.athChange)}%` : 'Kein Live-Wert';
    if (fearGreedTickerEl) {
        fearGreedTickerEl.textContent = Number.isFinite(state.fearGreedIndex) ? String(state.fearGreedIndex) : 'Nicht verfuegbar';
    }

    const tickerSources = document.getElementById('tickerSources');
    if (tickerSources) {
        const fearGreedSource = state.sourceQuality?.sources?.fearGreed;
        tickerSources.textContent = `Preis, Marktkapitalisierung, Volumen und ATH: CoinGecko (Live) | Fear & Greed: ${state.fearGreedSource} (${getSourceModeLabel(fearGreedSource)})`;
    }

    document.getElementById('marketCap').title = 'Quelle: CoinGecko';
    document.getElementById('volume24h').title = 'Quelle: CoinGecko';
    document.getElementById('ath').title = 'Quelle: CoinGecko';
    document.getElementById('athChange').title = 'Quelle: CoinGecko';
    document.getElementById('tickerFearGreed').title = `Quelle: ${state.fearGreedSource}`;
}

function updateFearGreedCard() {
    const value = state.fearGreedIndex;
    const valueEl = document.getElementById('fearGreedValue');
    const labelEl = document.getElementById('fearGreedLabel');
    const historyContainer = document.getElementById('fearGreedHistory');
    const interpretationEl = document.getElementById('fearGreedInterpretation');
    const gaugeFill = document.getElementById('gaugeFill');
    valueEl.textContent = Number.isFinite(value) ? value : 'Nicht verfuegbar';

    if (!Number.isFinite(value)) {
        labelEl.textContent = 'Keine aktuellen Daten';
        valueEl.style.color = 'var(--text-secondary)';
        valueEl.style.textShadow = 'none';
        valueEl.title = `Quelle: ${state.fearGreedSource}`;
        gaugeFill.style.transform = 'rotate(0deg)';
        historyContainer.innerHTML = '<div class="history-item"><div class="history-day">Heute</div><div class="history-value">Kein Live-Wert</div></div>';
        interpretationEl.textContent = `Fear & Greed aktuell nicht verfuegbar | Quelle: ${state.fearGreedSource}`;
        const sourceNoteEl = document.getElementById('fearGreedSourceNote');
        if (sourceNoteEl) {
            sourceNoteEl.textContent = `Aktive Quelle: ${state.fearGreedSource} | Status: ${getSourceModeLabel(state.sourceQuality?.sources?.fearGreed)}`;
        }
        return;
    }

    // Determine label
    let label = 'Neutral';
    let color = 'var(--neutral)';

    if (value <= 20) { label = 'Extreme Angst'; color = 'var(--bearish)'; }
    else if (value <= 40) { label = 'Angst'; color = '#f97316'; }
    else if (value <= 60) { label = 'Neutral'; color = 'var(--neutral)'; }
    else if (value <= 80) { label = 'Gier'; color = '#84cc16'; }
    else { label = 'Extreme Gier'; color = 'var(--bullish)'; }

    labelEl.textContent = label;

    valueEl.style.color = color;
    valueEl.style.textShadow = '0 0 15px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 0, 0, 0.7), 0 2px 6px rgba(0, 0, 0, 0.6), 0 0 3px rgba(255, 255, 255, 0.3)';
    valueEl.title = `Quelle: ${state.fearGreedSource}`;

    // Update gauge
    const rotation = (value / 100) * 180;
    gaugeFill.style.transform = `rotate(${rotation}deg)`;

    // Update history
    historyContainer.innerHTML = state.fearGreedHistory.slice(1, 6).map((item, i) => {
        const days = ['Gestern', 'Vor 2T', 'Vor 3T', 'Vor 4T', 'Vor 5T'];
        let itemColor = 'var(--text-secondary)';
        if (item.value <= 25) itemColor = 'var(--bearish)';
        else if (item.value <= 45) itemColor = '#f97316';
        else if (item.value >= 75) itemColor = 'var(--bullish)';
        else if (item.value >= 55) itemColor = '#84cc16';

        return `
            <div class="history-item">
                <div class="history-day">${days[i]}</div>
                <div class="history-value" style="color: ${itemColor}">${item.value}</div>
            </div>
        `;
    }).join('');

    // Interpretation
    let interpretation = '';
    if (value <= 20) {
        interpretation = '⚡ Extreme Angst = Historisch oft Kaufgelegenheit (Kontraindikator)';
    } else if (value <= 35) {
        interpretation = '📉 Angst im Markt - Potenzielle Akkumulationszone';
    } else if (value <= 65) {
        interpretation = '⚖️ Neutrales Sentiment - Keine klare Richtung';
    } else if (value <= 80) {
        interpretation = '📈 Gier im Markt - Vorsicht vor FOMO';
    } else {
        interpretation = '⚠️ Extreme Gier = Historisch oft Verkaufssignal (Kontraindikator)';
    }
    if (value <= 20) {
        interpretation = 'Extreme Angst ist historisch oft eine Kaufzone';
    } else if (value <= 35) {
        interpretation = 'Angst im Markt spricht eher fuer vorsichtige Akkumulation';
    } else if (value <= 65) {
        interpretation = 'Neutrales Sentiment liefert aktuell kein klares Signal';
    } else if (value <= 80) {
        interpretation = 'Gier im Markt erhoeht das Risiko fuer FOMO-Einstiege';
    } else {
        interpretation = 'Extreme Gier ist historisch oft ein Warnsignal';
    }
    interpretationEl.textContent = `${interpretation} | Quelle: ${state.fearGreedSource}`;

    const sourceNoteEl = document.getElementById('fearGreedSourceNote');
    if (sourceNoteEl) {
        const cmcConfig = getCoinMarketCapConfig();
        const cmcReady = Boolean(cmcConfig.proxyUrl || (cmcConfig.apiKey && cmcConfig.allowBrowserKey));
        if (state.fearGreedMode === 'cmc' && !cmcReady) {
            sourceNoteEl.textContent = 'CoinMarketCap ist nur mit API-Key oder Proxy verfuegbar. Ohne CMC bleibt der Wert deaktiviert.';
        } else if (state.fearGreedMode === 'cmc' && !state.fearGreedIsCurrent) {
            const timestampMs = parseFearGreedTimestamp(state.fearGreedTimestamp);
            const dateLabel = timestampMs
                ? new Date(timestampMs).toLocaleDateString('de-DE', { timeZone: 'UTC' })
                : 'unbekannt';
            sourceNoteEl.textContent = `CMC-Modus aktiv: CoinMarketCap ist heute nicht aktuell${timestampMs ? ` | letzter Stand: ${dateLabel} UTC` : ''}`;
        } else if (!state.fearGreedIsCurrent && state.fearGreedTimestamp) {
            const timestampMs = parseFearGreedTimestamp(state.fearGreedTimestamp);
            const dateLabel = timestampMs
                ? new Date(timestampMs).toLocaleDateString('de-DE', { timeZone: 'UTC' })
                : 'unbekannt';
            sourceNoteEl.textContent = `Aktive Quelle: ${state.fearGreedSource} | Status: ${getSourceModeLabel(state.sourceQuality?.sources?.fearGreed)} | Stand: ${dateLabel} UTC`;
        } else {
            sourceNoteEl.textContent = `Aktive Quelle: ${state.fearGreedSource} | Status: ${getSourceModeLabel(state.sourceQuality?.sources?.fearGreed)}`;
        }
    }
}

function updateTechnicalCard() {
    const hasHistory = Array.isArray(state.priceHistory) && state.priceHistory.length >= 10;
    if (!hasHistory) {
        document.getElementById('rsiValue').textContent = 'Nicht verfuegbar';
        document.getElementById('rsiValue').className = 'indicator-value';
        document.getElementById('rsiMarker').style.left = '50%';
        document.getElementById('trendValue').textContent = 'Nicht verfuegbar';
        document.getElementById('trendValue').className = 'indicator-value text-neutral';
        const trendArrow = document.querySelector('.trend-arrow');
        if (trendArrow) trendArrow.className = 'trend-arrow sideways';
        document.getElementById('emaPosition').textContent = 'Kein Live-Wert';
        document.getElementById('emaPosition').className = 'ema-position';
        document.getElementById('emaValue').textContent = 'Nicht verfuegbar';
        document.getElementById('volatilityValue').textContent = 'Nicht verfuegbar';
        document.getElementById('volatilityBar').style.width = '0%';
        document.getElementById('volumeDashValue').textContent = 'Nicht verfuegbar';
        document.getElementById('technicalBadge').textContent = 'Daten fehlen';
        document.getElementById('technicalBadge').className = 'card-badge';
        return;
    }

    const rsi = calculateRSI(state.priceHistory);
    const trend = determineTrend(state.priceHistory);
    const volatility = calculateVolatility(state.priceHistory);
    const ema = calculateEMA(state.priceHistory, Math.min(20, state.priceHistory.length));

    // RSI
    document.getElementById('rsiValue').textContent = formatNumber(rsi, 1);
    document.getElementById('rsiMarker').style.left = `${rsi}%`;

    if (rsi < 30) {
        document.getElementById('rsiValue').className = 'indicator-value text-bullish';
    } else if (rsi > 70) {
        document.getElementById('rsiValue').className = 'indicator-value text-bearish';
    } else {
        document.getElementById('rsiValue').className = 'indicator-value';
    }

    // Trend
    const trendValue = document.getElementById('trendValue');
    const trendArrow = document.querySelector('.trend-arrow');

    trendArrow.className = 'trend-arrow ' + (trend === 'up' ? 'up' : trend === 'down' ? 'down' : 'sideways');
    trendValue.textContent = trend === 'up' ? 'Aufwärts' : trend === 'down' ? 'Abwärts' : 'Seitwärts';
    trendValue.className = `indicator-value text-${trend === 'up' ? 'bullish' : trend === 'down' ? 'bearish' : 'neutral'}`;

    // EMA
    const emaPosition = document.getElementById('emaPosition');
    const aboveEma = state.price > ema;
    emaPosition.textContent = aboveEma ? 'ÜBER EMA' : 'UNTER EMA';
    emaPosition.className = `ema-position ${aboveEma ? 'above' : 'below'}`;
    document.getElementById('emaValue').textContent = formatCurrency(ema);

    // Volatility
    document.getElementById('volatilityValue').textContent = `${formatNumber(volatility, 1)}%`;
    document.getElementById('volatilityBar').style.width = `${Math.min(100, volatility * 20)}%`;

    // Volume Flow (New)
    const volValueEl = document.getElementById('volumeDashValue');
    const volVisualEl = document.getElementById('volumeDashVisual');
    volValueEl.textContent = 'Nicht verfuegbar';
    volValueEl.className = 'indicator-value text-neutral';

    if (window.historicalData && window.historicalData.total_volumes) {
        // Ensure we have volumes
        const volumes = window.historicalData.total_volumes.map(v => v[1]);
        const currentVol = state.volume24h;

        // Check if functions exist (safe guard)
        if (typeof calculateOBV === 'function' && typeof calculateRVOL === 'function') {
            // Calculate metrics
            // Use last 30 periods for OBV to match modal
            const obvPrices = state.priceHistory.slice(-30);
            const obvVols = volumes.slice(-30);
            const obvResult = calculateOBV(obvPrices, obvVols);

            const rvolResult = calculateRVOL(currentVol, volumes);

            // Text
            let trendText = obvResult.trend === 'up' ? 'AUFWÄRTS' : obvResult.trend === 'down' ? 'ABWÄRTS' : 'NEUTRAL';
            volValueEl.textContent = `${trendText} (RVOL ${rvolResult.ratio.toFixed(1)})`;
            volValueEl.className = `indicator-value ${obvResult.trend === 'up' ? 'text-bullish' : obvResult.trend === 'down' ? 'text-bearish' : 'text-neutral'}`;

            // Visual Arrow
            const arrow = volVisualEl.querySelector('.trend-arrow');
            if (arrow) {
                arrow.className = 'trend-arrow ' + (obvResult.trend === 'up' ? 'up' : obvResult.trend === 'down' ? 'down' : 'sideways');
            }
        }
    }

    // Badge
    const badge = document.getElementById('technicalBadge');
    badge.textContent = `${formatNumber(state.scores.technical, 1)}/10`;
    badge.className = `card-badge ${state.scores.technical >= 6 ? 'bullish' : state.scores.technical <= 4 ? 'bearish' : ''}`;
}

function updateDerivativesCard() {
    // Funding Rate
    const fundingEl = document.getElementById('fundingRate');
    if (Number.isFinite(state.fundingRate)) {
        fundingEl.textContent = `${state.fundingRate >= 0 ? '+' : ''}${formatNumber(state.fundingRate, 4)}%`;
    } else {
        fundingEl.textContent = 'Nicht verfuegbar';
    }
    fundingEl.className = `derivative-value ${Number.isFinite(state.fundingRate) && state.fundingRate < 0 ? 'positive' : Number.isFinite(state.fundingRate) && state.fundingRate > 0.02 ? 'negative' : ''}`;

    const fundingStatus = document.getElementById('fundingStatus');
    if (!Number.isFinite(state.fundingRate)) {
        fundingStatus.textContent = 'Nicht verfügbar';
    } else if (state.fundingRate < -0.01) {
        fundingStatus.textContent = 'Shorts zahlen Longs → bullisch';
    } else if (state.fundingRate > 0.03) {
        fundingStatus.textContent = 'Longs zahlen Shorts → bärisch';
    } else {
        fundingStatus.textContent = 'Neutral';
    }

    // Open Interest
    document.getElementById('openInterest').textContent = Number.isFinite(state.openInterest) ? formatCurrency(state.openInterest) : 'Nicht verfuegbar';
    const oiChangeEl = document.getElementById('oiChange');
    if (oiChangeEl) {
        oiChangeEl.textContent = Number.isFinite(state.openInterest) ? 'Live-Wert' : 'Kein Live-Wert';
    }
    document.getElementById('fundingRate').title = 'Quelle: Binance Futures';
    document.getElementById('openInterest').title = 'Quelle: Binance Futures';
    document.getElementById('longPercent').title = 'Quelle: Binance Futures';
    document.getElementById('shortPercent').title = 'Quelle: Binance Futures';

    // Long/Short Ratio
    const longRatioValue = state.longShortRatio.available ? state.longShortRatio.long : 0;
    const shortRatioValue = state.longShortRatio.available ? state.longShortRatio.short : 0;
    document.getElementById('lsLong').style.width = `${longRatioValue}%`;
    document.getElementById('lsShort').style.width = `${shortRatioValue}%`;
    document.getElementById('longPercent').textContent = state.longShortRatio.available ? `${formatNumber(state.longShortRatio.long, 1)}%` : 'Nicht verfuegbar';
    document.getElementById('shortPercent').textContent = state.longShortRatio.available ? `${formatNumber(state.longShortRatio.short, 1)}%` : 'Nicht verfuegbar';

    // Liquidation zones (estimated based on current price)
    const liqLongs = Number.isFinite(state.price) ? state.price * 0.95 : null;
    const liqShorts = Number.isFinite(state.price) ? state.price * 1.05 : null;
    document.getElementById('liqLongs').textContent = Number.isFinite(liqLongs) ? formatCurrency(liqLongs) : 'Nicht verfuegbar';
    document.getElementById('liqShorts').textContent = Number.isFinite(liqShorts) ? formatCurrency(liqShorts) : 'Nicht verfuegbar';

    // Badge
    const badge = document.getElementById('derivativesBadge');
    const fundingBaseScore = !Number.isFinite(state.fundingRate) ? 5 : state.fundingRate < 0 ? 6 : 4;
    const derivScore = fundingBaseScore + (!state.longShortRatio.available ? 0 : (state.longShortRatio.short > 50 ? 1 : -1));
    badge.textContent = `${formatNumber(derivScore, 1)}/10`;

    const derivativesSourceNote = document.getElementById('derivativesSourceNote');
    if (derivativesSourceNote) {
        const source = state.sourceQuality?.sources?.longShortRatio;
        derivativesSourceNote.textContent = source?.usedInScoring
            ? `Quelle: Binance Futures (${getSourceModeLabel(source)})`
            : 'Quelle: Binance Futures (deaktiviert)';
    }
}

function updateSentimentCard() {
    // Sentiment meter position (0-100)
    const sentimentPosition = state.scores.sentiment * 10;
    document.getElementById('sentimentMarker').style.left = `calc(${sentimentPosition}% - 4px)`;

    // Individual factors
    const fgSignal = document.getElementById('fgSignal');
    if (!isSourceUsable('fearGreed')) {
        fgSignal.textContent = 'Eingeschr.';
        fgSignal.className = 'factor-signal neutral';
        document.getElementById('fgIcon').textContent = 'âš ';
    } else if (state.fearGreedIndex <= 25) {
        fgSignal.textContent = 'Bullisch';
        fgSignal.className = 'factor-signal bullish';
        document.getElementById('fgIcon').textContent = '😱';
    } else if (state.fearGreedIndex >= 75) {
        fgSignal.textContent = 'Bärisch';
        fgSignal.className = 'factor-signal bearish';
        document.getElementById('fgIcon').textContent = '🤑';
    } else {
        fgSignal.textContent = 'Neutral';
        fgSignal.className = 'factor-signal neutral';
        document.getElementById('fgIcon').textContent = '😐';
    }

    const fundingSignal = document.getElementById('fundingSignal');
    if (!Number.isFinite(state.fundingRate)) {
        fundingSignal.textContent = 'N/A';
        fundingSignal.className = 'factor-signal neutral';
    } else if (state.fundingRate < -0.005) {
        fundingSignal.textContent = 'Bullisch';
        fundingSignal.className = 'factor-signal bullish';
    } else if (state.fundingRate > 0.03) {
        fundingSignal.textContent = 'Bärisch';
        fundingSignal.className = 'factor-signal bearish';
    } else {
        fundingSignal.textContent = 'Neutral';
        fundingSignal.className = 'factor-signal neutral';
    }

    const lsSignal = document.getElementById('lsSignal');
    if (!state.longShortRatio.available) {
        lsSignal.textContent = 'N/A';
        lsSignal.className = 'factor-signal neutral';
    } else if (state.longShortRatio.short > 55) {
        lsSignal.textContent = 'Bullisch';
        lsSignal.className = 'factor-signal bullish';
    } else if (state.longShortRatio.long > 55) {
        lsSignal.textContent = 'Bärisch';
        lsSignal.className = 'factor-signal bearish';
    } else {
        lsSignal.textContent = 'Neutral';
        lsSignal.className = 'factor-signal neutral';
    }

    // Badge
    const badge = document.getElementById('sentimentBadge');
    badge.textContent = `${formatNumber(state.scores.sentiment, 1)}/10`;
    badge.className = `card-badge ${state.scores.sentiment >= 6 ? 'bullish' : state.scores.sentiment <= 4 ? 'bearish' : ''}`;
}

function getUnifiedTradeRecommendation() {
    if (!Number.isFinite(state.price) || state.price <= 0) {
        return null;
    }

    const price = state.price;
    const effectiveFearGreed = getEffectiveFearGreedValue();
    const priceWindow = Array.isArray(state.priceHistory) ? state.priceHistory.slice(-30) : [];
    const rsi = priceWindow.length >= 2 ? calculateRSI(state.priceHistory) : 50;
    const trend = priceWindow.length >= 2 ? determineTrend(state.priceHistory) : 'sideways';
    const volatility = priceWindow.length >= 5 ? calculateVolatility(priceWindow) : 1.2;

    const sr = (typeof detectSupportResistance === 'function' && priceWindow.length >= 5)
        ? detectSupportResistance(priceWindow, price)
        : { nearestSupport: price * 0.97, nearestResistance: price * 1.03 };

    let confluence = {
        total: calculateWeightedScore(),
        direction: state.signal === 'SHORT' ? 'SHORT' : 'LONG',
        breakdown: {}
    };

    if (typeof calculateLiveConfluenceScore === 'function') {
        confluence = calculateLiveConfluenceScore(
            price,
            rsi,
            trend,
            Number.isFinite(effectiveFearGreed) ? effectiveFearGreed : null,
            state.ath ?? price * 1.2,
            sr,
            volatility
        );
    }

    const blockedReasons = [];

    let signal = 'NEUTRAL';
    let confidence = Math.round(Math.max(35, Math.min(85, confluence.total * 10)));

    if (confluence.total >= 6 && confluence.direction === 'LONG') {
        signal = 'LONG';
    } else if (confluence.total >= 6 && confluence.direction === 'SHORT') {
        signal = 'SHORT';
    }

    const volatilityPercent = Math.max(0.008, Math.min(0.03, (volatility / 100) * 1.5));
    const zonePercent = Math.max(0.0025, Math.min(0.006, volatilityPercent * 0.35));

    let stopLoss = null;
    let tp1 = null;
    let tp2 = null;
    let tp3 = null;
    let slPercent = null;
    let entryZone = null;
    let rr = null;

    if (signal === 'LONG') {
        stopLoss = price * (1 - volatilityPercent);

        const risk = price - stopLoss;
        if (risk > 0) {
            tp1 = price + risk * 1.5;
            tp2 = price + risk * 2.5;
            tp3 = price + risk * 4.0;

            slPercent = (risk / price) * 100;
            entryZone = [price * (1 - zonePercent), price];
            rr = [
                Math.max(0, (tp1 - price) / risk),
                Math.max(0, (tp2 - price) / risk),
                Math.max(0, (tp3 - price) / risk)
            ];
        } else {
            signal = 'NEUTRAL';
        }
    } else if (signal === 'SHORT') {
        stopLoss = price * (1 + volatilityPercent);
        const risk = stopLoss - price;

        if (risk > 0) {
            tp1 = price - risk * 1.5;
            tp2 = price - risk * 2.5;
            tp3 = price - risk * 4.0;

            slPercent = (risk / price) * 100;
            entryZone = [price, price * (1 + zonePercent)];
            rr = [
                Math.max(0, (price - tp1) / risk),
                Math.max(0, (price - tp2) / risk),
                Math.max(0, (price - tp3) / risk)
            ];
        } else {
            signal = 'NEUTRAL';
        }
    }

    // Perfect-trade filters
    const currentHourUtc = new Date().getUTCHours();
    const isLowLiquiditySession = currentHourUtc <= 5 || currentHourUtc >= 23;

    let rvolRatio = 1;
    if (Array.isArray(state.volumeHistory) && state.volumeHistory.length >= 20) {
        if (typeof calculateRVOL === 'function') {
            rvolRatio = calculateRVOL(state.volume24h || state.volumeHistory[state.volumeHistory.length - 1], state.volumeHistory).ratio;
        } else {
            const avgVolume = state.volumeHistory.slice(-20).reduce((a, b) => a + b, 0) / 20;
            const currVolume = state.volume24h || state.volumeHistory[state.volumeHistory.length - 1];
            if (avgVolume > 0) rvolRatio = currVolume / avgVolume;
        }
    }

    const isLowLiquidity = isLowLiquiditySession || rvolRatio < 0.85;
    const isHighVolatility = volatilityPercent > 0.026;

    if (signal !== 'NEUTRAL' && rr && rr[1] < 2) {
        signal = 'NEUTRAL';
        blockedReasons.push('Setup verworfen: TP2 liegt unter R:R 1:2');
    }

    if (signal !== 'NEUTRAL' && isLowLiquidity) {
        signal = 'NEUTRAL';
        blockedReasons.push('Setup verworfen: Low-Liquidity Session/Volume');
    }

    if (signal !== 'NEUTRAL' && isHighVolatility && confidence < 70) {
        signal = 'NEUTRAL';
        blockedReasons.push('Setup verworfen: Volatilitaet zu hoch fuer aktuelle Konfidenz');
    }

    const weightedRR = rr
        ? (rr[0] * 0.5) + (rr[1] * 0.3) + (rr[2] * 0.2)
        : null;

    let positionSize = '0%';
    let maxLeverage = '1x';
    if (signal !== 'NEUTRAL') {
        if (confidence >= 85) {
            positionSize = '2.5%';
            maxLeverage = '4x';
        } else if (confidence >= 70) {
            positionSize = '2%';
            maxLeverage = '3x';
        } else if (confidence >= 55) {
            positionSize = '1%';
            maxLeverage = '2x';
        } else {
            positionSize = '0.5%';
            maxLeverage = '1x';
        }
    }

    return {
        signal,
        confidence,
        confluence,
        entryZone,
        stopLoss,
        tp1,
        tp2,
        tp3,
        slPercent,
        rr,
        weightedRR,
        blockedReasons,
        filters: {
            rvolRatio,
            isLowLiquiditySession,
            isLowLiquidity,
            isHighVolatility
        },
        positionSize,
        maxLeverage
    };
}

function formatDecisionPrice(value) {
    return Number.isFinite(value) ? `$${formatNumber(value, 0)}` : '--';
}

function formatSignedPercent(value, decimals = 2) {
    if (!Number.isFinite(value)) return 'n/a';
    return `${value >= 0 ? '+' : ''}${formatNumber(value, decimals)}%`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildTelegramPreviewMessage(mode = 'signal') {
    const model = buildDecisionModel();
    const unified = model?.unified || getUnifiedTradeRecommendation();
    const signal = unified?.signal || state.signal || 'NEUTRAL';
    const confidence = Math.round(unified?.confidence ?? state.confidence ?? 0);
    const permission = model?.permission || 'NO TRADE';
    const price = formatDecisionPrice(state.price);
    const priceChange = formatSignedPercent(state.priceChange24h, 2);
    const fearGreed = Number.isFinite(state.fearGreedIndex) ? `${state.fearGreedIndex}/100` : 'n/a';
    const fearGreedLabel = document.getElementById('fearGreedLabel')?.textContent || 'n/a';
    const eventRisk = state.eventFilter?.label || 'n/a';
    const dataStatus = state.dataQuality?.summary || 'n/a';
    const timestamp = new Date().toLocaleString('de-DE');
    const triggerDetails = signal === 'SHORT'
        ? model?.triggerShort?.entry || model?.hardTrigger?.trigger || 'Noch kein konkreter Short-Trigger'
        : model?.triggerLong?.entry || model?.hardTrigger?.trigger || 'Noch kein konkreter Long-Trigger';

    if (mode === 'daily') {
        return [
            'BTC Tagesbericht',
            `Zeit: ${timestamp}`,
            '',
            `Preis: ${price} (${priceChange} in 24h)`,
            `Fear & Greed: ${fearGreed} (${fearGreedLabel})`,
            `Hauptsignal: ${signal}`,
            `Konfidenz: ${confidence}%`,
            `Trade-Freigabe: ${permission}`,
            `Event-Risiko: ${eventRisk}`,
            `Datenstatus: ${dataStatus}`,
            '',
            `Naechster Fokus: ${model?.actionNow || model?.topStatus || 'Markt weiter beobachten'}`,
            `Trigger: ${triggerDetails}`,
            `Gueltigkeit: ${model?.validity || 'Neu mit dem naechsten 4h-Update pruefen'}`
        ].join('\n');
    }

    return [
        'BTC Signalpruefung',
        `Zeit: ${timestamp}`,
        '',
        `Hauptsignal: ${signal}`,
        `Konfidenz: ${confidence}%`,
        `Trade-Freigabe: ${permission}`,
        `Bias / Setup / Trigger / Ausfuehrung: ${model?.stages?.bias?.value || 'n/a'} / ${model?.stages?.setup?.value || 'n/a'} / ${model?.stages?.trigger?.value || 'n/a'} / ${model?.stages?.execution?.value || 'n/a'}`,
        `Preis: ${price}`,
        `Fear & Greed: ${fearGreed} (${fearGreedLabel})`,
        '',
        `Einstieg: ${triggerDetails}`,
        `Nicht handeln wenn: ${model?.doNotTrade || 'Keine zusaetzlichen Blocker aktiv'}`,
        `Hinweis: ${model?.bestStrategy?.summary || model?.topStatus || 'Markt weiter beobachten'}`
    ].join('\n');
}

function buildTelegramPreviewHtml(mode = 'signal') {
    const model = buildDecisionModel();
    const unified = model?.unified || getUnifiedTradeRecommendation();
    const signal = unified?.signal || state.signal || 'NEUTRAL';
    const confidence = Math.round(unified?.confidence ?? state.confidence ?? 0);
    const permission = model?.permission || 'NO TRADE';
    const price = formatDecisionPrice(state.price);
    const priceChange = formatSignedPercent(state.priceChange24h, 2);
    const fearGreed = Number.isFinite(state.fearGreedIndex) ? `${state.fearGreedIndex}/100` : 'n/a';
    const fearGreedLabel = document.getElementById('fearGreedLabel')?.textContent || 'n/a';
    const triggerDetails = signal === 'SHORT'
        ? model?.triggerShort?.entry || model?.hardTrigger?.trigger || 'Noch kein konkreter Short-Trigger'
        : model?.triggerLong?.entry || model?.hardTrigger?.trigger || 'Noch kein konkreter Long-Trigger';
    const title = mode === 'daily' ? 'BTC Tagesbericht' : 'BTC Signalprüfung';
    const summary = mode === 'daily'
        ? (model?.actionNow || model?.topStatus || 'Markt weiter beobachten')
        : (model?.bestStrategy?.summary || model?.topStatus || 'Markt weiter beobachten');
    const extraLine = mode === 'daily'
        ? `Gültigkeit: ${model?.validity || 'Neu mit dem nächsten 4h-Update prüfen'}`
        : `Nicht handeln wenn: ${model?.doNotTrade || 'Keine zusätzlichen Blocker aktiv'}`;

    return `
        <div class="telegram-report-card">
            <div class="telegram-report-title">${escapeHtml(title)}</div>
            <div class="telegram-report-time">${escapeHtml(new Date().toLocaleString('de-DE'))}</div>
            <div class="telegram-report-grid">
                <div class="telegram-report-item">
                    <span class="telegram-report-label">Preis</span>
                    <strong>${escapeHtml(price)}</strong>
                    <span>${escapeHtml(priceChange)}</span>
                </div>
                <div class="telegram-report-item">
                    <span class="telegram-report-label">Fear & Greed</span>
                    <strong>${escapeHtml(fearGreed)}</strong>
                    <span>${escapeHtml(fearGreedLabel)}</span>
                </div>
                <div class="telegram-report-item">
                    <span class="telegram-report-label">Signal</span>
                    <strong>${escapeHtml(signal)}</strong>
                    <span>Konfidenz ${escapeHtml(`${confidence}%`)}</span>
                </div>
                <div class="telegram-report-item">
                    <span class="telegram-report-label">Freigabe</span>
                    <strong>${escapeHtml(permission)}</strong>
                    <span>${escapeHtml(state.eventFilter?.label || 'n/a')}</span>
                </div>
            </div>
            <div class="telegram-report-block">
                <div class="telegram-report-label">Nächster Fokus</div>
                <strong>${escapeHtml(summary)}</strong>
            </div>
            <div class="telegram-report-block">
                <div class="telegram-report-label">Trigger</div>
                <span>${escapeHtml(triggerDetails)}</span>
            </div>
            <div class="telegram-report-block telegram-report-block-muted">
                <div class="telegram-report-label">Hinweis</div>
                <span>${escapeHtml(extraLine)}</span>
            </div>
        </div>
    `;
}

function setTelegramPreviewButtonState(mode) {
    const dailyBtn = document.getElementById('testDailyUpdate');
    const signalBtn = document.getElementById('testSignalCheck');
    if (dailyBtn) dailyBtn.classList.toggle('active', mode === 'daily');
    if (signalBtn) signalBtn.classList.toggle('active', mode === 'signal');
}

function getTelegramCredentials() {
    if (window.TELEGRAM_CONFIG?.botToken && window.TELEGRAM_CONFIG?.chatId) {
        return {
            token: window.TELEGRAM_CONFIG.botToken,
            chatId: window.TELEGRAM_CONFIG.chatId,
            source: 'config'
        };
    }

    const token = localStorage.getItem('telegram_bot_token');
    const chatId = localStorage.getItem('telegram_chat_id');
    if (token && chatId) {
        return { token, chatId, source: 'localStorage' };
    }

    return null;
}

async function sendTelegramMessage(text) {
    const creds = getTelegramCredentials();
    if (!creds) {
        return { success: false, error: 'credentials_missing' };
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${creds.token}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: creds.chatId,
                text,
                disable_web_page_preview: true
            })
        });

        const data = await response.json();
        return { success: Boolean(data.ok), error: data.description || 'Unbekannter Fehler' };
    } catch (error) {
        return { success: false, error: error.message || 'Netzwerkfehler' };
    }
}

function prefillTelegramConfigForm() {
    const tokenInput = document.getElementById('tgTokenInput');
    const chatIdInput = document.getElementById('tgChatIdInput');
    const creds = getTelegramCredentials();
    if (!tokenInput || !chatIdInput || !creds) return;
    tokenInput.value = creds.token;
    chatIdInput.value = creds.chatId;
}

function setTelegramStatus(message, tone = 'neutral') {
    const statusEl = document.getElementById('tgStatusMsg');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = tone === 'success'
        ? '#10b981'
        : tone === 'error'
            ? '#ef4444'
            : 'rgba(230, 238, 248, 0.88)';
}

function openTelegramPreview(mode = 'signal') {
    const overlay = document.getElementById('telegramPreview');
    const content = document.getElementById('telegramPreviewContent');
    const configForm = document.getElementById('telegramConfigForm');
    if (!overlay || !content) return;
    content.dataset.message = buildTelegramPreviewMessage(mode);
    content.innerHTML = buildTelegramPreviewHtml(mode);
    overlay.style.display = 'flex';
    if (configForm) configForm.style.display = 'none';
    setTelegramStatus('');
    setTelegramPreviewButtonState(mode);
}

function closeTelegramPreview() {
    const overlay = document.getElementById('telegramPreview');
    if (!overlay) return;
    overlay.style.display = 'none';
}

function applyUiTextFixes() {
    const setText = (selector, value) => {
        const el = document.querySelector(selector);
        if (el) el.textContent = value;
    };

    const setAttr = (selector, attr, value) => {
        const el = document.querySelector(selector);
        if (el) el.setAttribute(attr, value);
    };

    setText('.notification-icon', '🤖');
    setText('#testDailyUpdate', 'Tagesbericht testen');
    setText('#testSignalCheck', 'Signalprüfung testen');
    setText('.telegram-preview-header span', '📱 Telegram Vorschau');
    setText('#closeTelegramPreview', '×');
    setText('.logo-icon', '₿');
    setText('.how-it-works-toggle', '📚 Wie funktioniert dieses Dashboard? (Klick zum Öffnen)');

    setAttr('.header-right .last-update:nth-of-type(2)', 'title', 'Qualität und Vollständigkeit der aktuellen Marktdaten');
    setAttr('#refreshBtn', 'title', "Klicke hier oder drücke 'R' um die Daten manuell zu aktualisieren");
    setAttr('#tradeAnalysisBtn', 'title', 'Live Coach-Analyse öffnen');
    setAttr('.auto-refresh', 'title', 'Countdown bis zur nächsten automatischen Aktualisierung');
}

window.openTelegramPreview = openTelegramPreview;
window.closeTelegramPreview = closeTelegramPreview;

function buildLiveIntegrityModel(unified) {
    const quality = state.dataQuality || { mode: 'loading', issues: [], warnings: [] };
    const sourceQuality = state.sourceQuality || { confidence: 0, verdict: { blocked: true, restricted: true }, reducedBy: [] };
    const ageMinutes = state.lastUpdate ? (Date.now() - state.lastUpdate.getTime()) / 60000 : null;
    const warningThreshold = Math.max(7, CONFIG.refreshInterval / 60000 * 1.4);
    const staleThreshold = Math.max(12, CONFIG.refreshInterval / 60000 * 2.2);

    let confidence = sourceQuality.confidence ?? 0;
    if (ageMinutes !== null && ageMinutes > warningThreshold) confidence -= 12;
    if (ageMinutes !== null && ageMinutes > staleThreshold) confidence -= 18;
    if (unified?.filters?.isLowLiquidity) confidence -= 8;
    confidence = Math.max(0, Math.min(100, Math.round(confidence)));

    const blockers = [];
    if (sourceQuality.verdict?.blocked) blockers.push(sourceQuality.verdict?.summary || quality.issues?.[0] || 'Kritische Kernquelle fehlt');
    if (ageMinutes !== null && ageMinutes > staleThreshold) blockers.push(`Daten sind stale (${Math.round(ageMinutes)} min alt)`);
    if ((quality.warnings?.length || 0) >= 3 || (sourceQuality.reducedBy?.length || 0) >= 4) blockers.push('Zu viele Teil-Fallbacks gleichzeitig');
    if (!isSourceUsable('priceHistory')) blockers.push('Preis-Historie fehlt');

    const blocked = blockers.length > 0;
    const caution = !blocked && (sourceQuality.verdict?.restricted || quality.mode === 'partial' || (quality.warnings?.length || 0) > 0 || (ageMinutes !== null && ageMinutes > warningThreshold));

    return {
        confidence,
        blocked,
        caution,
        status: blocked ? 'BLOCKED' : caution ? 'LIVE CAUTION' : 'LIVE READY',
        freshness: ageMinutes === null ? 'gerade geladen' : ageMinutes < 1 ? 'unter 1 min' : `${Math.round(ageMinutes)} min alt`,
        sourceState: blocked
            ? `${quality.summary} / ${quality.issues?.length || 0} kritisch`
            : quality.mode === 'partial'
                ? `${quality.summary} / ${quality.warnings?.length || 0} Warnungen`
                : 'Live / Kernquellen ok',
        blocker: blockers[0] || 'Kein harter Datenblocker aktiv'
    };
}

function getUpcomingScheduledEvents(horizonDays = 14) {
    const now = Date.now();
    const horizonMs = horizonDays * 24 * 60 * 60 * 1000;

    return OFFICIAL_EVENT_SCHEDULE
        .map(event => {
            const ts = new Date(event.startsAt).getTime();
            return { ...event, ts, hoursUntil: (ts - now) / 3600000 };
        })
        .filter(event => event.ts >= now - (6 * 3600000) && event.ts <= now + horizonMs)
        .sort((a, b) => a.ts - b.ts);
}

function analyzeNewsHeadlineImpact(items = []) {
    const keywords = {
        red: ['fomc', 'powell', 'cpi', 'nfp', 'sec', 'etf outflow', 'lawsuit', 'hack', 'liquidation', 'ban'],
        yellow: ['etf', 'regulation', 'fed', 'inflation', 'approval', 'outflow', 'whale', 'liquid'],
        bullish: ['approval', 'inflow', 'reclaim', 'accumulation', 'adoption'],
        bearish: ['outflow', 'ban', 'hack', 'liquidation', 'lawsuit', 'dump']
    };

    return items.map(item => {
        const text = `${item.title} ${item.source}`.toLowerCase();
        let score = 0;
        if (keywords.red.some(keyword => text.includes(keyword))) score += 3;
        if (keywords.yellow.some(keyword => text.includes(keyword))) score += 1;

        const bias = keywords.bullish.some(keyword => text.includes(keyword))
            ? 'bullish'
            : keywords.bearish.some(keyword => text.includes(keyword))
                ? 'bearish'
                : 'neutral';

        return {
            ...item,
            score,
            bias
        };
    }).filter(item => item.score > 0);
}

function buildEventFilter() {
    const upcoming = getUpcomingScheduledEvents();
    const impactfulHeadlines = analyzeNewsHeadlineImpact(state.newsItems).slice(0, 4);
    const reasons = [];
    let level = 'green';

    if (upcoming.some(event => event.hoursUntil <= 24)) {
        level = 'red';
        reasons.push('Makro-Event innerhalb von 24h');
    } else if (upcoming.some(event => event.hoursUntil <= 72)) {
        level = 'yellow';
        reasons.push('Makro-Event innerhalb von 72h');
    }

    if (impactfulHeadlines.some(item => item.score >= 3)) {
        level = 'red';
        reasons.push('marktbewegende News erkannt');
    } else if (impactfulHeadlines.length && level !== 'red') {
        level = 'yellow';
        reasons.push('relevante News im Feed');
    }

    if (!reasons.length) {
        reasons.push('keine akuten Event-/News-Blocker');
    }

    const override = localStorage.getItem(EVENT_OVERRIDE_KEY) || 'auto';
    const finalLevel = override !== 'auto' ? override : level;
    const overrideSummary = override !== 'auto'
        ? `manuell auf ${override === 'red' ? 'Rot' : override === 'yellow' ? 'Gelb' : 'Gruen'} gesetzt`
        : null;

    return {
        level: finalLevel,
        label: finalLevel === 'red' ? 'Rot' : finalLevel === 'yellow' ? 'Gelb' : 'Gruen',
        summary: overrideSummary ? `${overrideSummary} | ${reasons.join(' | ')}` : reasons.join(' | '),
        override,
        upcoming,
        headlines: impactfulHeadlines,
        sources: [
            'Federal Reserve Kalender',
            'BLS Release Schedule',
            'CryptoCompare News API'
        ]
    };
}

function getMarketPhase(unified, trend, rsi, volatilityPercent) {
    const effectiveFearGreed = getEffectiveFearGreedValue();
    if (state.dataQuality?.mode === 'degraded') return 'Risk-Off';
    if (unified?.filters?.isHighVolatility && Math.abs(state.priceChange24h || 0) >= 4) {
        if (Number.isFinite(effectiveFearGreed) && effectiveFearGreed >= 78) return 'Euphoria';
        if (Number.isFinite(effectiveFearGreed) && effectiveFearGreed <= 25) return 'Panic';
        return 'Volatile Chop';
    }

    if (trend === 'up' && rsi >= 55) return 'Trend Up';
    if (trend === 'down' && rsi <= 45) return 'Trend Down';
    if (unified?.filters?.isLowLiquidity) return 'Volatile Chop';
    if (Math.abs(state.priceChange24h || 0) <= 1.2 && rsi >= 45 && rsi <= 55) return 'Range';
    if (volatilityPercent <= 0.012) return 'Squeeze vor Ausbruch';
    return 'Range';
}

function getEventRisk(unified) {
    const labels = [];
    let level = state.eventFilter?.level === 'red' ? 'red' : state.eventFilter?.level === 'yellow' ? 'yellow' : 'green';
    const isWeekend = [0, 6].includes(new Date().getDay());

    if (state.eventFilter?.summary) {
        labels.push(state.eventFilter.summary);
    }
    if (TRADER_PROFILE.avoidWeekends && isWeekend) {
        if (level !== 'red') level = 'yellow';
        labels.push('Profil meidet Wochenend-Liquiditaet');
    }
    if (state.dataQuality?.mode === 'degraded') {
        level = 'red';
        labels.push('Datenqualitaet eingeschraenkt');
    }
    if (unified?.filters?.isHighVolatility) {
        level = 'red';
        labels.push('hohe Volatilitaet');
    }
    if (unified?.filters?.isLowLiquidity || isWeekend) {
        if (level !== 'red') level = 'yellow';
        labels.push(isWeekend ? 'Wochenend-Liquiditaet' : 'duenne Liquiditaet');
    }
    if (!labels.length) {
        labels.push('keine operative Stoerung');
    }

    return {
        level,
        label: level === 'red' ? 'Rot' : level === 'yellow' ? 'Gelb' : 'Gruen',
        summary: labels.join(' | ')
    };
}

function getBestStrategyForPhase(phase, bias) {
    if (phase === 'Trend Up' || phase === 'Trend Down' || phase === 'Squeeze vor Ausbruch') {
        return {
            name: 'TrendGuard Dynamic',
            environment: 'starker Trend oder Breakout-Phase',
            trigger: bias === 'SHORT' ? '4h Close unter Trigger-Level + Momentum bestaetigt' : '4h Close ueber Trigger-Level + Momentum bestaetigt',
            entry: bias === 'SHORT' ? 'Breakdown oder Retest von unten' : 'Breakout oder Retest von oben'
        };
    }

    if (phase === 'Panic' || phase === 'Risk-Off') {
        return {
            name: 'Smart Accumulator',
            environment: 'nur fuer Spot / defensive Tage',
            trigger: 'nur Spot in Schwaeche oder bei sauberem Reclaim',
            entry: 'gestaffelte Spot-Akkumulation'
        };
    }

    return {
        name: 'Smart Money',
        environment: 'Range / Rejection / Intraday-Fokus',
        trigger: bias === 'SHORT' ? 'Rejection am Widerstand mit Bestaetigung' : 'Sweep + Reclaim / Breakout mit Follow-through',
        entry: bias === 'SHORT' ? 'nahe Resistance' : 'nahe Support oder nach Reclaim'
    };
}

function deriveDecisionStages(model) {
    const permission = model?.permission || 'NO TRADE';
    const signal = model?.unified?.signal || 'NEUTRAL';
    const setupGrade = model?.setupGrade || 'NO TRADE';
    const hasSetup = signal !== 'NEUTRAL' && ['A+', 'A', 'B'].includes(setupGrade);
    const blocked = permission === 'HIGH RISK DAY' || permission === 'NO TRADE';

    return {
        bias: {
            value: model?.bias || 'NO TRADE',
            tone: signal === 'LONG' ? 'bullish' : signal === 'SHORT' ? 'bearish' : 'neutral',
            note: model?.phase || 'Marktphase unklar'
        },
        setup: {
            value: hasSetup ? `SETUP ${setupGrade}` : blocked ? 'INVALID' : 'BUILDING',
            tone: hasSetup ? 'bullish' : blocked ? 'blocked' : 'neutral',
            note: hasSetup ? (model?.gradeReasons?.join(' | ') || 'Setup erkannt') : (model?.doNotTrade || 'Noch kein sauberes Setup')
        },
        trigger: {
            value: permission === 'TRADE ERLAUBT' ? 'LIVE' : permission === 'NUR BEI TRIGGER' ? 'ARMED' : permission === 'WAIT FOR CONFIRMATION' ? 'WAIT' : 'BLOCKED',
            tone: permission === 'TRADE ERLAUBT' ? 'bullish' : permission === 'NUR BEI TRIGGER' ? 'warning' : blocked ? 'blocked' : 'neutral',
            note: model?.validOnlyIf || model?.hardTrigger?.trigger || 'Trigger noch nicht aktiv'
        },
        execution: {
            value: permission === 'TRADE ERLAUBT' ? model?.actionNow || 'EXECUTE' : permission,
            tone: permission === 'TRADE ERLAUBT' ? 'bullish' : blocked ? 'blocked' : 'warning',
            note: permission === 'TRADE ERLAUBT' ? `RR ${model?.hardTrigger?.rr || '--'} | ${model?.topLeverage || 'ohne Hebel'}` : (model?.doNotTrade || 'Nicht operativ freigegeben')
        }
    };
}

function extractReasonCodes(model, unified) {
    const reasons = [
        ...(model?.noTradeReasons || []),
        ...(unified?.blockedReasons || [])
    ];
    return [...new Set(reasons.map(normalizeReasonCode).filter(Boolean))];
}

function buildDecisionModel() {
    const unified = getUnifiedTradeRecommendation();
    if (!unified) return null;

    const sourceQuality = state.sourceQuality || { confidence: 0, verdict: { blocked: true, restricted: true, summary: 'Quelle unbekannt', reasons: [] } };
    const price = state.price;
    const rsi = calculateRSI(state.priceHistory);
    const trend = determineTrend(state.priceHistory);
    const ema = calculateEMA(state.priceHistory, Math.min(20, Math.max(2, state.priceHistory.length)));
    const aboveEma = Number.isFinite(ema) ? price >= ema : false;
    const support = unified?.confluence?.sr?.nearestSupport ?? price * 0.97;
    const resistance = unified?.confluence?.sr?.nearestResistance ?? price * 1.03;
    const volatilityPercent = unified?.stopLoss ? Math.abs(unified.stopLoss - price) / price : 0.015;
    const weightedRR = unified?.weightedRR ?? 0;
    const phase = getMarketPhase(unified, trend, rsi, volatilityPercent);
    const eventRisk = getEventRisk(unified);
    const liveIntegrity = buildLiveIntegrityModel(unified);
    const inMiddleOfRange = price > support * 1.003 && price < resistance * 0.997;
    const macroSentimentConflict = Math.abs((state.scores.macro ?? 5) - (state.scores.sentiment ?? 5)) >= 2.5;
    const noTradeReasons = [];

    if (state.dataQuality?.mode === 'degraded') noTradeReasons.push('Datenqualitaet ist nicht operativ belastbar');
    if (sourceQuality.verdict?.blocked) noTradeReasons.push(sourceQuality.verdict.summary || 'Kein belastbares Tagesurteil');
    else if (sourceQuality.verdict?.restricted) noTradeReasons.push(...(sourceQuality.verdict.reasons || []).slice(0, 2));
    if (liveIntegrity.blocked) noTradeReasons.push(`Live Gate blockiert: ${liveIntegrity.blocker}`);
    if (inMiddleOfRange) noTradeReasons.push('Preis handelt mitten in der Range');
    if (macroSentimentConflict) noTradeReasons.push('Makro und Sentiment laufen gegeneinander');
    if (weightedRR > 0 && weightedRR < TRADER_PROFILE.minRR) noTradeReasons.push(`R:R unter ${TRADER_PROFILE.minRR}:1`);
    if (unified?.filters?.isHighVolatility) noTradeReasons.push('Volatilitaet zu chaotisch fuer sauberen Hebel-Entry');
    if (unified?.filters?.isLowLiquidity) noTradeReasons.push('Liquiditaet ist zu duenn');
    if (eventRisk.level === 'red') noTradeReasons.push(`Event-/News-Risiko rot: ${eventRisk.summary}`);
    else if (eventRisk.level === 'yellow') noTradeReasons.push(`Event-/News-Risiko gelb: ${eventRisk.summary}`);
    if (trend === 'sideways') noTradeReasons.push('Trend ist nicht eindeutig');
    if (TRADER_PROFILE.avoidWeekends && [0, 6].includes(new Date().getDay())) noTradeReasons.push('dein Profil blockt Wochenend-Trades');
    if ((state.fundingRate ?? 0) > 0 && state.longShortRatio.available && state.longShortRatio.long > 55 && unified.signal === 'LONG') noTradeReasons.push('Funding und Positioning sprechen gegen aggressiven Long-Entry');
    if (unified?.blockedReasons?.length) noTradeReasons.push(...unified.blockedReasons);

    const bias = unified.signal === 'LONG' ? 'LONG BIAS' : unified.signal === 'SHORT' ? 'SHORT BIAS' : phase === 'Squeeze vor Ausbruch' ? 'WAIT FOR BREAKOUT' : 'NO TRADE';

    let permission = 'NO TRADE';
    if (
        liveIntegrity.blocked ||
        state.dataQuality?.mode === 'degraded' ||
        sourceQuality.verdict?.blocked ||
        (TRADER_PROFILE.avoidMacroRisk && eventRisk.level === 'red') ||
        (TRADER_PROFILE.avoidWeekends && [0, 6].includes(new Date().getDay()))
    ) {
        permission = 'HIGH RISK DAY';
    } else if (sourceQuality.verdict?.restricted && unified.signal !== 'NEUTRAL') {
        permission = 'NUR BEI TRIGGER';
    } else if (unified.signal !== 'NEUTRAL' && !inMiddleOfRange && weightedRR >= TRADER_PROFILE.minRR && !macroSentimentConflict) {
        permission = 'TRADE ERLAUBT';
    } else if (phase === 'Squeeze vor Ausbruch' || unified.signal === 'NEUTRAL') {
        permission = 'WAIT FOR CONFIRMATION';
    } else {
        permission = 'NUR BEI TRIGGER';
    }

    const leverageAllowed = permission === 'TRADE ERLAUBT'
        && !liveIntegrity.caution
        && !unified.filters.isHighVolatility
        && !unified.filters.isLowLiquidity
        && unified.confidence >= 70
        && (!TRADER_PROFILE.avoidWeekends || ![0, 6].includes(new Date().getDay()));
    const effectiveFearGreed = getEffectiveFearGreedValue();
    const hasUsableFearGreed = Number.isFinite(effectiveFearGreed);
    const spotAllowed = !liveIntegrity.blocked
        && state.dataQuality?.mode !== 'degraded'
        && !sourceQuality.verdict?.blocked
        && ((hasUsableFearGreed && effectiveFearGreed <= 75) || TRADER_PROFILE.preferSpotOnRiskDays);

    const longTriggerPrice = Math.max(price, resistance);
    const shortTriggerPrice = Math.min(price, support);
    const longTriggerText = `Long nur bei Breakout ueber ${formatDecisionPrice(longTriggerPrice)} oder Reclaim nach Retest`;
    const shortTriggerText = `Short nur bei Rejection an ${formatDecisionPrice(resistance)} oder Breakdown unter ${formatDecisionPrice(shortTriggerPrice)}`;

    const horizons = {
        day: sourceQuality.verdict?.blocked
            ? 'Kein belastbares Tagesurteil'
            : sourceQuality.verdict?.restricted
                ? (unified.signal === 'NEUTRAL' ? 'Heute nur eingeschraenktes Urteil' : `${bias} nur mit Vorbehalt`)
                : permission === 'TRADE ERLAUBT'
                    ? `${bias} fuer heute`
                    : permission === 'HIGH RISK DAY'
                        ? 'Heute kein Trade'
                        : 'Heute nur Trigger handeln',
        intraday: permission === 'TRADE ERLAUBT' ? `${bias} intraday priorisiert` : phase === 'Range' ? 'Nur Scalps, kein Swing' : 'Warten auf Bestaetigung',
        swing: (trend === 'up' || trend === 'down') && permission !== 'HIGH RISK DAY' && !unified.filters.isLowLiquidity
            ? `${trend === 'up' && aboveEma ? 'Swing Longs' : trend === 'down' && !aboveEma ? 'Swing Shorts' : 'Swing nur mit Trendfilter'} nur bei Close-Bestaetigung`
            : 'Kein Swing-Follow-through',
        spot: spotAllowed
            ? ((hasUsableFearGreed && effectiveFearGreed < 35) ? 'Spot-Akkumulation erlaubt' : 'Spot selektiv erlaubt')
            : 'Spot heute aussetzen'
    };

    let setupGrade = 'NO TRADE';
    const gradeReasons = [];
    if (permission === 'TRADE ERLAUBT' && unified.confidence >= 78 && weightedRR >= (TRADER_PROFILE.minRR + 0.4) && eventRisk.level === 'green' && !unified.filters.isLowLiquidity) {
        setupGrade = 'A+';
        gradeReasons.push('starke Konfluenz');
        gradeReasons.push('sauberes R:R');
        gradeReasons.push('kein Event-Risiko');
    } else if (permission === 'TRADE ERLAUBT' && unified.confidence >= 68 && weightedRR >= TRADER_PROFILE.minRR && eventRisk.level !== 'red') {
        setupGrade = 'A';
        gradeReasons.push('handelbar mit Disziplin');
        gradeReasons.push('Risiko kontrollierbar');
    } else if ((permission === 'NUR BEI TRIGGER' || permission === 'WAIT FOR CONFIRMATION') && weightedRR >= Math.max(1.5, TRADER_PROFILE.minRR - 0.5)) {
        setupGrade = 'B';
        gradeReasons.push('nur bei sauberem Trigger');
        gradeReasons.push('kein Blind Entry');
    } else {
        gradeReasons.push('Edge nicht stark genug');
    }

    const bestStrategy = getBestStrategyForPhase(phase, unified.signal);
    const strategyStatus = permission === 'TRADE ERLAUBT'
        ? 'BESTAETIGT'
        : permission === 'NUR BEI TRIGGER'
            ? 'FAST AUSGELOEST'
            : permission === 'WAIT FOR CONFIRMATION'
                ? 'BEOBACHTEN'
                : permission === 'HIGH RISK DAY'
                    ? 'UNGUELTIG'
                    : 'INAKTIV';
    const topStatus = permission === 'TRADE ERLAUBT'
        ? bias
        : permission === 'HIGH RISK DAY'
            ? 'NO TRADE'
            : spotAllowed && hasUsableFearGreed && effectiveFearGreed < 35
                ? 'SPOT BUY'
                : permission === 'NUR BEI TRIGGER' || permission === 'WAIT FOR CONFIRMATION'
                    ? 'WAIT FOR TRIGGER'
                    : 'NO TRADE';
    const actionNow = permission === 'TRADE ERLAUBT'
        ? (unified.signal === 'SHORT' ? 'SHORT ONLY' : 'LONG ONLY')
        : permission === 'HIGH RISK DAY'
            ? 'NO TRADE'
            : 'WAIT';
    const primaryTrigger = unified.signal === 'SHORT'
        ? `Short erst unter ${formatDecisionPrice(shortTriggerPrice)} oder bei Rejection an ${formatDecisionPrice(resistance)}`
        : `Long erst ueber ${formatDecisionPrice(longTriggerPrice)} oder nach Reclaim-Retest`;
    const doNotTrade = [...new Set(noTradeReasons)][0] || 'Kein harter Blocker aktiv';
    const activeEntryZone = unified.entryZone
        ? `${formatDecisionPrice(unified.entryZone[0])} - ${formatDecisionPrice(unified.entryZone[1])}`
        : unified.signal === 'SHORT'
            ? `Rejection unter ${formatDecisionPrice(resistance)}`
            : `Retest ueber ${formatDecisionPrice(longTriggerPrice)}`;
    const takeProfits = [unified.tp1, unified.tp2, unified.tp3].filter(Number.isFinite).map(formatDecisionPrice).join(' / ') || '--';
    const primaryRR = weightedRR > 0 ? `1:${formatNumber(weightedRR, 1)}` : `unter ${TRADER_PROFILE.minRR}:1`;

    return {
        unified,
        bias,
        topStatus,
        permission,
        setupGrade,
        gradeReasons,
        phase,
        eventRisk,
        leverageAllowed,
        spotAllowed,
        horizons,
        noTradeReasons: [...new Set(noTradeReasons)].slice(0, 6),
        bestStrategy,
        strategyStatus,
        liveIntegrity,
        sourceQuality,
        actionNow,
        validOnlyIf: primaryTrigger,
        doNotTrade,
        topLeverage: leverageAllowed ? `JA, max ${Math.min(TRADER_PROFILE.maxLeverage, parseInt(unified.maxLeverage, 10) || TRADER_PROFILE.maxLeverage)}x` : permission === 'TRADE ERLAUBT' ? 'NUR KLEIN' : 'NEIN',
        topSpot: spotAllowed ? 'JA' : 'NEIN',
        validity: permission === 'TRADE ERLAUBT' ? 'gueltig bis naechstem 4h Close' : 'neu pruefen zum naechsten 4h Close',
        actionBox: {
            direction: bias,
            strategy: bestStrategy.name,
            longTrigger: longTriggerText,
            shortTrigger: shortTriggerText,
            entryZone: activeEntryZone,
            invalidation: formatDecisionPrice(unified.stopLoss || (unified.signal === 'SHORT' ? resistance * 1.005 : support * 0.995)),
            stopLoss: formatDecisionPrice(unified.stopLoss),
            takeProfits,
            rr: primaryRR,
            block: doNotTrade
        },
        triggerLong: {
            label: longTriggerText,
            entry: unified.signal === 'LONG' && unified.entryZone ? `${formatDecisionPrice(unified.entryZone[0])} - ${formatDecisionPrice(unified.entryZone[1])}` : `Retest ueber ${formatDecisionPrice(longTriggerPrice)}`,
            invalidation: formatDecisionPrice(unified.signal === 'LONG' ? unified.stopLoss : support * 0.995),
            validUntil: 'naechster 4h Close'
        },
        triggerShort: {
            label: shortTriggerText,
            entry: unified.signal === 'SHORT' && unified.entryZone ? `${formatDecisionPrice(unified.entryZone[0])} - ${formatDecisionPrice(unified.entryZone[1])}` : `Rejection unter ${formatDecisionPrice(resistance)}`,
            invalidation: formatDecisionPrice(unified.signal === 'SHORT' ? unified.stopLoss : resistance * 1.005),
            validUntil: 'naechster 4h Close'
        },
        hardTrigger: {
            direction: unified.signal === 'SHORT' ? 'SHORT SETUP' : unified.signal === 'LONG' ? 'LONG SETUP' : 'WAIT MODE',
            trigger: primaryTrigger,
            invalidation: formatDecisionPrice(unified.stopLoss || (unified.signal === 'SHORT' ? resistance * 1.005 : support * 0.995)),
            rr: primaryRR,
            validity: 'naechster 4h Close',
            block: doNotTrade
        },
        stages: null,
        reasonCodes: [],
        styleFit: leverageAllowed || (spotAllowed && permission !== 'HIGH RISK DAY')
            ? 'passt zu deinem Stil'
            : 'passt heute nicht zu deinem Stil'
    };
}

function updateDecisionPanel() {
    const model = buildDecisionModel();
    if (!model) return;
    model.stages = deriveDecisionStages(model);
    model.reasonCodes = extractReasonCodes(model, model.unified);

    const actionNowEl = document.getElementById('actionNowValue');
    const validOnlyIfEl = document.getElementById('validOnlyIfValue');
    const doNotTradeEl = document.getElementById('doNotTradeValue');
    const topLeverageEl = document.getElementById('topLeverageValue');
    const topSpotEl = document.getElementById('topSpotValue');
    const permissionEl = document.getElementById('tradePermissionValue');
    const permissionCard = document.getElementById('tradePermissionCard');
    const liveIntegrityCard = document.getElementById('liveIntegrityCard');
    const liveIntegrityStatusEl = document.getElementById('liveIntegrityStatus');
    const liveConfidenceEl = document.getElementById('liveConfidenceValue');
    const liveFreshnessEl = document.getElementById('liveFreshnessValue');
    const liveSourcesEl = document.getElementById('liveSourcesValue');
    const liveBlockerEl = document.getElementById('liveBlockerValue');
    const phaseEl = document.getElementById('marketPhaseValue');
    const validityEl = document.getElementById('validityWindowValue');
    const biasEl = document.getElementById('preferredDirectionValue');
    const gradeEl = document.getElementById('setupGradeValue');
    const gradeCard = document.getElementById('setupGradeCard');
    const gradeReasonEl = document.getElementById('setupGradeReason');
    const strategyEl = document.getElementById('bestStrategyValue');
    const eventRiskEl = document.getElementById('eventRiskValue');
    const leverageEl = document.getElementById('leveragePermissionValue');
    const spotEl = document.getElementById('spotPermissionValue');
    const styleEl = document.getElementById('styleFitValue');
    const overrideSelect = document.getElementById('eventOverrideSelect');
    const biasStageValue = document.getElementById('biasStageValue');
    const biasStageNote = document.getElementById('biasStageNote');
    const setupStageValue = document.getElementById('setupStageValue');
    const setupStageNote = document.getElementById('setupStageNote');
    const triggerStageValue = document.getElementById('triggerStageValue');
    const triggerStageNote = document.getElementById('triggerStageNote');
    const executionStageValue = document.getElementById('executionStageValue');
    const executionStageNote = document.getElementById('executionStageNote');

    if (overrideSelect && overrideSelect.value !== (state.eventFilter?.override || 'auto')) {
        overrideSelect.value = state.eventFilter?.override || 'auto';
    }

    actionNowEl.textContent = model.actionNow;
    validOnlyIfEl.textContent = model.validOnlyIf;
    doNotTradeEl.textContent = model.doNotTrade;
    topLeverageEl.textContent = model.topLeverage;
    topSpotEl.textContent = model.topSpot;

    permissionEl.textContent = model.permission;
    permissionCard.className = `decision-permission ${model.permission.toLowerCase().replace(/\s+/g, '-')}`;
    permissionCard.querySelector('.decision-kicker').textContent = `Status: ${model.topStatus}`;
    liveIntegrityCard.className = `integrity-card ${model.liveIntegrity.status.toLowerCase().replace(/\s+/g, '-')}`;
    liveIntegrityStatusEl.textContent = model.liveIntegrity.status;
    liveConfidenceEl.textContent = `${model.liveIntegrity.confidence}%`;
    liveFreshnessEl.textContent = model.liveIntegrity.freshness;
    liveSourcesEl.textContent = model.liveIntegrity.sourceState;
    liveBlockerEl.textContent = model.liveIntegrity.blocker;
    phaseEl.textContent = model.phase;
    validityEl.textContent = model.validity;
    biasEl.textContent = model.bias;
    gradeEl.textContent = model.setupGrade;
    gradeCard.className = `decision-item setup-grade-card grade-${model.setupGrade.toLowerCase().replace('+', 'plus').replace(/\s+/g, '-')}`;
    gradeReasonEl.textContent = model.gradeReasons.join(' | ');
    strategyEl.textContent = `${model.bestStrategy.name} (${model.strategyStatus})`;
    eventRiskEl.textContent = `${model.eventRisk.label} - ${model.eventRisk.summary}`;
    eventRiskEl.className = `decision-value event-${model.eventRisk.level}`;
    leverageEl.textContent = model.leverageAllowed ? `Ja, max ${Math.min(TRADER_PROFILE.maxLeverage, parseInt(model.unified.maxLeverage, 10) || TRADER_PROFILE.maxLeverage)}x` : 'Nein';
    spotEl.textContent = model.spotAllowed ? 'Ja' : 'Nein';
    styleEl.textContent = `${model.styleFit} / ${TRADER_PROFILE.style} / ${TRADER_PROFILE.execution}`;
    if (biasStageValue) biasStageValue.textContent = model.stages.bias.value;
    if (biasStageNote) biasStageNote.textContent = model.stages.bias.note;
    if (setupStageValue) setupStageValue.textContent = model.stages.setup.value;
    if (setupStageNote) setupStageNote.textContent = model.stages.setup.note;
    if (triggerStageValue) triggerStageValue.textContent = model.stages.trigger.value;
    if (triggerStageNote) triggerStageNote.textContent = model.stages.trigger.note;
    if (executionStageValue) executionStageValue.textContent = model.stages.execution.value;
    if (executionStageNote) executionStageNote.textContent = model.stages.execution.note;

    [
        ['biasStageCard', model.stages.bias],
        ['setupStageCard', model.stages.setup],
        ['triggerStageCard', model.stages.trigger],
        ['executionStageCard', model.stages.execution]
    ].forEach(([id, payload]) => {
        const el = document.getElementById(id);
        if (el) el.className = `execution-step ${payload.tone}`;
    });

    document.getElementById('todayVerdict').textContent = model.horizons.day;
    document.getElementById('intradayVerdict').textContent = model.horizons.intraday;
    document.getElementById('swingVerdict').textContent = model.horizons.swing;
    document.getElementById('spotVerdict').textContent = model.horizons.spot;
    document.getElementById('hardTriggerDirection').textContent = model.hardTrigger.direction;
    document.getElementById('hardTriggerValue').textContent = model.hardTrigger.trigger;
    document.getElementById('hardTriggerInvalidation').textContent = model.hardTrigger.invalidation;
    document.getElementById('hardTriggerRR').textContent = model.hardTrigger.rr;
    document.getElementById('hardTriggerValidity').textContent = model.validity;
    document.getElementById('hardTriggerBlock').textContent = model.hardTrigger.block;

    document.getElementById('longTriggerLabel').textContent = model.triggerLong.label;
    document.getElementById('longTriggerEntry').textContent = model.triggerLong.entry;
    document.getElementById('longTriggerInvalidation').textContent = model.triggerLong.invalidation;
    document.getElementById('longTriggerValidity').textContent = model.triggerLong.validUntil;

    document.getElementById('shortTriggerLabel').textContent = model.triggerShort.label;
    document.getElementById('shortTriggerEntry').textContent = model.triggerShort.entry;
    document.getElementById('shortTriggerInvalidation').textContent = model.triggerShort.invalidation;
    document.getElementById('shortTriggerValidity').textContent = model.triggerShort.validUntil;

    document.getElementById('strategyStatusValue').textContent = model.strategyStatus;
    document.getElementById('strategyTriggerValue').textContent = model.bestStrategy.trigger;
    document.getElementById('strategyInvalidationValue').textContent = model.unified.stopLoss ? formatDecisionPrice(model.unified.stopLoss) : 'erst bei Trigger definieren';
    document.getElementById('strategyEntryValue').textContent = model.bestStrategy.entry;
    document.getElementById('strategyEnvironmentValue').textContent = `${model.bestStrategy.environment} / ${model.validity}`;

    const whyList = document.getElementById('whyNoTradeList');
    whyList.innerHTML = model.noTradeReasons.length
        ? model.noTradeReasons.map(reason => `<li>${reason}</li>`).join('')
        : '<li>Kein harter Blocker aktiv. Trigger und Risiko-Plan entscheiden.</li>';
}

function setTextIfExists(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function applyDecisionFallbackState(message) {
    [
        ['actionNowValue', 'NO TRADE'],
        ['validOnlyIfValue', 'erst nach erfolgreichem Datenupdate'],
        ['doNotTradeValue', message],
        ['topLeverageValue', 'NEIN'],
        ['topSpotValue', 'NEIN'],
        ['tradePermissionValue', 'NO TRADE'],
        ['liveIntegrityStatus', 'BLOCKED'],
        ['liveConfidenceValue', '0%'],
        ['liveFreshnessValue', 'kein gueltiges Update'],
        ['liveSourcesValue', 'Kernbereiche unvollstaendig'],
        ['liveBlockerValue', message],
        ['biasStageValue', 'NO TRADE'],
        ['biasStageNote', 'Ohne Daten kein Bias'],
        ['setupStageValue', 'INVALID'],
        ['setupStageNote', 'Setup nicht belastbar'],
        ['triggerStageValue', 'BLOCKED'],
        ['triggerStageNote', 'Kein Trigger ohne Daten'],
        ['executionStageValue', 'HIGH RISK DAY'],
        ['executionStageNote', message],
        ['preferredDirectionValue', 'NO TRADE'],
        ['setupGradeValue', 'NO TRADE'],
        ['setupGradeReason', 'Ohne frische Kerndaten keine Freigabe'],
        ['marketPhaseValue', 'Risk-Off'],
        ['validityWindowValue', 'nach Datenupdate neu pruefen'],
        ['bestStrategyValue', 'keine operative Freigabe'],
        ['eventRiskValue', 'Rot - Daten fehlen'],
        ['leveragePermissionValue', 'Nein'],
        ['spotPermissionValue', 'Nein'],
        ['styleFitValue', 'passt heute nicht zu deinem Stil'],
        ['todayVerdict', 'Heute kein Trade'],
        ['intradayVerdict', 'Warten auf neue Daten'],
        ['swingVerdict', 'Kein Swing ohne frische Daten'],
        ['spotVerdict', 'Spot heute aussetzen'],
        ['hardTriggerDirection', 'WAIT MODE'],
        ['hardTriggerValue', 'Kein Trigger ohne Daten'],
        ['hardTriggerInvalidation', 'kein Live-Wert'],
        ['hardTriggerRR', 'kein Live-Wert'],
        ['hardTriggerValidity', 'neu pruefen nach Datenupdate'],
        ['hardTriggerBlock', message]
    ].forEach(([id, value]) => setTextIfExists(id, value));

    const permissionCard = document.getElementById('tradePermissionCard');
    if (permissionCard) permissionCard.className = 'decision-permission high-risk-day';
    const liveIntegrityCard = document.getElementById('liveIntegrityCard');
    if (liveIntegrityCard) liveIntegrityCard.className = 'integrity-card blocked';
    ['biasStageCard', 'setupStageCard', 'triggerStageCard', 'executionStageCard'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.className = 'execution-step blocked';
    });

    const whyList = document.getElementById('whyNoTradeList');
    if (whyList) whyList.innerHTML = `<li>${message}</li>`;

    [
        ['smartMoneyEnvironment', 'keine Freigabe'],
        ['smartMoneyTrigger', 'auf frische Daten warten'],
        ['smartMoneyInvalidation', 'kein Live-Wert'],
        ['smartMoneyEntryPref', 'kein Live-Wert'],
        ['smartMoneyRisk', message],
        ['trendStrategyEnvironment', 'keine Freigabe'],
        ['trendStrategyTrigger', 'auf frische Daten warten'],
        ['trendStrategyInvalidation', 'kein Live-Wert'],
        ['trendStrategyEntry', 'kein Live-Wert'],
        ['trendStrategyRisk', message],
        ['spotStrategyEnvironment', 'keine Freigabe'],
        ['spotStrategyTrigger', 'auf frische Daten warten'],
        ['spotStrategyInvalidation', 'kein Live-Wert'],
        ['spotStrategyEntry', 'kein Live-Wert'],
        ['spotStrategyRisk', message]
    ].forEach(([id, value]) => setTextIfExists(id, value));

    applyStrategyCardState('smartMoneyDecisionCard', 'smartMoneyStatus', 'smartMoneyPriority', { state: 'UNGUELTIG', priority: 'niedrig' });
    applyStrategyCardState('trendDecisionCard', 'trendStrategyStatus', 'trendStrategyPriority', { state: 'UNGUELTIG', priority: 'niedrig' });
    applyStrategyCardState('spotDecisionCard', 'spotStrategyStatus', 'spotStrategyPriority', { state: 'UNGUELTIG', priority: 'niedrig' });
    updateRainbowVisual();
}

function applyStrategyCardState(cardId, statusId, priorityId, payload) {
    const card = document.getElementById(cardId);
    const statusEl = document.getElementById(statusId);
    const priorityEl = document.getElementById(priorityId);
    if (!card || !statusEl || !priorityEl) return;
    card.dataset.state = payload.state.toLowerCase().replace(/\s+/g, '-');
    statusEl.textContent = payload.state;
    priorityEl.textContent = `Prioritaet: ${payload.priority}`;
}

function renderRainbowVisual(bandId, markerId, metaId) {
    const bandEl = document.getElementById(bandId);
    const markerEl = document.getElementById(markerId);
    const metaEl = document.getElementById(metaId);
    if (!bandEl || !markerEl || !metaEl) return;

    const price = Number(state.price);
    const ath = Number(state.ath);
    if (!Number.isFinite(price) || !Number.isFinite(ath) || ath <= 0) {
        bandEl.textContent = 'Keine Daten';
        markerEl.style.left = '50%';
        markerEl.style.background = '#0b0f18';
        metaEl.textContent = 'Modell: Warte auf Preisdaten | Abweichung zum ATH: --';
        return;
    }

    const ratio = price / ath;
    const bands = [
        { max: 0.35, label: 'Fire Sale', tone: '#2f7af8', pos: 7, desc: 'deutlich unterbewertet' },
        { max: 0.55, label: 'Buy Zone', tone: '#22c55e', pos: 22, desc: 'attraktive Kaufzone' },
        { max: 0.78, label: 'Accumulation', tone: '#84cc16', pos: 38, desc: 'solide Akkumulation' },
        { max: 1.05, label: 'Fair Value', tone: '#f59e0b', pos: 54, desc: 'nahe fairer Bewertung' },
        { max: 1.35, label: 'Warm', tone: '#f97316', pos: 72, desc: 'heiss gelaufen' },
        { max: Infinity, label: 'Euphoria', tone: '#a855f7', pos: 91, desc: 'stark ueberhitzt' }
    ];

    const activeBand = bands.find(band => ratio <= band.max) || bands[bands.length - 1];
    const clampedRatio = Math.max(0, Math.min(1.6, ratio));
    const markerPosition = Math.max(4, Math.min(96, (clampedRatio / 1.6) * 100));

    bandEl.textContent = activeBand.label;
    bandEl.style.color = activeBand.tone;
    markerEl.style.left = `${markerPosition}%`;
    markerEl.style.background = activeBand.tone;

    const athGap = ((price / ath) - 1) * 100;
    metaEl.textContent = `Modell: ${activeBand.desc} | Abweichung zum ATH: ${formatSignedPercent(athGap, 1)}`;
}

function updateRainbowVisual() {
    renderRainbowVisual('rainbowBandLabelTop', 'rainbowMarkerTop', 'rainbowMetaTop');
    renderRainbowVisual('rainbowBandLabel', 'rainbowMarker', 'rainbowMeta');
}

function updateStrategyDecisionCards() {
    const model = buildDecisionModel();
    if (!model) return;

    const baseState = model.strategyStatus;
    const riskText = model.liveIntegrity.blocked
        ? `Nicht handeln solange ${model.liveIntegrity.blocker}`
        : model.doNotTrade;

    applyStrategyCardState('smartMoneyDecisionCard', 'smartMoneyStatus', 'smartMoneyPriority', {
        state: model.phase === 'Range' || model.phase === 'Volatile Chop'
            ? (model.permission === 'TRADE ERLAUBT' ? 'BESTAETIGT' : model.permission === 'NUR BEI TRIGGER' ? 'FAST AUSGELOEST' : 'BEOBACHTEN')
            : 'INAKTIV',
        priority: model.bestStrategy.name === 'Smart Money' ? 'hoch' : 'sekundaer'
    });
    setTextIfExists('smartMoneyEnvironment', 'Range / Rejection / Intraday-Fokus');
    setTextIfExists('smartMoneyTrigger', model.unified.signal === 'SHORT' ? model.triggerShort.label : model.triggerLong.label);
    setTextIfExists('smartMoneyInvalidation', model.actionBox.invalidation);
    setTextIfExists('smartMoneyEntryPref', model.unified.signal === 'SHORT' ? model.triggerShort.entry : model.triggerLong.entry);
    setTextIfExists('smartMoneyRisk', riskText);

    applyStrategyCardState('trendDecisionCard', 'trendStrategyStatus', 'trendStrategyPriority', {
        state: model.bestStrategy.name === 'TrendGuard Dynamic'
            ? baseState
            : model.phase === 'Trend Up' || model.phase === 'Trend Down' || model.phase === 'Squeeze vor Ausbruch'
                ? 'BEOBACHTEN'
                : 'INAKTIV',
        priority: model.bestStrategy.name === 'TrendGuard Dynamic' ? 'hoch' : 'sekundaer'
    });
    setTextIfExists('trendStrategyEnvironment', 'starker Trend oder Breakout-Phase');
    setTextIfExists('trendStrategyTrigger', model.bestStrategy.name === 'TrendGuard Dynamic' ? model.bestStrategy.trigger : 'Warte auf Trendfolge mit 4h Close');
    setTextIfExists('trendStrategyInvalidation', model.actionBox.invalidation);
    setTextIfExists('trendStrategyEntry', model.bestStrategy.name === 'TrendGuard Dynamic' ? model.bestStrategy.entry : 'Breakout oder Retest von oben/unten');
    setTextIfExists('trendStrategyRisk', riskText);

    const effectiveFearGreed = getEffectiveFearGreedValue();
    applyStrategyCardState('spotDecisionCard', 'spotStrategyStatus', 'spotStrategyPriority', {
        state: model.spotAllowed ? ((Number.isFinite(effectiveFearGreed) && effectiveFearGreed < 35) ? 'BESTAETIGT' : 'BEOBACHTEN') : 'INAKTIV',
        priority: model.bestStrategy.name === 'Smart Accumulator' || model.topStatus === 'SPOT BUY' ? 'hoch' : 'ergaenzend'
    });
    setTextIfExists('spotStrategyEnvironment', 'defensive Tage / Panic / Risk-Off');
    setTextIfExists('spotStrategyTrigger', model.topStatus === 'SPOT BUY' ? 'Spot in Schwaeche staffeln oder Reclaim kaufen' : 'Nur bei deutlicher Schwaeche oder sauberem Reclaim');
    setTextIfExists('spotStrategyInvalidation', model.liveIntegrity.blocked ? 'erst nach frischen Daten neu pruefen' : 'kein Spot, wenn Event-Risiko rot und Profil blockt');
    setTextIfExists('spotStrategyEntry', Number.isFinite(effectiveFearGreed) && effectiveFearGreed < 35 ? 'gestaffelte Spot-Kaeufe' : 'nur kleine Spot-Tranche');
    setTextIfExists('spotStrategyRisk', riskText);
    updateRainbowVisual();
}

function updateTradeSetup() {
    const unified = getUnifiedTradeRecommendation();
    const direction = document.getElementById('tradeDirection');
    const directionValue = direction.querySelector('.direction-value');
    const signal = unified?.signal || state.signal;

    direction.className = `trade-direction ${signal.toLowerCase()}`;
    directionValue.textContent = signal === 'LONG' ? 'LONG' :
        signal === 'SHORT' ? 'SHORT' :
            'NEUTRAL';

    if (unified && signal !== 'NEUTRAL' && unified.entryZone && unified.stopLoss && unified.tp1 && unified.tp2 && unified.tp3) {
        document.getElementById('entryZone').textContent = `$${formatNumber(unified.entryZone[0], 0)} - $${formatNumber(unified.entryZone[1], 0)}`;
        document.getElementById('stopLoss').textContent = `$${formatNumber(unified.stopLoss, 0)}`;
        document.getElementById('slPercent').textContent = `${signal === 'SHORT' ? '(+' : '(-'}${formatNumber(unified.slPercent, 1)}%)`;
        document.getElementById('tp1').textContent = `$${formatNumber(unified.tp1, 0)}`;
        document.getElementById('tp1rr').textContent = `50% @ 1:${formatNumber(unified.rr[0], 1)}`;
        document.getElementById('tp2').textContent = `$${formatNumber(unified.tp2, 0)}`;
        document.getElementById('tp2rr').textContent = `30% @ 1:${formatNumber(unified.rr[1], 1)}`;
        document.getElementById('tp3').textContent = `$${formatNumber(unified.tp3, 0)}`;
        document.getElementById('tp3rr').textContent = `20% @ 1:${formatNumber(unified.rr[2], 1)}`;
    } else {
        const blocked = unified?.blockedReasons?.[0];
        document.getElementById('entryZone').textContent = blocked ? `Kein Trade (${blocked})` : 'Kein Trade empfohlen';
        document.getElementById('stopLoss').textContent = 'Kein Live-Wert';
        document.getElementById('slPercent').textContent = '';
        document.getElementById('tp1').textContent = 'Kein Live-Wert';
        document.getElementById('tp1rr').textContent = '';
        document.getElementById('tp2').textContent = 'Kein Live-Wert';
        document.getElementById('tp2rr').textContent = '';
        document.getElementById('tp3').textContent = 'Kein Live-Wert';
        document.getElementById('tp3rr').textContent = '';
    }

    document.getElementById('positionSize').textContent = unified?.positionSize || '1%';
    document.getElementById('maxLeverage').textContent = unified?.maxLeverage || '2x';
}
function updateKeyLevels() {
    const price = state.price;

    // Resistances
    const resistances = [
        { price: price * 1.03, desc: 'Kurzfristig' },
        { price: price * 1.06, desc: 'Psychologisch' },
        { price: price * 1.10, desc: 'Wöchentlich' },
        { price: state.ath, desc: 'ATH' }
    ].sort((a, b) => a.price - b.price);

    document.getElementById('resistancesList').innerHTML = resistances.map(r =>
        `<li><span class="level-price">$${formatNumber(r.price, 0)}</span><span class="level-desc">${r.desc}</span></li>`
    ).join('');

    // Supports
    const supports = [
        { price: price * 0.97, desc: 'Kurzfristig' },
        { price: price * 0.94, desc: 'Täglich' },
        { price: price * 0.90, desc: 'Wöchentlich' },
        { price: price * 0.85, desc: 'Major Support' }
    ].sort((a, b) => b.price - a.price);

    document.getElementById('supportsList').innerHTML = supports.map(s =>
        `<li><span class="level-price">$${formatNumber(s.price, 0)}</span><span class="level-desc">${s.desc}</span></li>`
    ).join('');
}

function updateRiskFactors() {
    const price = state.price;
    const eventFilter = state.eventFilter || { upcoming: [], headlines: [], summary: 'Keine Event-Daten' };

    // Invalidation factors
    const invalidations = [];

    if (state.signal === 'LONG') {
        invalidations.push(`Daily Close unter $${formatNumber(price * 0.94, 0)}`);
        invalidations.push('Fear & Greed steigt über 60 ohne Preisanstieg');
        invalidations.push('Funding Rate wird stark positiv (>0.05%)');
    } else if (state.signal === 'SHORT') {
        invalidations.push(`Daily Close über $${formatNumber(price * 1.06, 0)}`);
        invalidations.push('Fear & Greed fällt unter 25');
        invalidations.push('Massive ETF-Zuflüsse');
    } else {
        invalidations.push('Klarer Ausbruch aus der Range');
        invalidations.push('Extreme Sentiment-Veränderung');
    }

    document.getElementById('invalidationList').innerHTML = invalidations.map(i =>
        `<li>${i}</li>`
    ).join('');

    const events = [
        ...eventFilter.upcoming.slice(0, 3).map(event => {
            const ts = Number.isFinite(event.ts) ? new Date(event.ts).toLocaleString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }) : '--';
            return `${event.title} | ${ts} | ${event.source}`;
        }),
        ...eventFilter.headlines.slice(0, 2).map(item => {
            const bias = item.bias === 'bullish' ? 'bullish' : item.bias === 'bearish' ? 'bearish' : 'neutral';
            return `News (${bias}): ${item.title}`;
        })
    ];

    document.getElementById('eventsList').innerHTML = (events.length ? events : [eventFilter.summary]).map(e =>
        `<li>${e}</li>`
    ).join('');
}

function updateScoreCard() {
    const weightedScore = calculateScores();

    // Individual scores
    const scores = [
        { id: 'tech', value: state.scores.technical },
        { id: 'onchain', value: state.scores.onchain },
        { id: 'sentiment', value: state.scores.sentiment },
        { id: 'macro', value: state.scores.macro }
    ];

    scores.forEach(s => {
        const fill = document.getElementById(`${s.id}ScoreFill`);
        const valueEl = document.getElementById(`${s.id}Score`);

        fill.style.width = `${s.value * 10}%`;
        fill.style.background = s.value >= 6 ? 'var(--bullish)' :
            s.value <= 4 ? 'var(--bearish)' :
                'var(--neutral)';
        valueEl.textContent = `${formatNumber(s.value, 1)}/10`;
    });

    // Total score
    document.getElementById('totalScore').textContent = `${formatNumber(weightedScore, 1)}/10`;
}

function updateSignalBanner() {
    const unified = getUnifiedTradeRecommendation();
    const decisionModel = buildDecisionModel();
    if (decisionModel) {
        decisionModel.stages = deriveDecisionStages(decisionModel);
        decisionModel.reasonCodes = extractReasonCodes(decisionModel, unified);
    }
    const activeSignal = unified?.signal || state.signal;
    const activeConfidence = decisionModel?.sourceQuality?.confidence ?? unified?.confidence ?? state.confidence;
    const qualityBlocked = state.dataQuality?.mode === 'degraded' || decisionModel?.sourceQuality?.verdict?.blocked;
    const qualityRestricted = decisionModel?.sourceQuality?.verdict?.restricted;
    const operationalSignal = qualityBlocked || decisionModel?.permission !== 'TRADE ERLAUBT'
        ? 'NO_TRADE'
        : activeSignal;
    const auditBlockedReasons = [
        ...(unified?.blockedReasons || []),
        ...(decisionModel?.noTradeReasons || [])
    ];

    const banner = document.getElementById('signalBanner');
    const signalValue = document.getElementById('primarySignal');
    const confidenceFill = document.getElementById('confidenceFill');
    const confidenceValue = document.getElementById('confidenceValue');
    const summary = document.getElementById('signalSummary');
    const explanation = document.getElementById('signalExplanationContent');

    const bannerMode = operationalSignal === 'NO_TRADE' ? 'no-trade' : operationalSignal.toLowerCase();
    banner.className = `signal-banner ${bannerMode}`;
    signalValue.textContent = operationalSignal === 'NO_TRADE' ? 'NO TRADE' : operationalSignal;
    signalValue.dataset.state = bannerMode;
    confidenceFill.style.width = `${activeConfidence}%`;
    confidenceValue.textContent = `${Math.round(activeConfidence)}%`;

    let summaryText = '';
    let explanationText = '';

    if (qualityBlocked) {
        summaryText = 'Datenqualität ist zu schwach für eine operative Freigabe.';
        explanationText = `<strong>NO TRADE bedeutet:</strong> Das Dashboard blockiert die operative Nutzung.
            <br><br><strong>Datenstatus:</strong> ${state.dataQuality.summary}
            <br><strong>Probleme:</strong> ${state.dataQuality.issues.join(' | ') || 'n/a'}
            ${state.dataQuality.warnings?.length ? `<br><strong>Warnungen:</strong> ${state.dataQuality.warnings.join(' | ')}` : ''}`;
    } else if (qualityRestricted) {
        summaryText = 'Das Urteil ist heute nur eingeschraenkt belastbar.';
        explanationText = `<strong>Vorsichtiges Urteil:</strong> Es gibt einen Bias, aber die Datengrundlage ist nicht vollstaendig robust.
            <br><br><strong>Konfidenz:</strong> ${Math.round(activeConfidence)}%
            <br><strong>Qualitaetsgruende:</strong> ${(decisionModel?.sourceQuality?.reducedBy || []).slice(0, 3).join(' | ') || 'n/a'}`;
    } else if (operationalSignal === 'LONG') {
        summaryText = 'Coach-Konfluenz zeigt ein bullisches Setup.';
        explanationText = `<strong>LONG bedeutet:</strong> Die Daten deuten auf steigende Preise hin.
            <br><br><strong>Konfidenz:</strong> ${Math.round(activeConfidence)}%
            <br><strong>Confluence Score:</strong> ${formatNumber(unified?.confluence?.total ?? calculateWeightedScore(), 1)}/10
            <br><strong>Gewichtetes Ziel-R:R:</strong> 1:${formatNumber(unified?.weightedRR ?? 0, 2)}`;
    } else if (operationalSignal === 'SHORT') {
        summaryText = 'Coach-Konfluenz zeigt ein bearishes Setup mit klarem Risiko-Management.';
        explanationText = `<strong>SHORT bedeutet:</strong> Die Daten deuten auf fallende Preise hin.
            <br><br><strong>Konfidenz:</strong> ${Math.round(activeConfidence)}%
            <br><strong>Confluence Score:</strong> ${formatNumber(unified?.confluence?.total ?? calculateWeightedScore(), 1)}/10
            <br><strong>Gewichtetes Ziel-R:R:</strong> 1:${formatNumber(unified?.weightedRR ?? 0, 2)}`;
    } else {
        summaryText = 'Gemischte Signale. Aktuell kein klarer statistischer Vorteil.';
        explanationText = `<strong>NEUTRAL bedeutet:</strong> Kein Trade empfohlen.
            <br><br><strong>Konfidenz:</strong> ${Math.round(activeConfidence)}%
            <br><strong>Confluence Score:</strong> ${formatNumber(unified?.confluence?.total ?? calculateWeightedScore(), 1)}/10
            <br><strong>Bias / Setup / Trigger / Execution:</strong> ${decisionModel?.stages?.bias?.value || 'n/a'} / ${decisionModel?.stages?.setup?.value || 'n/a'} / ${decisionModel?.stages?.trigger?.value || 'n/a'} / ${decisionModel?.stages?.execution?.value || 'n/a'}
            ${auditBlockedReasons.length ? `<br><strong>Filter:</strong> ${[...new Set(auditBlockedReasons)].join(' | ')}` : ''}`;
    }

    summary.textContent = summaryText;
    explanation.innerHTML = explanationText;
    const didLog = logSignalSnapshot('dashboard', {
        signal: operationalSignal,
        confidence: Math.round(activeConfidence),
        permission: decisionModel?.permission || 'n/a',
        quality: state.dataQuality,
        blockedReasons: [...new Set(auditBlockedReasons)],
        stages: decisionModel?.stages || null,
        reasonCodes: decisionModel?.reasonCodes || []
    });
    if (didLog) {
        renderSignalAuditLogV2();
    }

    updateNoTradeWarning();
    updateScoreInterpretation();
    NotificationSystem.checkSignalChange(
        operationalSignal === 'NO_TRADE' ? 'NEUTRAL' : operationalSignal,
        activeConfidence,
        state.price,
        getActiveSignalSource(activeSignal),
        { permission: decisionModel?.permission || 'n/a' }
    );
}

function getActiveSignalSource(activeSignal) {
    if (activeSignal === 'LONG' && typeof SmartMoneySignal !== 'undefined') {
        const smState = SmartMoneySignal?.state;
        if (smState?.signal === 'LONG' && (smState?.signalStrength ?? 0) >= 3) {
            return 'Smart Money Strategy';
        }
    }

    return 'Coach-Konfluenz';
}
function calculateWeightedScore() {
    return state.scores.technical * CONFIG.weights.technical +
        state.scores.onchain * CONFIG.weights.onchain +
        state.scores.sentiment * CONFIG.weights.sentiment +
        state.scores.macro * CONFIG.weights.macro;
}

function updateNoTradeWarning() {
    const unified = getUnifiedTradeRecommendation();
    const model = buildDecisionModel();
    const activeSignal = unified?.signal || state.signal;

    const warningBox = document.getElementById('noTradeWarning');
    const reasonsEl = document.getElementById('noTradeReasons');

    if (activeSignal === 'NEUTRAL') {
        warningBox.style.display = 'flex';

        const reasons = [];
        const score = unified?.confluence?.total ?? calculateWeightedScore();
        const rsi = calculateRSI(state.priceHistory);

        reasons.push(`<strong>Confluence Score ist ${formatNumber(score, 1)}/10</strong> - aktuell kein statistischer Vorteil`);

        if (rsi >= 40 && rsi <= 60) {
            reasons.push(`<strong>RSI ist bei ${formatNumber(rsi, 0)}</strong> - weder ueberkauft noch ueberverkauft`);
        }

        if (state.fearGreedIndex >= 35 && state.fearGreedIndex <= 65) {
            reasons.push(`<strong>Fear & Greed ist bei ${state.fearGreedIndex}</strong> - keine Extremzone`);
        }

        if (Number.isFinite(state.fundingRate) && Math.abs(state.fundingRate) < 0.01) {
            reasons.push(`<strong>Funding Rate ist bei ${formatNumber(state.fundingRate, 4)}%</strong> - kein klares Futures-Signal`);
        }

        const trend = determineTrend(state.priceHistory);
        if (trend === 'sideways') {
            reasons.push('<strong>Trend ist seitwaerts</strong> - keine klare Richtung');
        }

        if (state.longShortRatio.available && state.longShortRatio.long >= 45 && state.longShortRatio.long <= 55) {
            reasons.push(`<strong>Long/Short Ratio ist ausgeglichen</strong> (${formatNumber(state.longShortRatio.long, 0)}/${formatNumber(state.longShortRatio.short, 0)})`);
        }

        if (unified?.blockedReasons?.length) {
            unified.blockedReasons.forEach(reason => reasons.push(`<strong>Qualitaetsfilter:</strong> ${reason}`));
        }

        if (model?.noTradeReasons?.length) {
            model.noTradeReasons.forEach(reason => reasons.push(`<strong>Operativer Blocker:</strong> ${reason}`));
        }

        reasons.push('<strong>Empfehlung:</strong> Warte auf ein klar bestaetigtes Setup mit besserem Edge.');

        reasonsEl.innerHTML = '<ul>' + reasons.map(r => `<li>${r}</li>`).join('') + '</ul>';
    } else {
        warningBox.style.display = 'none';
    }
}
function updateScoreInterpretation() {
    const interpretEl = document.getElementById('scoreInterpretation');
    const score = calculateWeightedScore();
    const verdict = state.sourceQuality?.verdict;

    let html = '';
    let cssClass = '';

    if (verdict?.blocked) {
        cssClass = 'neutral';
        html = `<strong>Kein belastbares Tagesurteil</strong><br>
                Kritische Quellen fehlen oder sind nicht belastbar genug. 
                Das Urteil wird deshalb absichtlich gebremst.`;
    } else if (verdict?.restricted) {
        cssClass = 'neutral';
        html = `<strong>Urteil eingeschraenkt</strong><br>
                Das Setup kann einen Bias haben, aber die Datenqualitaet verlangt Vorsicht. 
                Nutze nur bestaetigte Trigger und reduziertes Vertrauen.`;
    } else if (score >= 6.5) {
        cssClass = 'bullish';
        html = `<strong>Score ≥ 6.5 = LONG Signal</strong><br>
                Alle Faktoren zusammen ergeben einen bullischen Bias. 
                Je höher der Score, desto stärker das Signal.`;
    } else if (score <= 3.5) {
        cssClass = 'bearish';
        html = `<strong>Score ≤ 3.5 = SHORT Signal</strong><br>
                Alle Faktoren zusammen ergeben einen bearischen Bias. 
                Je niedriger der Score, desto stärker das Signal.`;
    } else {
        cssClass = 'neutral';
        html = `<strong>Score zwischen 3.5 und 6.5 = KEIN TRADE</strong><br>
                Die Indikatoren sind zu gemischt für eine klare Empfehlung. 
                Warte auf extremere Werte (Score unter 3.5 oder über 6.5).`;
    }

    interpretEl.className = `score-interpretation ${cssClass}`;
    interpretEl.innerHTML = html;
}

function updateLastUpdate() {
    state.lastUpdate = new Date();
    const timeStr = state.lastUpdate.toLocaleTimeString('de-DE');
    document.getElementById('lastUpdate').textContent = timeStr;
}

function buildDashboardDataQuality(fetchResults) {
    const [priceOk, historyOk, fgOk, fundingOk, oiOk, lsOk, newsOk] = fetchResults;
    const issues = [];
    const warnings = [];

    if (!priceOk || !historyOk) issues.push('Kursdaten unvollständig');
    if (!fgOk) warnings.push('Fear & Greed fehlt');
    else if (!state.fearGreedIsCurrent) warnings.push('Fear & Greed nicht fuer heute aktuell');
    if (!fundingOk) warnings.push('Funding fehlt');
    if (!oiOk) warnings.push('Open Interest fehlt');
    if (!lsOk) warnings.push('L/S Ratio fehlt');
    if (!newsOk) warnings.push('News-Feed fehlt');

    const mode = issues.length > 0 ? 'degraded' : warnings.length > 0 ? 'partial' : 'live';
    const summary = mode === 'live'
        ? 'Live'
        : mode === 'partial'
            ? `Teilweise live (${warnings.length} Warnung${warnings.length === 1 ? '' : 'en'})`
            : 'Kritisch eingeschränkt';

    return { mode, summary, issues, warnings };
}

function buildStructuredDashboardDataQuality(fetchResults) {
    const sourceQuality = buildSourceQualityModel(fetchResults);
    const issues = [];
    const warnings = [];

    Object.values(sourceQuality.sources).forEach(source => {
        if (source.status === 'missing' || source.status === 'invalid') {
            (source.critical ? issues : warnings).push(describeSourceStatus(source));
        } else if (source.status === 'stale' || source.status === 'degraded') {
            warnings.push(describeSourceStatus(source));
        }
    });

    const mode = sourceQuality.verdict.blocked
        ? 'degraded'
        : sourceQuality.verdict.restricted
            ? 'partial'
            : 'live';

    state.sourceQuality = sourceQuality;

    return {
        mode,
        summary: `${sourceQuality.freshnessLabel} | Konfidenz ${sourceQuality.confidence}/100`,
        issues,
        warnings
    };
}

function updateQualitySummaryCard() {
    const quality = state.sourceQuality;
    if (!quality) return;

    const freshnessEl = document.getElementById('qualityFreshnessBadge');
    const confidenceEl = document.getElementById('qualityConfidenceBadge');
    const summaryEl = document.getElementById('qualitySummaryText');
    const reasonEl = document.getElementById('qualityConfidenceReason');
    const timestampEl = document.getElementById('qualityTimestampText');
    const listEl = document.getElementById('qualityWarningList');
    const verdictEl = document.getElementById('qualityVerdictBadge');

    if (freshnessEl) {
        freshnessEl.textContent = `Datenqualitaet: ${quality.confidenceLabel}`;
        freshnessEl.className = `card-badge quality-badge status-${quality.status}`;
    }
    if (confidenceEl) {
        confidenceEl.textContent = `Konfidenz ${quality.confidence}/100`;
        confidenceEl.className = `card-badge quality-badge confidence-${quality.confidence >= 85 ? 'high' : quality.confidence >= 65 ? 'mid' : quality.confidence >= 40 ? 'low' : 'very-low'}`;
    }
    if (verdictEl) {
        verdictEl.textContent = quality.verdict.label;
        verdictEl.className = `card-badge quality-badge verdict-${quality.verdict.status}`;
    }
    if (summaryEl) summaryEl.textContent = quality.verdict.summary;
    if (reasonEl) {
        reasonEl.textContent = quality.reducedBy.length
            ? quality.reducedBy.slice(0, 3).join(' | ')
            : 'Keine aktiven Qualitaetsabzuege.';
    }
    if (timestampEl) {
        timestampEl.textContent = state.lastUpdate
            ? `Letzter Datenabgleich: ${state.lastUpdate.toLocaleString('de-DE')}`
            : 'Letzter Datenabgleich: --';
    }
    if (listEl) {
        const items = [
            ...quality.verdict.reasons,
            ...state.dataQuality.warnings.slice(0, 3)
        ].filter(Boolean);
        listEl.innerHTML = (items.length ? items : ['Keine aktiven Warnhinweise.'])
            .map(item => `<li>${item}</li>`)
            .join('');
    }
}

function renderDataQualityDebug() {
    const tbody = document.getElementById('qualityDebugTableBody');
    if (!tbody) return;
    const quality = state.sourceQuality;
    if (!quality?.sources) {
        tbody.innerHTML = '<tr><td colspan="8">Noch keine Quelldaten vorhanden.</td></tr>';
        return;
    }

    tbody.innerHTML = Object.values(quality.sources).map(source => `
        <tr>
            <td>${source.label}</td>
            <td>${source.source} (${getSourceModeLabel(source)})</td>
            <td>${source.rawTimestamp ?? '--'}</td>
            <td>${source.normalizedTimestamp ?? '--'}</td>
            <td class="debug-status status-${source.status}">${source.status}</td>
            <td>${source.usedInScoring ? 'ja' : 'nein'}</td>
            <td>${source.fallbackUsed ? 'ja' : 'nein'}</td>
            <td>-${source.confidenceImpact}</td>
        </tr>
    `).join('');
}

function updateDataQualityStatus() {
    const el = document.getElementById('dataQualityStatus');
    if (!el) return;
    const q = state.dataQuality || { mode: 'loading', summary: 'Lade...', issues: [], warnings: [] };
    const confidence = state.sourceQuality?.confidence;
    el.textContent = Number.isFinite(confidence)
        ? `${q.summary}`
        : q.summary;
    el.title = [...q.issues, ...q.warnings].join(' | ') || q.summary;
    el.className = `update-time data-quality-${q.mode}`;
}

// =====================================================
// Main Update Function
// =====================================================

async function updateDashboard() {
    if (dashboardUpdatePromise) {
        queuedDashboardRefresh = true;
        return dashboardUpdatePromise;
    }

    dashboardUpdatePromise = (async () => {
        const refreshBtn = document.getElementById('refreshBtn');
        refreshBtn.classList.add('loading');

        try {
            const fetchResults = await Promise.all([
                fetchPriceData(),
                fetchPriceHistory(),
                fetchFearGreedIndex(),
                fetchFundingRate(),
                fetchOpenInterest(),
                fetchLongShortRatio(),
                fetchCryptoNews()
            ]);
            state.eventFilter = buildEventFilter();
            state.dataQuality = buildStructuredDashboardDataQuality(fetchResults);

            calculateScores();

            updatePriceCard();
            updateFearGreedCard();
            updateTechnicalCard();
            updateDerivativesCard();
            updateSentimentCard();
            updateLastUpdate();
            updateTradeSetup();
            updateKeyLevels();
            updateRiskFactors();
            updateScoreCard();
            updateDecisionPanel();
            updateStrategyDecisionCards();
            updateSignalBanner();
            updateDataQualityStatus();
            updateQualitySummaryCard();
            renderDataQualityDebug();

            console.log('Dashboard updated successfully');
        } catch (error) {
            state.dataQuality = {
                mode: 'degraded',
                summary: 'Update fehlgeschlagen',
                issues: ['Dashboard-Update fehlgeschlagen'],
                warnings: []
            };
            state.eventFilter = buildEventFilter();
            state.sourceQuality = buildSourceQualityModel([false, false, false, false, false, false, false]);
            updateLastUpdate();
            applyDecisionFallbackState('Dashboard-Update fehlgeschlagen. Keine operative Freigabe.');
            updateDataQualityStatus();
            updateQualitySummaryCard();
            renderDataQualityDebug();
            console.error('Error updating dashboard:', error);
        } finally {
            refreshBtn.classList.remove('loading');
            resetCountdown();
        }
    })();

    try {
        return await dashboardUpdatePromise;
    } finally {
        dashboardUpdatePromise = null;
        if (queuedDashboardRefresh) {
            queuedDashboardRefresh = false;
            updateDashboard();
        }
    }
}

function isDashboardDataReady() {
    return (
        Number.isFinite(state.price) &&
        state.price > 0 &&
        Array.isArray(state.priceHistory) &&
        state.priceHistory.length >= 10 &&
        Number.isFinite(state.fearGreedIndex)
    );
}

async function loadDashboardWithRetry(maxAttempts = 3, delayMs = 1200) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await updateDashboard();
        if (isDashboardDataReady()) return true;

        if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    return isDashboardDataReady();
}

// =====================================================
// Countdown Timer
// =====================================================

function resetCountdown() {
    remainingSeconds = 300;
    updateCountdownDisplay();
}

function updateCountdownDisplay() {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    document.getElementById('countdown').textContent =
        `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
        remainingSeconds--;
        updateCountdownDisplay();

        if (remainingSeconds <= 0) {
            updateDashboard();
        }
    }, 1000);
}

// =====================================================
// Backtest Display Functions
// =====================================================

async function runBacktestAndDisplay() {
    const loadingEl = document.getElementById('backtestLoading');
    const resultsEl = document.getElementById('backtestResults');
    const emptyEl = document.getElementById('backtestEmpty');
    const btnEl = document.getElementById('runBacktestBtn');

    // Show loading
    loadingEl.style.display = 'block';
    resultsEl.style.display = 'none';
    emptyEl.style.display = 'none';
    btnEl.disabled = true;
    btnEl.textContent = '⏳ Läuft...';

    try {
        // Run backtest with 30 trades
        const results = await Backtester.runBacktest(30);

        if (!results) {
            throw new Error('Backtest failed');
        }

        // Log all signal dates to console
        console.log('📊 Backtest Signal History:');
        results.trades.forEach((trade, i) => {
            const icon = trade.direction === 'LONG' ? '🟢' : '🔴';
            const outcome = trade.outcome === 'WIN' ? '✅' : trade.outcome === 'LOSS' ? '❌' : '⏱️';
            console.log(`${i + 1}. ${icon} ${trade.direction} am ${trade.date} → ${outcome} ${trade.profit.toFixed(2)}%`);
        });

        // Hide loading, show results
        loadingEl.style.display = 'none';
        resultsEl.style.display = 'block';

        // Display results
        displayBacktestResults(results);

    } catch (error) {
        console.error('Backtest error:', error);
        alert('Backtest fehlgeschlagen. Bitte versuche es später erneut.');
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
    } finally {
        btnEl.disabled = false;
        btnEl.textContent = '🔬 Backtest Starten';
    }
}

function displayBacktestResults(results) {
    // Win rate and rating
    const winRate = results.winRate.toFixed(1);
    document.getElementById('backtestWinRate').textContent = `${results.wins}/${results.totalTrades} (${winRate}%)`;

    const rating = Backtester.getPerformanceRating(results.winRate);
    const ratingEl = document.getElementById('backtestRating');
    ratingEl.textContent = `${rating.emoji} ${rating.rating}`;
    ratingEl.style.color = rating.color;

    // Summary stats
    document.getElementById('backtestTotalTrades').textContent = results.totalTrades;
    document.getElementById('backtestAvgWin').textContent = `+${results.avgWin.toFixed(2)}%`;
    document.getElementById('backtestAvgLoss').textContent = `${results.avgLoss.toFixed(2)}%`;

    const totalReturn = results.totalReturn.toFixed(1);
    const totalReturnEl = document.getElementById('backtestTotalReturn');
    totalReturnEl.textContent = `${totalReturn > 0 ? '+' : ''}${totalReturn}%`;
    totalReturnEl.className = `summary-value ${totalReturn > 0 ? 'text-bullish' : 'text-bearish'}`;

    // Breakdown
    document.getElementById('backtestWins').textContent = results.wins;
    document.getElementById('backtestLosses').textContent = results.losses;

    if (results.bestTrade) {
        document.getElementById('backtestBestTrade').textContent =
            `+${results.bestTrade.profit.toFixed(2)}% (${results.bestTrade.date}, ${results.bestTrade.direction})`;
    }

    if (results.worstTrade) {
        document.getElementById('backtestWorstTrade').textContent =
            `${results.worstTrade.profit.toFixed(2)}% (${results.worstTrade.date}, ${results.worstTrade.direction})`;
    }

    // Failure analysis
    document.getElementById('failureStopLoss').textContent = results.failureReasons.stopLossHit;
    document.getElementById('failureTimeout').textContent = results.failureReasons.timeout;

    // Trade list (chronologically sorted - oldest first)
    const tradeListEl = document.getElementById('backtestTradeList');
    const sortedTrades = [...results.trades].sort((a, b) => new Date(a.date) - new Date(b.date));

    tradeListEl.innerHTML = sortedTrades.map((trade, i) => {
        const profitClass = trade.profit > 0 ? 'text-bullish' : 'text-bearish';
        const outcomeIcon = trade.outcome === 'WIN' ? '✅' : trade.outcome === 'LOSS' ? '❌' : '⏱️';
        const confScore = trade.confluenceScore || 0;
        const confClass = confScore >= 7 ? 'text-bullish' : confScore >= 5 ? 'text-secondary' : 'text-muted';

        return `
            <div class="trade-item">
                <div class="trade-number">#${i + 1}</div>
                <div class="trade-info">
                    <div class="trade-main">
                        <span class="trade-direction ${trade.direction.toLowerCase()}">${trade.direction}</span>
                        <span class="trade-date">${trade.date}</span>
                        <span class="${confClass}" style="font-size: 0.7rem; font-weight: 600;">⭐${confScore}/10</span>
                    </div>
                    <div class="trade-levels" style="font-size: 0.75rem; color: var(--text-secondary); margin: 4px 0;">
                        <span>📍 Entry: $${formatNumber(trade.entryPrice, 0)}</span>
                        <span style="margin-left: 12px;">🛑 SL: $${formatNumber(trade.stopLoss, 0)}</span>
                        <span style="margin-left: 12px;">🎯 TP: $${formatNumber(trade.tp1, 0)}</span>
                    </div>
                    <div class="trade-result">
                        <span class="trade-outcome">${outcomeIcon} ${trade.outcome}</span>
                        <span class="trade-profit ${profitClass}">${trade.profit > 0 ? '+' : ''}${trade.profit.toFixed(2)}%</span>
                        <span class="trade-days">${trade.exitDay}d</span>
                        ${trade.exitPrice ? `<span style="font-size: 0.7rem; color: var(--text-muted);">Exit: $${formatNumber(trade.exitPrice, 0)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// Event Listeners & Initialization
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize notification system
    applyUiTextFixes();
    NotificationSystem.init();
    normalizeStoredAuditLog();
    initSignalAuditToggle();
    initSignalAuditFilter();
    initSignalAuditReset();
    renderSignalAuditLogV2();
    loadTraderProfile();
    updateTraderProfileUI();

    const eventOverrideSelect = document.getElementById('eventOverrideSelect');
    if (eventOverrideSelect) {
        const savedOverride = localStorage.getItem(EVENT_OVERRIDE_KEY) || 'auto';
        eventOverrideSelect.value = savedOverride;
        eventOverrideSelect.addEventListener('change', async (e) => {
            const value = ['auto', 'green', 'yellow', 'red'].includes(e.target.value) ? e.target.value : 'auto';
            localStorage.setItem(EVENT_OVERRIDE_KEY, value);
            state.eventFilter = buildEventFilter();
            updateRiskFactors();
            updateDecisionPanel();
            updateStrategyDecisionCards();
            updateSignalBanner();
        });
    }

    [
        'profileStyleSelect',
        'profileExecutionSelect',
        'profileMaxLeverage',
        'profileMinRR',
        'profileMaxOpenTrades',
        'profileAvoidWeekends',
        'profileAvoidMacroRisk',
        'profilePreferSpot'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
            TRADER_PROFILE.style = document.getElementById('profileStyleSelect')?.value || DEFAULT_TRADER_PROFILE.style;
            TRADER_PROFILE.execution = document.getElementById('profileExecutionSelect')?.value || DEFAULT_TRADER_PROFILE.execution;
            TRADER_PROFILE.maxLeverage = Number(document.getElementById('profileMaxLeverage')?.value || DEFAULT_TRADER_PROFILE.maxLeverage);
            TRADER_PROFILE.minRR = Number(document.getElementById('profileMinRR')?.value || DEFAULT_TRADER_PROFILE.minRR);
            TRADER_PROFILE.maxOpenTrades = Number(document.getElementById('profileMaxOpenTrades')?.value || DEFAULT_TRADER_PROFILE.maxOpenTrades);
            TRADER_PROFILE.avoidWeekends = Boolean(document.getElementById('profileAvoidWeekends')?.checked);
            TRADER_PROFILE.avoidMacroRisk = Boolean(document.getElementById('profileAvoidMacroRisk')?.checked);
            TRADER_PROFILE.preferSpotOnRiskDays = Boolean(document.getElementById('profilePreferSpot')?.checked);
            saveTraderProfile();
            state.eventFilter = buildEventFilter();
            updateRiskFactors();
            updateDecisionPanel();
            updateStrategyDecisionCards();
            updateSignalBanner();
        });
    });

    // Fear & Greed source mode
    const savedFgMode = localStorage.getItem('btc-fg-source-mode');
    if (savedFgMode === 'avg' || savedFgMode === 'alt' || savedFgMode === 'cmc') {
        state.fearGreedMode = savedFgMode;
    }
    const fgSourceSelect = document.getElementById('fgSourceMode');
    if (fgSourceSelect) {
        fgSourceSelect.value = state.fearGreedMode;
        fgSourceSelect.addEventListener('change', async (e) => {
            const mode = e.target.value;
            state.fearGreedMode = mode === 'cmc' || mode === 'alt' || mode === 'avg' ? mode : 'cmc';
            localStorage.setItem('btc-fg-source-mode', state.fearGreedMode);
            await updateDashboard();
        });
    }

    // Initial load (with retry to avoid incomplete first render)
    loadDashboardWithRetry();
    startCountdown();

    // Manual refresh button
    document.getElementById('refreshBtn').addEventListener('click', () => {
        updateDashboard();
    });

    // Notification toggle buttons
    const notifBtn = document.getElementById('toggleNotifications');
    if (notifBtn) {
        notifBtn.addEventListener('click', () => NotificationSystem.toggleNotifications());
    }

    const soundBtn = document.getElementById('toggleSound');
    if (soundBtn) {
        soundBtn.addEventListener('click', () => NotificationSystem.toggleSound());
    }

    // Test notification button
    const testBtn = document.getElementById('testNotification');
    if (testBtn) {
        testBtn.addEventListener('click', () => {
            NotificationSystem.playSound('long');
            NotificationSystem.showInPageAlert('long', 75, state.price || 100000, 'Test');
        });
    }

    const telegramDailyBtn = document.getElementById('testDailyUpdate');
    if (telegramDailyBtn) {
        telegramDailyBtn.addEventListener('click', () => {
            openTelegramPreview('daily');
        });
    }

    const telegramSignalBtn = document.getElementById('testSignalCheck');
    if (telegramSignalBtn) {
        telegramSignalBtn.addEventListener('click', () => {
            openTelegramPreview('signal');
        });
    }

    const closeTelegramPreviewBtn = document.getElementById('closeTelegramPreview');
    if (closeTelegramPreviewBtn) {
        closeTelegramPreviewBtn.addEventListener('click', () => {
            closeTelegramPreview();
        });
    }

    const telegramPreviewOverlay = document.getElementById('telegramPreview');
    if (telegramPreviewOverlay) {
        telegramPreviewOverlay.addEventListener('click', (event) => {
            if (event.target === telegramPreviewOverlay) {
                closeTelegramPreview();
            }
        });
    }

    const sendToTelegramBtn = document.getElementById('sendToTelegramBtn');
    if (sendToTelegramBtn) {
        sendToTelegramBtn.addEventListener('click', async () => {
            const previewContent = document.getElementById('telegramPreviewContent')?.dataset?.message?.trim()
                || document.getElementById('telegramPreviewContent')?.textContent?.trim()
                || '';
            const configForm = document.getElementById('telegramConfigForm');
            const creds = getTelegramCredentials();

            if (!previewContent) {
                setTelegramStatus('Keine Testnachricht vorhanden.', 'error');
                return;
            }

            if (!creds) {
                prefillTelegramConfigForm();
                if (configForm) configForm.style.display = 'block';
                setTelegramStatus('Bot-Token und Chat-ID fehlen.', 'error');
                return;
            }

            setTelegramStatus('Sende Testnachricht...', 'neutral');
            const result = await sendTelegramMessage(previewContent);
            if (result.success) {
                setTelegramStatus('Testnachricht erfolgreich gesendet.', 'success');
            } else {
                setTelegramStatus(`Telegram-Fehler: ${result.error}`, 'error');
            }
        });
    }

    const saveTelegramCredsBtn = document.getElementById('tgSaveCreds');
    if (saveTelegramCredsBtn) {
        saveTelegramCredsBtn.addEventListener('click', async () => {
            const token = document.getElementById('tgTokenInput')?.value?.trim() || '';
            const chatId = document.getElementById('tgChatIdInput')?.value?.trim() || '';
            const configForm = document.getElementById('telegramConfigForm');
            const previewContent = document.getElementById('telegramPreviewContent')?.dataset?.message?.trim()
                || document.getElementById('telegramPreviewContent')?.textContent?.trim()
                || '';

            if (!token || !chatId) {
                setTelegramStatus('Bitte Bot-Token und Chat-ID eintragen.', 'error');
                return;
            }

            localStorage.setItem('telegram_bot_token', token);
            localStorage.setItem('telegram_chat_id', chatId);
            if (configForm) configForm.style.display = 'none';

            if (!previewContent) {
                setTelegramStatus('Zugangsdaten gespeichert.', 'success');
                return;
            }

            setTelegramStatus('Sende Testnachricht...', 'neutral');
            const result = await sendTelegramMessage(previewContent);
            if (result.success) {
                setTelegramStatus('Testnachricht erfolgreich gesendet.', 'success');
            } else {
                setTelegramStatus(`Telegram-Fehler: ${result.error}`, 'error');
            }
        });
    }

    // Close Analysis button
    const closeAnalysisBtn = document.getElementById('closeAnalysisBtn');
    if (closeAnalysisBtn) {
        closeAnalysisBtn.addEventListener('click', () => {
            document.getElementById('analysisCardContainer').style.display = 'none';

            // Restore Body Scroll (iOS Safe)
            const scrollY = document.body.dataset.scrollY;
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            window.scrollTo(0, parseInt(scrollY || '0'));
            document.body.style.overflow = '';
        });
    }

    // Trade Analysis button
    const tradeAnalysisBtn = document.getElementById('tradeAnalysisBtn');
    if (tradeAnalysisBtn) {
        tradeAnalysisBtn.addEventListener('click', async () => {
            await showLiveAnalysis();
        });
    }

    // Backtest button
    const backtestBtn = document.getElementById('runBacktestBtn');
    if (backtestBtn) {
        backtestBtn.addEventListener('click', async () => {
            await runBacktestAndDisplay();
        });
    }

    // Keyboard shortcut (R to refresh)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'r' || e.key === 'R') {
            if (!e.ctrlKey && !e.metaKey) {
                updateDashboard();
            }
        }
    });
});

// Handle visibility change (refresh when tab becomes visible)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && remainingSeconds < 60) {
        updateDashboard();
    }
});

// =====================================================
// Initialize Smart Money Strategy Trade Lists
// =====================================================

function initSmartMoneyTrades() {
    if (typeof SmartMoneyStrategy === 'undefined') return;

    const years = ['2022', '2023', '2024', '2025', '2026'];

    years.forEach(year => {
        const container = document.getElementById(`trades${year}`);
        if (!container) return;

        const trades = SmartMoneyStrategy.getTradesByYear(year);

        container.innerHTML = trades.map(trade => {
            const isWin = trade.result === 'WIN';
            const returnClass = isWin ? 'text-bullish' : 'text-bearish';
            const returnSign = trade.return >= 0 ? '+' : '';

            // Calculate duration
            const entryDate = new Date(trade.entry);
            const exitDate = new Date(trade.exit);
            const days = Math.ceil((exitDate - entryDate) / (1000 * 60 * 60 * 24));
            const duration = days === 0 ? '< 1 Tag' : days === 1 ? '1 Tag' : `${days} Tage`;

            return `
                <div class="trade-item ${isWin ? 'win' : 'loss'}">
                    <span class="trade-rank">#${trade.id}</span>
                    <span class="trade-date">${trade.entry}</span>
                    <span class="trade-prices">$${trade.entryPrice.toLocaleString()} → $${trade.exitPrice.toLocaleString()}</span>
                    <span class="trade-return ${returnClass}">${returnSign}${trade.return.toFixed(2)}%</span>
                    <span class="trade-duration">${duration}</span>
                </div>
            `;
        }).join('');
    });
}

// Run after DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSmartMoneyTrades);
} else {
    initSmartMoneyTrades();
}

