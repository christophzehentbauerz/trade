# Hybrid Strategy Specification
## "Trend Following & Deep Pullback"

This document details the exact logic of the implemented strategy. Use this to verify the strategy on other platforms (TradingView, manually, etc.).

---

### 1. Conceptual Logic
*   **Philosophy:** "Don't fight the trend. Buy only when it's cheap."
*   **Timeframes:** Hybrid (D1 for Direction, H1/Daily for Entry).
*   **Type:** Swing Trading (Days to Weeks).

### 2. Indicators & Settings
| Indicator | Timeframe | Settings | Purpose |
| :--- | :--- | :--- | :--- |
| **SMA** (Simple Moving Average) | **Daily (D1)** | Length: 50 | Determines the "Baseline" (Above = Bullish, Below = Bearish). |
| **MACD** | **Daily (D1)** | 12, 26, 9 | Confirmation of Momentum (Histogram must match direction). |
| **RSI** | **Entry Timeframe** (D1/H1) | Length: 14 | Spotting "Oversold" conditions within the trend. |
| **ATR** (Average True Range) | **Entry Timeframe** | Length: 14 | Measures Volatility for dynamic Risk Management. |

---

### 3. Rules Engine

#### A. Trend Filter (Regime Detection)
Before looking for a trade, check the Daily Chart:
1.  **Bullish Regime:**
    *   `Price > SMA 50` (Price is above average)
    *   **AND** `MACD Histogram > 0` (Momentum is rising/positive)
2.  **Bearish Regime:**
    *   `Price < SMA 50`
    *   **AND** `MACD Histogram < 0`
3.  **Neutral:**
    *   Anything else (e.g., Price > SMA50 but MACD is negative). **NO TRADES.**

#### B. Signal Trigger (Entry)
If the Regime is **Bullish**:
*   WAIT for `RSI < 55`.
    *   *Why?* We want to buy a "Deep Pullback". We don't buy the top.
    *   **Signal:** BUY (LONG)

If the Regime is **Bearish**:
*   WAIT for `RSI > 45`.
    *   *Why?* We want to sell a "Rally". We don't sell the bottom.
    *   **Signal:** SELL (SHORT)

#### C. Risk Management (Exit)
Once in a trade:
1.  **Stop Loss (SL):**
    *   Distance: `2.0 x ATR`
    *   *Logic:* Give the trade "breathing room" based on current volatility. If it hits this, the idea was wrong.
2.  **Take Profit (TP):**
    *   Distance: `4.0 x ATR`
    *   *Logic:* Target a grand slam. We want a **2:1 Reward-to-Risk Ratio**.
3.  **Break-Even (Trailing):**
    *   Trigger: If Price moves `+1.0 x ATR` in our favor.
    *   Action: Move Stop Loss to Entry Price.
    *   *Logic:* Protect capital. A "Free Ride".

---

### 4. Why only 11 Trades in 365 Days?
This strategy is **highly selective**.
*   It requires the stars to align: Strong Trend + Negative Momentum (Pullback) at the same time.
*   It filters out all the "choppy" noise where most traders lose money.
*   **Result:** Low Frequency, High Reliability (or High R:R).

### 5. TradingView / Pine Script Logic
If you want to code this elsewhere:

```pinescript
// Pine Script v5 Example Logic
study("Hybrid Trend Strategy", overlay=true)

// Indicators
sma50 = ta.sma(close, 50)
[macdLine, signalLine, hist] = ta.macd(close, 12, 26, 9)
rsi = ta.rsi(close, 14)

// Filter
bullish = (close > sma50) and (hist > 0)

// Entry
longCondition = bullish and (rsi < 55)

// Plot
plotshape(longCondition, title="Buy", location=location.belowbar, color=color.green, style=shape.labelup, text="BUY")
```
