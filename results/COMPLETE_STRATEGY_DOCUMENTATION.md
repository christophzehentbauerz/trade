# 🚀 BTC Smart Money Strategy

## Asymmetric Golden Cross Trading System

**Backtest-Zeitraum:** Januar 2022 - Februar 2026  
**Timeframe:** 1 Stunde (1H)  
**Asset:** BTC/USDT

---

## 📊 Performance Overview

| Metrik | Wert |
|--------|------|
| **Gesamtrendite** | +74.63% |
| **Win Rate** | 54.5% |
| **Profit Factor** | 2.53 |
| **Max Drawdown** | -11.11% |
| **Anzahl Trades** | 77 |
| **Bester Trade** | +21.49% |
| **Durchschn. Trade** | +0.86% |
| **Sharpe Ratio** | ~1.0 |

### Vergleich zu Buy & Hold

| Strategie | Return | Max DD | Risiko-Adjusted |
|-----------|--------|--------|-----------------|
| Buy & Hold BTC | +47.7% | -70%+ | Hoch |
| **Smart Money Strategy** | **+74.6%** | **-11.1%** | Niedrig |

---

## 🎯 Strategie-Konzept

### Kernphilosophie
> **"Cut losers short, let winners run."**

Die Strategie kombiniert:
1. **Trendfolge** (Golden Cross) für Richtung
2. **Momentum-Filter** (RSI) für Timing  
3. **Asymmetrisches Risiko** (kleine Verluste, große Gewinne)

### Warum es funktioniert
- BTC bewegt sich in starken Trends
- Die meisten Gewinne kommen von wenigen großen Moves
- Enger Stop Loss = kleine Verluste wenn falsch
- Weites Trailing = große Gewinne wenn richtig

---

## 📈 Indikatoren

| Indikator | Einstellung | Zweck |
|-----------|-------------|-------|
| **EMA Fast** | 15 Perioden | Schnelles Trendsignal |
| **EMA Slow** | 300 Perioden | Langfristiger Trend |
| **EMA HTF** | 800 Perioden | Makro-Trendfilter |
| **RSI** | 14 Perioden | Momentum-Bestätigung |
| **ATR** | 14 Perioden | Volatilitäts-basierte Stops |

---

## 🔵 Entry-Regeln (LONG)

Ein LONG-Signal entsteht wenn **ALLE** Bedingungen erfüllt sind:

```
1. Golden Cross: EMA(15) kreuzt über EMA(300)
2. HTF-Filter:   Preis > EMA(800)
3. RSI-Zone:     RSI zwischen 45 und 70
```

### Erklärung:
- **Golden Cross** = Trendwechsel bestätigt
- **HTF-Filter** = Nur mit dem großen Trend handeln
- **RSI 45-70** = Momentum ist da, aber nicht überkauft

---

## 🔴 Exit-Regeln

### Stop Loss (Initial)
```
SL = Entry-Preis - (ATR × 2.5)
```
Beispiel: Entry bei 100.000, ATR = 2.000  
→ SL bei 95.000 (-5%)

### Trailing Stop (Dynamisch)

| Profit (in ATR) | Trail-Distanz | Beschreibung |
|-----------------|---------------|--------------|
| 0 - 3 ATR | 2.5 ATR | Enger Stop, kleine Verluste |
| 3 - 5 ATR | 2.0 ATR | Break-Even gesichert |
| 5+ ATR | 4.0 ATR | Laufen lassen! |

### Death Cross Exit
```
Wenn EMA(15) < EMA(300) UND Profit < 5%:
    Position schließen
```
Bei großen Gewinnen (>5%) verlassen wir uns auf das Trailing.

### Time Stop
```
Wenn Position > 72 Stunden UND Profit < 0.5%:
    Position schließen
```

---

## 🏆 Top 10 Trades

| Rank | Entry | Return | Haltedauer |
|------|-------|--------|------------|
| 🥇 | 2023-01-06 | **+21.49%** | 8 Tage |
| 🥈 | 2023-03-13 | **+9.09%** | 1 Tag |
| 🥉 | 2025-09-30 | **+7.61%** | 4 Tage |
| 4 | 2024-11-05 | +6.28% | 2 Tage |
| 5 | 2024-07-15 | +4.75% | 3 Tage |
| 6 | 2022-07-19 | +4.62% | 2 Tage |
| 7 | 2024-10-11 | +4.48% | 4 Tage |
| 8 | 2022-10-25 | +4.44% | 2 Tage |
| 9 | 2024-07-25 | +4.43% | 2 Tage |
| 10 | 2024-03-25 | +4.19% | 2 Tage |

---

## 📉 Gewinn-Verteilung

| Kategorie | Trades | Prozent |
|-----------|--------|---------|
| 🔥 Huge (>10%) | 1 | 2% |
| 💪 Big (5-10%) | 3 | 7% |
| ✅ Medium (2-5%) | 12 | 29% |
| 📊 Small (<2%) | 26 | 62% |

**Insight:** 4 Trades über 5% machen ~40% des Gesamtgewinns aus!

---

## 📋 Vollständige Trade-Historie

### 2022

| # | Entry | Exit | Entry $ | Exit $ | Return | Result |
|---|-------|------|---------|--------|--------|--------|
| 1 | 16.03. | 20.03. | 40.310 | 41.815 | +3.53% | ✅ WIN |
| 2 | 21.04. | 21.04. | 42.254 | 41.462 | -2.07% | ❌ LOSS |
| 3 | 18.07. | 18.07. | 21.862 | 21.876 | -0.13% | ❌ LOSS |
| 4 | 19.07. | 20.07. | 22.433 | 23.515 | +4.62% | ✅ WIN |
| 5 | 05.08. | 09.08. | 23.190 | 23.473 | +1.02% | ✅ WIN |
| 6 | 05.10. | 06.10. | 20.002 | 20.142 | +0.50% | ✅ WIN |
| 7 | 14.10. | 14.10. | 19.803 | 19.359 | -2.44% | ❌ LOSS |
| 8 | 18.10. | 18.10. | 19.644 | 19.416 | -1.36% | ❌ LOSS |
| 9 | 25.10. | 27.10. | 19.490 | 20.396 | +4.44% | ✅ WIN |

### 2023

| # | Entry | Exit | Entry $ | Exit $ | Return | Result |
|---|-------|------|---------|--------|--------|--------|
| 10 | 06.01. | 15.01. | 16.940 | 20.618 | **+21.49%** | ✅ WIN |
| 11 | 07.02. | 07.02. | 23.283 | 22.932 | -1.71% | ❌ LOSS |
| 12 | 01.03. | 02.03. | 23.778 | 23.494 | -1.39% | ❌ LOSS |
| 13 | 13.03. | 14.03. | 22.480 | 24.570 | **+9.09%** | ✅ WIN |
| 14 | 26.04. | 30.04. | 28.413 | 29.655 | +4.17% | ✅ WIN |
| 15 | 04.05. | 07.05. | 29.044 | 28.943 | -0.55% | ❌ LOSS |
| 16 | 18.06. | 18.06. | 26.650 | 26.415 | -1.08% | ❌ LOSS |
| 17 | 19.06. | 19.06. | 26.665 | 26.496 | -0.83% | ❌ LOSS |
| 18 | 19.06. | 20.06. | 26.682 | 26.754 | +0.07% | ✅ WIN |
| 19 | 07.07. | 08.07. | 30.391 | 30.172 | -0.92% | ❌ LOSS |
| 20 | 09.07. | 10.07. | 30.332 | 30.161 | -0.76% | ❌ LOSS |
| 21 | 10.07. | 10.07. | 30.529 | 30.302 | -0.94% | ❌ LOSS |
| 22 | 02.08. | 02.08. | 29.650 | 29.026 | -2.30% | ❌ LOSS |
| 23 | 08.08. | 09.08. | 29.439 | 29.755 | +0.87% | ✅ WIN |
| 24 | 11.08. | 14.08. | 29.482 | 29.266 | -0.93% | ❌ LOSS |
| 25 | 14.08. | 15.08. | 29.534 | 29.333 | -0.88% | ❌ LOSS |
| 26 | 14.09. | 15.09. | 26.678 | 26.238 | -1.85% | ❌ LOSS |
| 27 | 15.09. | 17.09. | 26.776 | 26.436 | -1.47% | ❌ LOSS |
| 28 | 18.09. | 18.09. | 26.663 | 26.760 | +0.16% | ✅ WIN |
| 29 | 15.11. | 16.11. | 36.100 | 36.770 | +1.65% | ✅ WIN |
| 30 | 28.11. | 28.11. | 37.243 | 37.861 | +1.46% | ✅ WIN |
| 31 | 12.12. | 12.12. | 41.805 | 41.475 | -0.99% | ❌ LOSS |
| 32 | 17.12. | 17.12. | 42.173 | 41.718 | -1.28% | ❌ LOSS |
| 33 | 19.12. | 20.12. | 42.714 | 43.442 | +1.50% | ✅ WIN |
| 34 | 27.12. | 28.12. | 43.154 | 42.446 | -1.84% | ❌ LOSS |

### 2024

| # | Entry | Exit | Entry $ | Exit $ | Return | Result |
|---|-------|------|---------|--------|--------|--------|
| 35 | 01.01. | 03.01. | 43.111 | 43.703 | +1.17% | ✅ WIN |
| 36 | 04.01. | 05.01. | 43.676 | 43.376 | -0.89% | ❌ LOSS |
| 37 | 28.01. | 28.01. | 42.232 | 42.413 | +0.23% | ✅ WIN |
| 38 | 29.01. | 31.01. | 42.160 | 42.941 | +1.65% | ✅ WIN |
| 39 | 01.02. | 02.02. | 42.651 | 42.981 | +0.57% | ✅ WIN |
| 40 | 18.03. | 18.03. | 68.360 | 67.124 | -2.01% | ❌ LOSS |
| 41 | 25.03. | 26.03. | 66.556 | 69.478 | +4.19% | ✅ WIN |
| 42 | 06.04. | 09.04. | 68.143 | 71.056 | +4.07% | ✅ WIN |
| 43 | 05.05. | 06.05. | 64.120 | 64.007 | -0.38% | ❌ LOSS |
| 44 | 06.05. | 07.05. | 64.204 | 62.975 | -2.11% | ❌ LOSS |
| 45 | 30.05. | 30.05. | 68.163 | 68.476 | +0.26% | ✅ WIN |
| 46 | 02.06. | 04.06. | 68.253 | 68.905 | +0.76% | ✅ WIN |
| 47 | 15.07. | 17.07. | 61.212 | 64.242 | +4.75% | ✅ WIN |
| 48 | 25.07. | 27.07. | 64.791 | 67.791 | +4.43% | ✅ WIN |
| 49 | 31.07. | 31.07. | 66.440 | 65.257 | -1.98% | ❌ LOSS |
| 50 | 22.08. | 24.08. | 60.970 | 63.612 | +4.13% | ✅ WIN |
| 51 | 17.09. | 18.09. | 58.966 | 59.655 | +0.97% | ✅ WIN |
| 52 | 11.10. | 15.10. | 62.450 | 65.376 | +4.48% | ✅ WIN |
| 53 | 05.11. | 07.11. | 70.192 | 74.746 | **+6.28%** | ✅ WIN |
| 54 | 27.11. | 28.11. | 93.403 | 94.976 | +1.48% | ✅ WIN |
| 55 | 11.12. | 11.12. | 98.293 | 99.782 | +1.31% | ✅ WIN |
| 56 | 25.12. | 26.12. | 99.145 | 97.720 | -1.64% | ❌ LOSS |

### 2025

| # | Entry | Exit | Entry $ | Exit $ | Return | Result |
|---|-------|------|---------|--------|--------|--------|
| 57 | 14.01. | 16.01. | 96.336 | 97.619 | +1.13% | ✅ WIN |
| 58 | 29.01. | 30.01. | 103.584 | 104.907 | +1.08% | ✅ WIN |
| 59 | 20.02. | 21.02. | 98.295 | 96.972 | -1.54% | ❌ LOSS |
| 60 | 25.03. | 28.03. | 87.222 | 85.719 | -1.92% | ❌ LOSS |
| 61 | 12.04. | 13.04. | 84.458 | 84.620 | -0.01% | ❌ LOSS |
| 62 | 13.04. | 15.04. | 84.093 | 85.147 | +1.05% | ✅ WIN |
| 63 | 16.04. | 19.04. | 84.605 | 84.846 | +0.08% | ✅ WIN |
| 64 | 07.06. | 10.06. | 105.726 | 108.620 | +2.53% | ✅ WIN |
| 65 | 16.06. | 16.06. | 106.946 | 107.700 | +0.50% | ✅ WIN |
| 66 | 24.06. | 26.06. | 105.655 | 107.325 | +1.38% | ✅ WIN |
| 67 | 02.07. | 04.07. | 107.080 | 108.983 | +1.58% | ✅ WIN |
| 68 | 26.07. | 28.07. | 117.571 | 118.435 | +0.53% | ✅ WIN |
| 69 | 31.07. | 31.07. | 118.055 | 116.537 | -1.48% | ❌ LOSS |
| 70 | 07.08. | 09.08. | 116.363 | 117.110 | +0.44% | ✅ WIN |
| 71 | 17.08. | 17.08. | 118.430 | 117.900 | -0.65% | ❌ LOSS |
| 72 | 05.09. | 05.09. | 113.215 | 110.570 | -2.53% | ❌ LOSS |
| 73 | 09.09. | 09.09. | 113.023 | 111.767 | -1.31% | ❌ LOSS |
| 74 | 30.09. | 04.10. | 113.405 | 122.268 | **+7.61%** | ✅ WIN |
| 75 | 29.10. | 29.10. | 113.284 | 111.510 | -1.76% | ❌ LOSS |

### 2026

| # | Entry | Exit | Entry $ | Exit $ | Return | Result |
|---|-------|------|---------|--------|--------|--------|
| 76 | 03.01. | 06.01. | 89.671 | 92.692 | +3.17% | ✅ WIN |
| 77 | 08.01. | 11.01. | 90.782 | 90.876 | -0.10% | ❌ LOSS |

---

## 🤖 Bot-Implementation (Pseudo-Code)

```python
class SmartMoneyBot:
    # Indikatoren
    EMA_FAST = 15
    EMA_SLOW = 300
    EMA_HTF = 800
    RSI_MIN = 45
    RSI_MAX = 70
    
    # Risk Management
    INITIAL_SL_ATR = 2.5
    TRAIL_TIER1 = (3.0, 2.0)   # (trigger, distance)
    TRAIL_TIER2 = (5.0, 4.0)
    
    def check_entry(self, candles):
        ema_fast = EMA(candles.close, self.EMA_FAST)
        ema_slow = EMA(candles.close, self.EMA_SLOW)
        ema_htf = EMA(candles.close, self.EMA_HTF)
        rsi = RSI(candles.close, 14)
        
        # Golden Cross Check
        golden_cross = (
            ema_fast[-1] > ema_slow[-1] and 
            ema_fast[-2] <= ema_slow[-2]
        )
        
        # Filters
        htf_bullish = candles.close[-1] > ema_htf[-1]
        rsi_valid = self.RSI_MIN <= rsi[-1] <= self.RSI_MAX
        
        if golden_cross and htf_bullish and rsi_valid:
            return "LONG"
        
        return None
    
    def calculate_stop_loss(self, entry_price, atr, profit_atr):
        if profit_atr >= 5.0:
            trail_distance = 4.0
        elif profit_atr >= 3.0:
            trail_distance = 2.0
        else:
            trail_distance = 2.5
        
        return entry_price - (atr * trail_distance)
    
    def should_exit(self, position, current_price, ema_fast, ema_slow):
        # Stop Loss Hit
        if current_price <= position.stop_loss:
            return True
        
        # Death Cross (only if small profit)
        if ema_fast < ema_slow:
            profit_pct = (current_price - position.entry) / position.entry
            if profit_pct < 0.05:
                return True
        
        # Time Stop
        if position.bars_held > 72 and position.profit_pct < 0.005:
            return True
        
        return False
```

---

## ⚙️ Empfohlene Einstellungen für Live-Trading

| Parameter | Wert | Hinweis |
|-----------|------|---------|
| Timeframe | 1H | Höher = weniger Signale, stabiler |
| Position Size | 1-2% Risk | Pro Trade max 2% des Kapitals |
| Leverage | 1-3x | Kein hohes Leverage nötig |
| Exchange | Binance/Bybit | Niedrige Fees wichtig |

---

## ⚠️ Disclaimer

Diese Strategie basiert auf historischen Backtests. Vergangene Performance garantiert keine zukünftigen Ergebnisse.

- Backtest enthält **keine** Slippage-Simulation
- Reale Ausführung kann abweichen  
- Nur mit Kapital handeln, das man verlieren kann

---

## 📁 Dateien

| Datei | Beschreibung |
|-------|--------------|
| `strategy_asymmetric.py` | Python Strategy-Klasse |
| `results/asymmetric_strategy_plot.html` | Interaktiver Backtest-Chart |
| `results/asymmetric_trades.csv` | Alle Trades als CSV |

---

*Erstellt: Februar 2026 | Version 3.0 (Asymmetric)*
