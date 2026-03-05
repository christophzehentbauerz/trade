# -*- coding: utf-8 -*-
"""
Research Optimizer for High Win Rate Strategy
==============================================
Finds optimal parameters to maximize win rate while keeping profitability.
"""

import pandas as pd
from backtesting import Backtest
from strategy_highwinrate import HighWinRateStrategy
import warnings
warnings.filterwarnings('ignore')


def run_optimization():
    # Load Data
    data = pd.read_csv('data/btc_usdt_1h.csv')
    
    # Standardize columns
    data.columns = [col.capitalize() for col in data.columns]
    
    if 'Timestamp' in data.columns:
        data['Time'] = pd.to_datetime(data['Timestamp'])
    elif 'Date' in data.columns:
        data['Time'] = pd.to_datetime(data['Date'])
    
    if 'Time' in data.columns:
        data.set_index('Time', inplace=True)
    
    # Create clean DataFrame
    clean_data = pd.DataFrame(index=data.index)
    cols = ['Open', 'High', 'Low', 'Close', 'Volume']
    for col in cols:
        if col in data.columns:
            clean_data[col] = data[col].astype(float)
    
    data = clean_data
    
    print("=" * 60)
    print("HIGH WIN RATE STRATEGY OPTIMIZER")
    print("=" * 60)
    print(f"Data: {len(data)} bars from {data.index[0]} to {data.index[-1]}")
    print()
    
    # Initialize Backtest
    bt = Backtest(data, HighWinRateStrategy, cash=100_000, commission=.001, trade_on_close=False)
    
    # First: Run with default params to see baseline
    print(">>> BASELINE (Default Parameters):")
    print("-" * 40)
    baseline = bt.run()
    print(f"Return:        {baseline['Return [%]']:.2f}%")
    print(f"Win Rate:      {baseline['Win Rate [%]']:.1f}%")
    print(f"Profit Factor: {baseline['Profit Factor']:.2f}")
    print(f"Max Drawdown:  {baseline['Max. Drawdown [%]']:.2f}%")
    print(f"# Trades:      {baseline['# Trades']}")
    print()
    
    # Custom scorer that heavily weights win rate
    def winrate_score(stats):
        if stats['# Trades'] < 20:
            return 0  # Need enough trades
        if stats['Win Rate [%]'] < 50:
            return 0  # Minimum 50% win rate
        if stats['Profit Factor'] < 1.2:
            return 0  # Must be profitable
        
        # Score = WinRate * sqrt(ProfitFactor) * sqrt(NumTrades/100)
        # This balances high win rate with profitability and sample size
        wr = stats['Win Rate [%]']
        pf = stats['Profit Factor']
        trades = stats['# Trades']
        
        return wr * (pf ** 0.5) * ((trades / 100) ** 0.3)
    
    print(">>> OPTIMIZATION (Searching for High Win Rate)...")
    print("-" * 40)
    
    try:
        stats, heatmap = bt.optimize(
            # Trend Filters
            trend_ema=[100, 200, 300],
            htf_ema=[400, 800],
            
            # RSI Thresholds (wider = more trades, narrower = higher quality)
            rsi_oversold=[25, 30, 35, 40],
            rsi_overbought=[60, 65, 70, 75],
            
            # ADX (higher = only strong trends)
            adx_threshold=[15, 20, 25, 30],
            
            # Risk Management (tighter = higher winrate but smaller gains)
            atr_sl_mult=[1.0, 1.5, 2.0],
            atr_tp_mult=[1.5, 2.0, 2.5, 3.0],
            
            # Time Stop
            time_stop_bars=[8, 12, 18, 24],
            
            # Constraints
            constraint=lambda p: p.atr_tp_mult >= p.atr_sl_mult,
            
            maximize=winrate_score,
            return_heatmap=True,
            max_tries=500  # Limit search space
        )
        
        print()
        print("=" * 60)
        print("*** OPTIMIZATION WINNER ***")
        print("=" * 60)
        print(f"Return:        {stats['Return [%]']:.2f}%")
        print(f"Win Rate:      {stats['Win Rate [%]']:.1f}%")
        print(f"Profit Factor: {stats['Profit Factor']:.2f}")
        print(f"Max Drawdown:  {stats['Max. Drawdown [%]']:.2f}%")
        print(f"# Trades:      {stats['# Trades']}")
        print(f"Sharpe Ratio:  {stats['Sharpe Ratio']:.2f}")
        
        print()
        print("OPTIMAL PARAMETERS:")
        print("-" * 40)
        print(stats._strategy)
        
        # Save results
        heatmap.to_csv('results/highwinrate_heatmap.csv')
        
        # Save trades
        trades = stats['_trades']
        if not trades.empty:
            trades.to_csv('results/highwinrate_trades.csv')
            
            # Win/Loss breakdown
            wins = trades[trades['ReturnPct'] > 0]
            losses = trades[trades['ReturnPct'] <= 0]
            
            print()
            print("TRADE BREAKDOWN:")
            print(f"   Wins:   {len(wins)} ({len(wins)/len(trades)*100:.1f}%)")
            print(f"   Losses: {len(losses)} ({len(losses)/len(trades)*100:.1f}%)")
            if len(wins) > 0:
                print(f"   Avg Win:  +{wins['ReturnPct'].mean():.2f}%")
            if len(losses) > 0:
                print(f"   Avg Loss: {losses['ReturnPct'].mean():.2f}%")
        
        # Generate plot
        bt.plot(filename='results/highwinrate_plot.html', open_browser=False)
        print()
        print("Plot saved to results/highwinrate_plot.html")
        
        return stats
        
    except Exception as e:
        print(f"Optimization failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def run_quick_test():
    """Quick test with default params."""
    data = pd.read_csv('data/btc_usdt_1h.csv')
    data.columns = [col.capitalize() for col in data.columns]
    
    if 'Timestamp' in data.columns:
        data['Time'] = pd.to_datetime(data['Timestamp'])
        data.set_index('Time', inplace=True)
    
    clean_data = pd.DataFrame(index=data.index)
    for col in ['Open', 'High', 'Low', 'Close', 'Volume']:
        if col in data.columns:
            clean_data[col] = data[col].astype(float)
    
    bt = Backtest(clean_data, HighWinRateStrategy, cash=100_000, commission=.001)
    stats = bt.run()
    print(stats)
    return stats


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--quick":
        run_quick_test()
    else:
        run_optimization()
