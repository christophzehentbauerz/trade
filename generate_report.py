import pandas as pd
import os

# Paths
spec_path = r"C:\Users\Chris\.gemini\antigravity\brain\821c897f-9b6c-45d2-aff1-4b356c9e93ae\strategy_spec.md"
trades_path = "results/trades.csv"
output_path = "results/FINAL_STRATEGY_AND_TRADES.md"

def generate_report():
    # 1. Read Strategy Spec
    with open(spec_path, "r", encoding="utf-8") as f:
        spec_content = f.read()

    # 2. Read Trades
    df = pd.read_csv(trades_path)
    df['EntryTime'] = pd.to_datetime(df['EntryTime'])
    df['Type'] = df['Size'].apply(lambda x: 'LONG' if x > 0 else 'SHORT')
    df['Result'] = df['ReturnPct'].apply(lambda x: 'WIN' if x > 0 else 'LOSS')
    df['ReturnPct'] = (df['ReturnPct'] * 100).round(2)
    
    # Format Columns
    df_clean = df[['EntryTime', 'Type', 'EntryPrice', 'ExitPrice', 'ReturnPct', 'Result']]
    
    # Convert to Markdown Table
    trades_md = df_clean.to_markdown(index=False)

    # 3. Combine
    final_content = f"""{spec_content}

---

# 📊 Full Trade History (2022 - 2025)

Here is the complete list of all **{len(df)} Trades** executed by the strategy.

{trades_md}
"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(final_content)
    
    print(f"Successfully created {output_path}")

if __name__ == "__main__":
    generate_report()
