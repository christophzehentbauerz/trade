# -*- coding: utf-8 -*-
"""
Deep Optimizer for Smart Golden Cross
======================================
Extensive grid search to find the optimal high win rate configuration.
"""

import pandas as pd
from backtesting import Backtest
from strategy_momentum_pullback import SmartGoldenCrossStrategy
import warnings
warnings.filterwarnings('ignore')


def load_data():
    data = pd.read_csv('data/btc_usdt_1h.csv')
    data.columns = [col.capitalize() for col in data.columns]
    
    if 'Timestamp' in data.columns:
        data['Time'] = pd.to_datetime(data['Timestamp'])
        data.set_index('Time', inplace=True)
    
    clean_data = pd.DataFrame(index=data.index)
    for col in ['Open', 'High', 'Low', 'Close', 'Volume']:
        if col in data.columns:
            clean_data[col] = data[col].astype(float)
    
    return clean_data


def deep_optimize():
    print()
    print("=" * 60)
    print("DEEP OPTIMIZATION: Smart Golden Cross")
    print("Target: Win Rate > 55%, PF > 1.5, Return > 50%")
    print("=" * 60)
    
    data = load_data()
    print(f"Data: {len(data)} bars")
    print()
    
    bt = Backtest(data, SmartGoldenCrossStrategy, cash=100_000, commission=.001, trade_on_close=False)
    
    # Score function optimized for win rate
    def winrate_focused_score(stats):
        if stats['# Trades'] < 20:
            return 0
        if stats['Win Rate [%]'] < 50:  # Must be at least 50%
            return 0
        if pd.isna(stats['Profit Factor']) or stats['Profit Factor'] < 1.3:
            return 0
        if stats['Return [%]'] < 10:
            return 0
        
        # Heavy weight on win rate
        wr = stats['Win Rate [%]']
        pf = stats['Profit Factor']
        ret = stats['Return [%]']
        dd = abs(stats['Max. Drawdown [%]'])
        
        # Score = WinRate^2 * PF * (Return/DD) 
        return (wr ** 1.5) * pf * (ret / (dd + 1))
    
    print("Running extensive grid search...")
    print("(This may take several minutes)")
    print()
    
    try:
        stats, heatmap = bt.optimize(
            # EMA Combinations
            fast_ema=[10, 15, 20, 25, 30],
            slow_ema=[200, 250, 300, 350, 400],
            
            # RSI Entry Filters (wider ranges)
            rsi_entry_max=[60, 65, 70, 75, 80],
            rsi_entry_min=[30, 35, 40, 45, 50],
            
            # Risk Management
            atr_sl_mult=[2.0, 2.5, 3.0, 3.5, 4.0],
            be_trigger_atr=[1.5, 2.0, 2.5, 3.0],
            swing_lookback=[40, 50, 60, 80],
            
            # Constraints
            constraint=lambda p: p.slow_ema > p.fast_ema * 5 and p.rsi_entry_max > p.rsi_entry_min + 15,
            
            maximize=winrate_focused_score,
            return_heatmap=True,
            max_tries=800
        )
        
        print()
        print("=" * 60)
        print("*** OPTIMIZATION COMPLETE ***")
        print("=" * 60)
        print()
        print("PERFORMANCE METRICS:")
        print("-" * 40)
        print(f"Return:        {stats['Return [%]']:.2f}%")
        print(f"Win Rate:      {stats['Win Rate [%]']:.1f}%")
        pf = stats['Profit Factor']
        print(f"Profit Factor: {pf:.2f}" if not pd.isna(pf) else "Profit Factor: N/A")
        print(f"Max Drawdown:  {stats['Max. Drawdown [%]']:.2f}%")
        print(f"Sharpe Ratio:  {stats['Sharpe Ratio']:.2f}")
        print(f"# Trades:      {stats['# Trades']}")
        
        # Detailed trade analysis
        trades = stats.get('_trades')
        if trades is not None and not trades.empty:
            wins = trades[trades['ReturnPct'] > 0]
            losses = trades[trades['ReturnPct'] <= 0]
            
            print()
            print("TRADE ANALYSIS:")
            print("-" * 40)
            print(f"Winning Trades: {len(wins)} ({len(wins)/len(trades)*100:.1f}%)")
            print(f"Losing Trades:  {len(losses)} ({len(losses)/len(trades)*100:.1f}%)")
            
            if len(wins) > 0:
                print(f"Avg Win:        +{wins['ReturnPct'].mean():.2f}%")
                print(f"Best Win:       +{wins['ReturnPct'].max():.2f}%")
            if len(losses) > 0:
                print(f"Avg Loss:       {losses['ReturnPct'].mean():.2f}%")
                print(f"Worst Loss:     {losses['ReturnPct'].min():.2f}%")
            
            print(f"Win/Loss Ratio: {abs(wins['ReturnPct'].mean() / losses['ReturnPct'].mean()):.2f}" if len(losses) > 0 and len(wins) > 0 else "")
        
        print()
        print("OPTIMAL PARAMETERS:")
        print("-" * 40)
        print(stats._strategy)
        
        # Save results
        heatmap.to_csv('results/deep_optimization_heatmap.csv')
        
        if trades is not None and not trades.empty:
            trades.to_csv('results/deep_optimization_trades.csv')
        
        # Generate plot
        bt.plot(filename='results/deep_optimization_plot.html', open_browser=False)
        print()
        print("Files saved:")
        print("  - results/deep_optimization_plot.html")
        print("  - results/deep_optimization_trades.csv")
        print("  - results/deep_optimization_heatmap.csv")
        
        return stats
        
    except Exception as e:
        print(f"Error during optimization: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == "__main__":
    deep_optimize()
