import os
import pandas as pd

trades_path = "results/trades.csv"
output_path = "results/FINAL_STRATEGY_AND_TRADES.md"


def resolve_spec_path():
    candidates = [
        os.getenv("STRATEGY_SPEC_PATH"),
        "strategy_spec.md",
        "results/COMPLETE_STRATEGY_DOCUMENTATION.md",
    ]
    for path in candidates:
        if path and os.path.exists(path):
            return path
    return None


def generate_report():
    spec_path = resolve_spec_path()

    # 1. Read strategy spec if available
    if spec_path:
        with open(spec_path, "r", encoding="utf-8") as f:
            spec_content = f.read()
    else:
        spec_content = "# Strategy Specification\n\nNo strategy spec file found."

    # 2. Read trades
    df = pd.read_csv(trades_path)
    df["EntryTime"] = pd.to_datetime(df["EntryTime"])
    df["Type"] = df["Size"].apply(lambda x: "LONG" if x > 0 else "SHORT")
    df["Result"] = df["ReturnPct"].apply(lambda x: "WIN" if x > 0 else "LOSS")
    df["ReturnPct"] = (df["ReturnPct"] * 100).round(2)

    # Format columns
    df_clean = df[["EntryTime", "Type", "EntryPrice", "ExitPrice", "ReturnPct", "Result"]]
    trades_md = df_clean.to_markdown(index=False)

    # 3. Combine
    final_content = f"""{spec_content}

---

# Full Trade History (2022 - 2025)

Here is the complete list of all **{len(df)} Trades** executed by the strategy.

{trades_md}
"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(final_content)

    print(f"Successfully created {output_path}")


if __name__ == "__main__":
    generate_report()
