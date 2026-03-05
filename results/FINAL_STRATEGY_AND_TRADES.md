# 📜 Strategy Specification: BTC Golden Momentum (Balanced Version)

This strategy achieved **+90.6% Return** with an elite **Profit Factor of 2.07** in the backtest (2022-2025).

## 1. Indicators
| Indicator | Settings | Purpose |
| :--- | :--- | :--- |
| **EMA Fast** | Period: **20** | Trend Trigger. |
| **EMA Slow** | Period: **300** | Trend Baseline. |
| **RSI** | Period: **14** | Momentum (Target: 60). |
| **HTF Filter** | EMA **4800** (1H) | **Daily EMA 200** approximation. Defines Macro Trend. |

## 2. Trading Logic (1-Hour Candles)

### 📈 Global Trend Filter (Daily 200 EMA)
*   **LONG-Only Mode:** If Price > EMA 4800.
*   **SHORT-Only Mode:** If Price < EMA 4800.

### 🚀 Entry Triggers
1.  **LONG:** Fast EMA > Slow EMA **AND** RSI > 60 **AND** Global Trend is UP.
2.  **SHORT:** Fast EMA < Slow EMA **AND** Global Trend is DOWN.
    *   *Note: Short Position Size is reduced to 50% for safety.*

### 🛡️ Risk Management (The "Sweet Spot")
1.  **Time-Based Stop (18h):**
    *   If a trade is held for **18 Hours** and is **not profitable**, close it.
    *   *Reason:* Gives the trade room to breathe, but kills it if it stalls for a full day.
2.  **Wide Trailing Stop (5.0 ATR):**
    *   Protect gains but don't choke the volatility.
3.  **Break-Even Trigger (3.0 ATR):**
    *   Once price moves **3.0 ATR** in profit, move Stop Loss to Break Even. (Locks in the win).

## 3. Results (Balanced Final)
| Metric | Buy & Hold | **Strategy** |
| :--- | :--- | :--- |
| Total Return | +47.6% | **+90.6%** 🚀 |
| Profit Factor | N/A | **2.07** (Elite) |
| Max Drawdown | -70%+ | **-18.7%** (Very Safe) |
| Win Rate | N/A | ~27% (High Quality Trend Following) |

## 4. Implementation Snippet
```python
# Trailing Stop & BE Logic
atr = calculate_atr(high, low, close, 14)
sl_dist = atr * 5.0
if profit > atr * 3.0:
    sl_price = entry_price # Break Even
else:
    sl_price = max(sl_price, current_price - sl_dist)
```



---

# 📊 Full Trade History (2022 - 2025)

Here is the complete list of all **94 Trades** executed by the strategy.

| EntryTime           | Type   |   EntryPrice |   ExitPrice |   ReturnPct | Result   |
|:--------------------|:-------|-------------:|------------:|------------:|:---------|
| 2022-01-04 03:00:00 | SHORT  |      46103.4 |     46440   |       -0.93 | LOSS     |
| 2022-01-13 17:00:00 | SHORT  |      43250.9 |     43296.3 |       -0.31 | LOSS     |
| 2022-02-02 19:00:00 | SHORT  |      37486.4 |     37547   |       -0.36 | LOSS     |
| 2022-02-17 21:00:00 | SHORT  |      40878.7 |     38422   |        5.82 | WIN      |
| 2022-03-04 22:00:00 | SHORT  |      39392.8 |     39430   |       -0.29 | LOSS     |
| 2022-03-10 13:00:00 | SHORT  |      39242.8 |     39894.1 |       -1.86 | LOSS     |
| 2022-04-22 01:00:00 | SHORT  |      40427.2 |     40226   |        0.3  | WIN      |
| 2022-05-05 16:00:00 | SHORT  |      36909.7 |     30457.9 |       17.3  | WIN      |
| 2022-06-02 07:00:00 | SHORT  |      29915.2 |     30401.5 |       -1.83 | LOSS     |
| 2022-06-03 13:00:00 | SHORT  |      29531.3 |     29694.9 |       -0.75 | LOSS     |
| 2022-06-07 10:00:00 | SHORT  |      29561.5 |     31059.7 |       -5.27 | LOSS     |
| 2022-06-09 21:00:00 | SHORT  |      30185.9 |     19907.4 |       33.88 | WIN      |
| 2022-07-11 10:00:00 | SHORT  |      20549.2 |     20390   |        0.58 | WIN      |
| 2022-07-25 19:00:00 | SHORT  |      21824.3 |     22554.5 |       -3.55 | LOSS     |
| 2022-08-04 19:00:00 | SHORT  |      22541.7 |     23018.9 |       -2.32 | LOSS     |
| 2022-08-10 05:00:00 | SHORT  |      22941.3 |     23983.9 |       -4.75 | LOSS     |
| 2022-08-17 15:00:00 | SHORT  |      23350.3 |     23462.5 |       -0.68 | LOSS     |
| 2022-09-14 04:00:00 | SHORT  |      20323   |     19601.3 |        3.35 | WIN      |
| 2022-09-28 01:00:00 | SHORT  |      19095.9 |     19555.6 |       -2.61 | LOSS     |
| 2022-09-29 13:00:00 | SHORT  |      19211.6 |     19445.1 |       -1.42 | LOSS     |
| 2022-10-01 10:00:00 | SHORT  |      19329.5 |     19334   |       -0.22 | LOSS     |
| 2022-10-08 02:00:00 | SHORT  |      19593   |     19157.9 |        2.02 | WIN      |
| 2022-10-14 22:00:00 | SHORT  |      19107.9 |     19128   |       -0.3  | LOSS     |
| 2022-10-19 05:00:00 | SHORT  |      19276.2 |     19325.6 |       -0.46 | LOSS     |
| 2022-11-08 05:00:00 | SHORT  |      19636.1 |     16845.3 |       14.03 | WIN      |
| 2022-12-07 18:00:00 | SHORT  |      16806   |     16850.9 |       -0.47 | LOSS     |
| 2022-12-16 16:00:00 | SHORT  |      16972.3 |     16899.3 |        0.23 | WIN      |
| 2023-01-03 15:00:00 | SHORT  |      16662.1 |     16862.6 |       -1.4  | LOSS     |
| 2023-02-15 16:00:00 | LONG   |      22809.5 |     23994.8 |        4.99 | WIN      |
| 2023-03-13 10:00:00 | LONG   |      21961.7 |     26668.8 |       21.21 | WIN      |
| 2023-04-26 13:00:00 | LONG   |      29965.5 |     27884.2 |       -7.14 | LOSS     |
| 2023-05-04 03:00:00 | LONG   |      29060.6 |     28870.2 |       -0.85 | LOSS     |
| 2023-05-23 15:00:00 | LONG   |      27321.3 |     26712.6 |       -2.43 | LOSS     |
| 2023-05-28 06:00:00 | LONG   |      27164.8 |     27257.7 |        0.14 | WIN      |
| 2023-06-17 05:00:00 | LONG   |      26358.5 |     26340   |       -0.27 | LOSS     |
| 2023-07-10 19:00:00 | LONG   |      30529   |     30433.1 |       -0.51 | LOSS     |
| 2023-08-08 15:00:00 | LONG   |      29439.1 |     29513.4 |        0.05 | WIN      |
| 2023-08-29 19:00:00 | LONG   |      27971.8 |     27353.6 |       -2.41 | LOSS     |
| 2023-08-31 22:00:00 | SHORT  |      26024.6 |     26011.2 |       -0.15 | LOSS     |
| 2023-09-24 21:00:00 | SHORT  |      26502   |     26766.7 |       -1.2  | LOSS     |
| 2023-10-16 06:00:00 | LONG   |      27916.4 |     36480   |       30.45 | WIN      |
| 2023-12-13 21:00:00 | LONG   |      42874.9 |     42655.3 |       -0.71 | LOSS     |
| 2023-12-19 02:00:00 | LONG   |      43315   |     42342   |       -2.44 | LOSS     |
| 2023-12-27 22:00:00 | LONG   |      43366.2 |     42446   |       -2.32 | LOSS     |
| 2024-01-01 20:00:00 | LONG   |      43518   |     43702.9 |        0.22 | WIN      |
| 2024-01-27 01:00:00 | LONG   |      41785.9 |     41785.9 |       -0.2  | LOSS     |
| 2024-03-25 04:00:00 | LONG   |      67350   |     68475.6 |        1.47 | WIN      |
| 2024-04-06 19:00:00 | LONG   |      68307.3 |     69358.3 |        1.34 | WIN      |
| 2024-04-22 07:00:00 | LONG   |      66300   |     66244   |       -0.28 | LOSS     |
| 2024-05-04 09:00:00 | LONG   |      63160.9 |     63141.7 |       -0.23 | LOSS     |
| 2024-05-10 10:00:00 | LONG   |      63127   |     61063.9 |       -3.46 | LOSS     |
| 2024-05-13 16:00:00 | LONG   |      63002   |     61797.8 |       -2.11 | LOSS     |
| 2024-05-15 13:00:00 | LONG   |      63757.6 |     66034   |        3.37 | WIN      |
| 2024-06-02 15:00:00 | LONG   |      68252.5 |     69803.6 |        2.07 | WIN      |
| 2024-07-01 17:00:00 | LONG   |      63119.3 |     62716   |       -0.84 | LOSS     |
| 2024-07-14 00:00:00 | LONG   |      59204   |     66092   |       11.42 | WIN      |
| 2024-08-14 18:00:00 | SHORT  |      59168.4 |     59451.3 |       -0.68 | LOSS     |
| 2024-08-18 23:00:00 | SHORT  |      59350   |     59438.5 |       -0.35 | LOSS     |
| 2024-08-20 05:00:00 | LONG   |      60865.6 |     58825.5 |       -3.55 | LOSS     |
| 2024-08-21 01:00:00 | SHORT  |      58989   |     60771.3 |       -3.22 | LOSS     |
| 2024-08-28 01:00:00 | SHORT  |      59088.9 |     59487   |       -0.87 | LOSS     |
| 2024-09-11 06:00:00 | SHORT  |      56244   |     57338   |       -2.15 | LOSS     |
| 2024-10-07 01:00:00 | LONG   |      63678   |     62848   |       -1.5  | LOSS     |
| 2024-10-12 02:00:00 | LONG   |      62733.7 |     62712.3 |       -0.23 | LOSS     |
| 2024-11-05 18:00:00 | LONG   |      69949.6 |     97280   |       38.83 | WIN      |
| 2025-01-02 15:00:00 | LONG   |      97256.5 |     96130   |       -1.36 | LOSS     |
| 2025-01-14 18:00:00 | LONG   |      96528   |    101332   |        4.77 | WIN      |
| 2025-01-29 21:00:00 | LONG   |     104194   |    104008   |       -0.38 | LOSS     |
| 2025-02-20 17:00:00 | LONG   |      97550.7 |     96971.9 |       -0.79 | LOSS     |
| 2025-03-03 00:00:00 | LONG   |      94270   |     90300   |       -4.41 | LOSS     |
| 2025-03-06 02:00:00 | LONG   |      91057.2 |     88526.2 |       -2.98 | LOSS     |
| 2025-03-19 22:00:00 | LONG   |      85636   |     84691.3 |       -1.3  | LOSS     |
| 2025-03-21 14:00:00 | SHORT  |      83935.7 |     84274.7 |       -0.6  | LOSS     |
| 2025-03-28 16:00:00 | SHORT  |      84051.1 |     84121.9 |       -0.28 | LOSS     |
| 2025-04-03 04:00:00 | SHORT  |      83484   |     83992.9 |       -0.81 | LOSS     |
| 2025-06-07 23:00:00 | LONG   |     105821   |    105771   |       -0.25 | LOSS     |
| 2025-06-16 12:00:00 | LONG   |     106884   |    106795   |       -0.28 | LOSS     |
| 2025-06-24 11:00:00 | LONG   |     105282   |    107407   |        1.82 | WIN      |
| 2025-07-02 08:00:00 | LONG   |     107080   |    107573   |        0.26 | WIN      |
| 2025-07-26 11:00:00 | LONG   |     117972   |    117950   |       -0.22 | LOSS     |
| 2025-08-07 17:00:00 | LONG   |     116259   |    116208   |       -0.24 | LOSS     |
| 2025-09-05 09:00:00 | LONG   |     112619   |    111216   |       -1.44 | LOSS     |
| 2025-09-08 10:00:00 | LONG   |     112095   |    111708   |       -0.54 | LOSS     |
| 2025-09-29 17:00:00 | LONG   |     113626   |    112924   |       -0.82 | LOSS     |
| 2025-12-01 01:00:00 | SHORT  |      87000   |     86977   |       -0.17 | LOSS     |
| 2025-12-05 21:00:00 | SHORT  |      89301.8 |     90004.8 |       -0.99 | LOSS     |
| 2025-12-09 06:00:00 | SHORT  |      89899.4 |     94187.8 |       -4.98 | LOSS     |
| 2025-12-11 13:00:00 | SHORT  |      90032.3 |     92858.4 |       -3.34 | LOSS     |
| 2025-12-13 01:00:00 | SHORT  |      90323   |     90340   |       -0.22 | LOSS     |
| 2025-12-23 06:00:00 | SHORT  |      87765   |     88009.8 |       -0.48 | LOSS     |
| 2025-12-26 16:00:00 | SHORT  |      87137.8 |     87618.9 |       -0.75 | LOSS     |
| 2025-12-29 18:00:00 | SHORT  |      87850   |     87903.9 |       -0.26 | LOSS     |
| 2025-12-31 23:00:00 | SHORT  |      87728.3 |     87988.8 |       -0.5  | LOSS     |
| 2026-01-19 15:00:00 | SHORT  |      92812.4 |     89396   |        3.48 | WIN      |
