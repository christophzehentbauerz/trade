const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '..');

function botFixture(t, responses = []) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'btc-test-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const requests = [];
    const fakeHttps = { request(options, callback) {
        const request = new EventEmitter();
        const record = { options, body: '' }; requests.push(record);
        request.write = data => { record.body += data; };
        request.destroy = error => { request.emit('error', error); request.emit('close'); };
        request.end = () => queueMicrotask(() => {
            const response = new EventEmitter();
            const next = responses.shift() || { ok: true, result: [] };
            response.statusCode = next.status || 200;
            callback(response);
            response.emit('data', JSON.stringify(next));
            response.emit('end'); request.emit('close');
        });
        return request;
    } };
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'telegram-bot/bot.js'), 'utf8'), {
        require: name => name === 'https' ? fakeHttps : require(name), module,
        process: { env: { TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: '123', STATE_FILE: path.join(dir, 'nested/state.json') }, pid: process.pid },
        console: { log() {}, warn() {}, error() {} }, URL, URLSearchParams, Buffer, setTimeout, clearTimeout
    });
    return { bot: module.exports, requests };
}

test('classic browser scripts share a scope without declaration conflicts', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const sources = [...html.matchAll(/<script\b[^>]*src="([^"?]+)(?:\?[^"]*)?"[^>]*>/g)]
        .map(m => m[1]).filter(name => !name.startsWith('http') && fs.existsSync(path.join(root, name)));
    new vm.Script(sources.map(name => fs.readFileSync(path.join(root, name), 'utf8')).join('\n;\n'));
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, 'Duplicate HTML IDs');
});

test('state is created atomically and corruption is not silently discarded', t => {
    const { bot } = botFixture(t);
    bot.saveState({ lastUpdateId: 42 });
    assert.equal(bot.loadPreviousState().lastUpdateId, 42);
    fs.writeFileSync(bot.CONFIG.stateFile, '{');
    assert.throws(() => bot.loadPreviousState(), /could not be read/);
});

test('Telegram API failures include actionable description', async t => {
    const { bot } = botFixture(t, [{ status: 403, ok: false, description: 'Forbidden: bot was blocked by the user' }]);
    await assert.rejects(bot.fetchJSON('https://api.telegram.org/bottest/getMe'), /403.*blocked/);
});

test('polling ignores other chats and still advances the offset', async t => {
    const { bot, requests } = botFixture(t, [{ ok: true, result: [
        { update_id: 7, message: { chat: { id: 999 }, text: '/status' } },
        { update_id: 8, message: { chat: { id: 123 }, text: '/help' } }
    ] }, { ok: true }]);
    await bot.pollAndRespond();
    assert.equal(requests.length, 2);
    assert.equal(JSON.parse(requests[1].body).chat_id, '123');
    assert.equal(bot.loadPreviousState().lastUpdateId, 8);
    assert.ok(requests[0].options.path.includes('%5B%22message%22%5D'));
});

test('daily report escapes news and does not invent a sentiment reading', async t => {
    const { bot } = botFixture(t);
    const report = await bot.formatDailyUpdate([{ title: 'BTC < ETH & news', source: '<source>' }]);
    assert.ok(report.includes('BTC &lt; ETH &amp; news'));
    assert.ok(report.includes('&lt;source&gt;'));
    assert.ok(report.includes('nicht verfügbar'));
});

test('successfully replayed daily report records delivery and is not sent twice', async t => {
    const { bot, requests } = botFixture(t, [{ ok: true }]);
    const state = await bot.flushPendingNotifications({ pendingNotifications: [{ type: 'DAILY_REPORT', text: 'report', chatId: '123' }] });
    assert.equal(state.pendingNotifications.length, 0);
    assert.equal(state.lastDailyUpdate.slice(0, 10), new Date().toISOString().slice(0, 10));
    bot.saveState(state);
    await bot.sendDailyUpdate();
    assert.equal(requests.length, 1);
});

test('only fully closed candles enter indicators', t => {
    const { bot } = botFixture(t);
    const closed = bot.useClosedCandles([{ closeTime: Date.now() - 10 }, { closeTime: Date.now() + 10000 }]);
    assert.equal(closed.length, 1);
});

test('risk and daily loss use position size, not raw BTC price change', t => {
    const { bot } = botFixture(t);
    const position = { entryPrice: 100000, trailingStop: 97500, entryATR: 1000, sizeBTC: .02 };
    assert.equal(bot.calcOpenRiskPct(position, 100000, 5000), 1);
    const closed = bot.recordClosedTrade({}, position, 97500, 'STOP');
    assert.equal(closed.dailyPnL, -1);
});

test('market history paginates and rejects stale or discontinuous data', async t => {
    const original = global.fetch;
    t.after(() => { global.fetch = original; });
    const { fetchCandles } = await import('../lib/market-data.mjs');
    let requests = 0;
    const hour = 3600000;
    const latest = Math.floor(Date.now() / hour) * hour;
    global.fetch = async url => {
        requests++;
        const q = new URL(url).searchParams;
        const count = Number(q.get('limit'));
        const end = q.has('endTime') ? Math.floor(Number(q.get('endTime')) / hour) * hour : latest;
        return { ok: true, json: async () => Array.from({ length: count }, (_, i) => [end - (count - i - 1) * hour, '100', '110', '90', '105', '12', end - (count - i - 1) * hour + hour - 1]) };
    };
    const rows = await fetchCandles('1h', 1200);
    assert.equal(rows.length, 1200);
    assert.equal(requests, 2);
    assert.equal(rows.at(-1).time, latest);
    global.fetch = async () => ({ ok: true, json: async () => [[0, 100, 110, 90, 100, 1, 1000], [3600000, 100, 110, 90, 100, 1, 3601000]] });
    await assert.rejects(fetchCandles('1h', 2), /not current/);
});

test('chart recovers after failure and EMA800 really uses 800 candles', async () => {
    const elements = { botChart: { textContent: 'canvas is retained' }, botChartFreshness: { textContent: '' } };
    let fail = true;
    let ema800;
    let candlesDrawn = 0;
    const candles = Array.from({ length: 1000 }, (_, i) => ({ time: (i + 1) * 3600000, open: i + 100, close: i + 100, high: i + 101, low: i + 99 }));
    const context = vm.createContext({
        window: { MarketAPI: { get: async () => { if (fail) throw new Error('offline'); return { candles }; } } },
        document: { readyState: 'loading', addEventListener() {}, getElementById: id => elements[id] },
        console: { error() {} }, Date,
        chart: { timeScale: () => ({ fitContent() {} }) },
        series: { setData(data) { candlesDrawn = data.length; } },
        line: { setData() {} },
        emaLine: { setData(data) { ema800 = data; } }
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'bot-signal.js'), 'utf8'), context);
    vm.runInContext('botChart = chart; botCandleSeries = series; botEma15Series = line; botEma300Series = line; botEma800Series = emaLine;', context);
    await vm.runInContext('loadBotChartData()', context);
    assert.match(elements.botChartFreshness.textContent, /fehlgeschlagen/);
    assert.equal(elements.botChart.textContent, 'canvas is retained');
    fail = false;
    await vm.runInContext('loadBotChartData()', context);
    assert.equal(candlesDrawn, 1000);
    assert.equal(ema800.length, 201);
    assert.equal(ema800[0].value, 499.5);
});

test('daily plan honors persisted daily loss', t => {
    const { bot } = botFixture(t);
    bot.saveState({ dailyPnL: -4, lastDailyReset: new Date().toISOString().slice(0, 10) });
    Object.assign(bot.state, { currentPrice: 100000, atr: 1000, emaSlow: 97000, signalScore: 90, rsi: 55 });
    bot.state.mtf.aligned = 'bull';
    const plan = bot.buildTradePlan();
    assert.equal(plan.blocked, true);
    assert.ok(plan.guardrails.some(reason => reason.includes('Daily Loss Limit')));
});

test('strategy initialization does not register a second Telegram UI handler', () => {
    const callbacks = [];
    const buttonHandlers = [];
    const context = vm.createContext({
        document: { readyState: 'loading', addEventListener: (event, fn) => callbacks.push(fn), getElementById: () => ({ addEventListener: (...args) => buttonHandlers.push(args) }) },
        console: { log() {} }
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'smart-money-signals.js'), 'utf8'), context);
    vm.runInContext('SmartMoneySignal.init = () => {};', context);
    callbacks.forEach(fn => fn());
    assert.equal(buttonHandlers.length, 0, 'strategy initialization must not attach competing send handlers');
});
