import pandas as pd
import numpy as np
from backtesting import Backtest
from strategy import SmartMoneyStrategy
from data_loader import load_or_fetch_data # We need to expose this in data_loader or import from backtest_runner
import matplotlib.pyplot as plt
import seaborn as sns
import os

# Ensure we can import properly
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backtest_runner import load_or_fetch_data

def walk_forward_analysis(data, segments=4):
    """
    Splits data into overlapping Train/Test segments.
    Train: 70%, Test: 30% of each segment (or sliding window).
    """
    print(f"\n--- Starting Walk-Forward Analysis ({segments} segments) ---")
    
    # Simple Walk-Forward: Divide data into N chunks
    chunk_size = len(data) // segments
    train_size = int(chunk_size * 0.7)
    
    results = []
    
    for i in range(segments):
        start_idx = i * chunk_size
        end_idx = start_idx + chunk_size
        
        segment_data = data.iloc[start_idx:end_idx]
        train_data = segment_data.iloc[:train_size]
        test_data = segment_data.iloc[train_size:]
        
        print(f"Segment {i+1}/{segments}: Train {len(train_data)} bars, Test {len(test_data)} bars")
        
        # 1. Optimize on Train
        bt_train = Backtest(train_data, SmartMoneyStrategy, cash=100_000, commission=.001)
        stats_train = bt_train.optimize(
            swing_length=[8, 10, 12, 15],
            regime_buffer=[0.005, 0.01],
            maximize='Profit Factor',
            verbose=False
        )
        best_params = stats_train._strategy
        print(f"  Best Params: Swing={best_params.swing_length}, Buffer={best_params.regime_buffer}")
        
        # 2. Run on Test using Best Params
        bt_test = Backtest(test_data, SmartMoneyStrategy, cash=100_000, commission=.001)
        stats_test = bt_test.run(
            swing_length=best_params.swing_length,
            regime_buffer=best_params.regime_buffer,
            tp_atr_mult=best_params.tp_atr_mult,
            sl_atr_mult=best_params.sl_atr_mult
        )
        
        results.append({
            'segment': i+1,
            'train_return': stats_train['Return [%]'],
            'test_return': stats_test['Return [%]'],
            'test_sharpe': stats_test['Sharpe Ratio'],
            'test_trades': stats_test['# Trades']
        })
        print(f"  Test Result: Return={stats_test['Return [%]:.2f']}%, Sharpe={stats_test['Sharpe Ratio']:.2f}")

    return pd.DataFrame(results)

def monte_carlo_simulation(trades_df, simulations=1000):
    """
    Resample trades to generate probability cones for equity.
    """
    print(f"\n--- Starting Monte Carlo Simulation ({simulations} runs) ---")
    
    if len(trades_df) < 10:
        print("Not enough trades for Monte Carlo.")
        return

    returns = trades_df['ReturnPct'] # We need to ensure strategy records this or calculate from PnL
    # Backtesting.py trades object has 'ReturnPct' usually
    
    # If using standard backtesting.py stats['_trades'], it has 'ReturnPct'
    
    # Simulation
    final_equities = []
    max_drawdowns = []
    
    start_equity = 100_000
    
    for i in range(simulations):
        # Shuffle returns with replacement
        sim_returns = np.random.choice(returns, size=len(returns), replace=True)
        equity_curve = [start_equity]
        
        peak = start_equity
        max_dd = 0
        
        for ret in sim_returns:
            # ret is fractional e.g. 0.05 for 5%
            # backtesting.py returns are usually ratio? Check.
            # actually let's use PnL absolute for checking
            pass
            
        # Simplified: Just accumulate PnL pct for equity curve approx
        # Using cumprod for compound
        cum_ret = (1 + sim_returns).cumprod()
        final_equity = start_equity * cum_ret[-1]
        final_equities.append(final_equity)
        
        # Drawdown
        curve = start_equity * np.concatenate([[1], cum_ret])
        peaks = np.maximum.accumulate(curve)
        dds = (peaks - curve) / peaks
        max_drawdowns.append(np.max(dds))
        
    # Stats
    fe = np.array(final_equities)
    mdd = np.array(max_drawdowns)
    
    print(f"Monte Carlo Results:")
    print(f"Median Final Equity: ${np.median(fe):,.2f}")
    print(f"95% VaR Final Equity: ${np.percentile(fe, 5):,.2f}")
    print(f"Median Max Drawdown: {np.median(mdd)*100:.2f}%")
    print(f"95% Worst Drawdown: {np.percentile(mdd, 95)*100:.2f}%")
    
    return fe, mdd

def run_advanced():
    # 1. Get Data
    data = load_or_fetch_data()
    
    # 2. Run Baseline to get trades
    bt = Backtest(data, SmartMoneyStrategy, cash=100_000, commission=.001)
    stats = bt.run()
    trades = stats['_trades']
    
    # 3. Monte Carlo
    if not trades.empty and 'ReturnPct' in trades.columns:
        # trades['ReturnPct'] is usually present
        monte_carlo_simulation(trades['ReturnPct'], simulations=1000)
    else:
        print("No trades generated or missing ReturnPct column.")

    # 4. Walk Forward
    wf_results = walk_forward_analysis(data)
    print("\nWalk-Forward Summary:")
    print(wf_results)
    wf_results.to_csv("results/walk_forward_results.csv")

if __name__ == "__main__":
    os.makedirs("results", exist_ok=True)
    run_advanced()
