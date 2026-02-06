import pandas as pd

def generate_report():
    # Load trades
    try:
        trades = pd.read_csv('full_trade_list.csv')
    except FileNotFoundError:
        print("Trade list not found.")
        return

    # Strategy Details
    strategy_name = "TrendGuard Dynamic 800/100"
    
    description = """
## Strategy Logic
**"TrendGuard Dynamic"** is a low-frequency, low-drawdown Trend Following strategy designed to capture major Bitcoin moves while strictly protecting capital during choppy markets.

### 1. Trend Filter (The "Guard")
-   **Indicator**: 800-Hour Simple Moving Average (approx. 1 Month trend).
-   **Logic**: Longs are only allowed if Price > 800 SMA. Shorts only if Price < 800 SMA.
-   **Purpose**: Ensures we only trade in the direction of the dominant monthly trend.

### 2. Entry Signal (The "Trigger")
-   **Indicator**: 100-Hour Donchian Channel (4-Day Breakout).
-   **Logic**: 
    -   **Long**: Price breaks above the highest high of the last 100 hours.
    -   **Short**: Price breaks below the lowest low of the last 100 hours.
-   **Purpose**: Enters only on significant structure breaks, avoiding small noise.

### 3. Strength Confirmation
-   **Indicator**: ADX (Average Directional Index) (14 period).
-   **Logic**: ADX must be > 25.
-   **Purpose**: Filters out "weak" breakouts. We only want to trade when the market is showing strong momentum.

### 4. Risk Management (The "Shield")
-   **Position Sizing**: **Dynamic Risk%**.
    -   We risk exactly **1.0%** of account equity per trade.
    -   *Example*: On a $100k account, we risk losing max $1,000.
    -   Position size is calculated automatically based on the stop loss distance.
-   **Exit (Stop Loss)**: ATR Trailing Stop.
    -   Stop Loss is set at **4.0x ATR** (Average True Range) from the price.
    -   This is a "Wide" stop, allowing the trade to breathe and ride volatile trends without getting shaken out early.

---

## Performance Summary (2022 - 2026)
-   **Total Return**: +76.15%
-   **Max Drawdown**: -9.3% (Extremely Safe)
-   **Win Rate**: 38.4% (Typical for trend following - winners are much larger than losers)
-   **Profit Factor**: 1.32
-   **Total Trades**: 224
    """

    # Format Trade Table
    # Select relevant columns
    display_cols = ['EntryTime', 'Type', 'EntryPrice', 'ExitTime', 'ExitPrice', 'Size', 'PnL', 'ReturnPct', 'Duration']
    
    # Check if columns exist (backtesting.py naming varies slightly depending on version, sometimes headers are different)
    # The printed output showed: Size, EntryBar, ExitBar, EntryPrice, ExitPrice, SL, TP, PnL, Commission, ReturnPct, EntryTime, ExitTime, Duration
    
    # We'll map/rename for cleaner view if needed
    if 'EntryTime' in trades.columns:
        trades['EntryTime'] = pd.to_datetime(trades['EntryTime']).dt.strftime('%Y-%m-%d %H:%M')
    if 'ExitTime' in trades.columns:
        trades['ExitTime'] = pd.to_datetime(trades['ExitTime']).dt.strftime('%Y-%m-%d %H:%M')
        
    trades['Type'] = trades['Size'].apply(lambda x: 'LONG' if x > 0 else 'SHORT')
    trades['EntryPrice'] = trades['EntryPrice'].round(2)
    trades['ExitPrice'] = trades['ExitPrice'].round(2)
    trades['PnL'] = trades['PnL'].round(2)
    trades['ReturnPct'] = (trades['ReturnPct'] * 100).round(2).astype(str) + '%'
    
    # Prepare Markdown Table
    table_md = trades[['EntryTime', 'Type', 'EntryPrice', 'ExitTime', 'ExitPrice', 'PnL', 'ReturnPct']].to_markdown(index=False)

    # Write Complete Report
    with open('STRATEGY_REPORT.md', 'w') as f:
        f.write(f"# Strategy Report: {strategy_name}\n")
        f.write(description)
        f.write("\n\n## Full Trade List\n")
        f.write(table_md)

    print("STRATEGY_REPORT.md generated successfully.")

if __name__ == "__main__":
    generate_report()
