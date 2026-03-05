# Trade Suite

Dieses Repository kombiniert zwei Bereiche:

1. BTC Market Intelligence Dashboard (Web-App)
2. BTC Smart Money Backtester (Python)

## Web Dashboard

Dateien: `index.html`, `app.js`, `styles.css`, `live-analysis.js`, `smart-money-signals.js`

Features:
- Live Markt-Analyse (Signal, Konfidenz, Entry/SL/TP)
- Smart Money Signal-Engine
- Risiko-Management und Trade-Level
- Telegram-Report/Signal Integrationen

Start lokal:
- `index.html` im Browser öffnen

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

## Output

Ergebnisse werden nach `results/` geschrieben (Plots, Trades, Reports).

## Disclaimer

Keine Finanzberatung. Nur zu Lern- und Analysezwecken.
