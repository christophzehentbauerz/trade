# Trade Suite

Dieses Repository kombiniert drei Bereiche:

1. BTC Market Intelligence Dashboard (Web-App)
2. BTC Smart Money Backtester (Python)
3. Trading Chat API (lokaler Coach-Endpoint)

## Web Dashboard

Dateien: `index.html`, `app.js`, `styles.css`, `live-analysis.js`, `smart-money-signals.js`

Features:
- Live Markt-Analyse (Signal, Konfidenz, Entry/SL/TP)
- Smart Money Signal-Engine
- Risiko-Management und Trade-Level
- Telegram-Report/Signal Integrationen

Start lokal:
- `index.html` im Browser öffnen

### CoinMarketCap Fear & Greed auf Vercel

Wenn der Fear & Greed Index exakt mit CoinMarketCap uebereinstimmen soll, setze in Vercel die Umgebungsvariable:

- `CMC_API_KEY=DEIN_API_KEY`

Danach nutzt die Seite automatisch den Vercel-Endpoint:
- `/api/cmc/fear-and-greed/historical`

### CoinMarketCap lokal

Fuer lokale Tests kannst du weiterhin den Python-Proxy nutzen.

1. CoinMarketCap API-Key als Umgebungsvariable setzen
```bash
set CMC_API_KEY=DEIN_API_KEY
```

2. Proxy starten
```bash
python cmc_proxy.py
```

3. `cmc-config.example.js` nach `cmc-config.js` kopieren

4. Dashboard neu laden

## Python Backtester

Dateien: `backtest_runner.py`, `strategy_*.py`, `data_loader.py`, `advanced_analysis.py`

Features:
- Backtests auf BTC/USDT Daten
- ATR-basiertes Risiko-Management
- Optimierung und Ergebnis-Exports

Installation:
```bash
pip install -r requirements.txt
```

Beispiele:
```bash
python backtest_runner.py --plot
python backtest_runner.py --optimize
python advanced_analysis.py
```

## Trading Chat API

Server starten:
```bash
python trading_chat_api.py
```

Endpoint:
- `POST http://127.0.0.1:8787/chat`

Body-Beispiel:
```json
{"question":"Bei welchem Preis triggert EMA 800?"}
```

Optional mit Kontext:
```json
{
  "question": "Gib mir einen Plan fuer heute",
  "context": {
    "account_size_usdt": 5000,
    "risk_per_trade_pct": 1.0,
    "allow_short": true,
    "timeframe": "1h"
  }
}
```

## Output

Ergebnisse werden nach `results/` geschrieben (Plots, Trades, Reports).

## Disclaimer

Keine Finanzberatung. Nur zu Lern- und Analysezwecken.
