(() => {
    const root = 'https://api.github.com/repos/christophzehentbauerz/trade/actions';
    async function refresh() {
        const status = document.getElementById('botAutomationStatus');
        if (!status) return;
        try {
            const response = await fetch(`${root}/workflows`, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
            if (!response.ok) throw new Error('Status nicht erreichbar');
            const data = await response.json();
            const bots = data.workflows.filter(w => ['BTC Signal Check', 'Daily Report'].includes(w.name));
            if (bots.length !== 2) throw new Error('Bot-Zeitpläne nicht gefunden');
            const disabled = bots.filter(w => w.state !== 'active');
            if (disabled.length) {
                status.textContent = 'Automatischer Bot: Zeitplan deaktiviert – ' + disabled.map(w => w.name).join(', ');
                status.dataset.tone = 'error';
                return;
            }
            const runsResponse = await fetch(`${root}/runs?branch=main&per_page=20`, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
            if (!runsResponse.ok) throw new Error('Ausführungen nicht erreichbar');
            const runs = (await runsResponse.json()).workflow_runs;
            const latest = bots.map(bot => runs.find(run => run.workflow_id === bot.id));
            if (latest.some(run => !run)) throw new Error('Keine aktuellen Bot-Ausführungen gefunden');
            if (latest.some(run => run.conclusion === 'failure' || run.conclusion === 'timed_out')) {
                status.textContent = 'Automatischer Bot: letzte Ausführung fehlgeschlagen. Details auf GitHub.';
                status.dataset.tone = 'error';
            } else if (latest.some(run => run.status !== 'completed')) {
                status.textContent = 'Automatischer Bot: Ausführung läuft oder wartet auf GitHub.';
                status.dataset.tone = 'pending';
            } else {
                const stale = latest.some(run => Date.now() - new Date(run.created_at).getTime() > (run.name === 'Daily Report' ? 36 * 3600000 : 3600000));
                const successful = latest.every(run => run.conclusion === 'success');
                status.textContent = stale || !successful ? 'Automatischer Bot: kein aktueller erfolgreicher Lauf bestätigt.' : 'Automatischer Bot: letzte Prüfungen erfolgreich. Versand nur bei Bericht oder Signal.';
                status.dataset.tone = stale || !successful ? 'pending' : 'success';
            }
        } catch {
            status.textContent = 'Automatischer Bot: Status nicht prüfbar. Details auf GitHub.';
            status.dataset.tone = 'pending';
        }
    }
    document.addEventListener('DOMContentLoaded', refresh);
    setInterval(() => { if (!document.hidden) refresh(); }, 300000);
})();
