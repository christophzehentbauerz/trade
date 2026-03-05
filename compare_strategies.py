# -*- coding: utf-8 -*-
"""
Multi-Strategy Optimizer
========================
Tests multiple strategy approaches to find the best one for high win rate.
"""

import pandas as pd
from backtesting import Backtest
from strategy_momentum_pullback import MomentumPullbackStrategy, SmartGoldenCrossStrategy
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


def test_strategy(name, strategy_class, data, optimize=False):
    print()
    print("=" * 60)
    print(f"TESTING: {name}")
    print("=" * 60)
    
    bt = Backtest(data, strategy_class, cash=100_000, commission=.001, trade_on_close=False)
    
    if not optimize:
        stats = bt.run()
    else:
        # Run optimization
        print("Running optimization...")
        
        def score(s):
            if s['# Trades'] < 15: return 0
            if s['Win Rate [%]'] < 45: return 0
            if pd.isna(s['Profit Factor']) or s['Profit Factor'] < 1.0: return 0
            
            # Score balances win rate, profit factor, and return
            return s['Win Rate [%]'] * s['Profit Factor'] * max(0, s['Return [%]'] / 100 + 1)
        
        if strategy_class == MomentumPullbackStrategy:
            stats, _ = bt.optimize(
                trend_ema=[100, 200, 300],
                pullback_ema=[30, 50, 80],
                rsi_pullback_low=[30, 40, 50],
                rsi_turn_up=[40, 45, 50],
                atr_sl_mult=[1.5, 2.0, 2.5],
                trailing_start=[1.0, 1.5, 2.0],
                swing_lookback=[20, 30, 50],
                constraint=lambda p: p.trend_ema > p.pullback_ema,
                maximize=score,
                return_heatmap=True,
                max_tries=300
            )
        else:
            stats, _ = bt.optimize(
                fast_ema=[15, 20, 30],
                slow_ema=[100, 200, 300],
                rsi_entry_max=[65, 70, 75],
                rsi_entry_min=[35, 40, 45],
                atr_sl_mult=[2.0, 2.5, 3.0],
                be_trigger_atr=[1.5, 2.0, 2.5],
                swing_lookback=[30, 40, 60],
                constraint=lambda p: p.slow_ema > p.fast_ema,
                maximize=score,
                return_heatmap=True,
                max_tries=300
            )
    
    print()
    print("RESULTS:")
    print("-" * 40)
    print(f"Return:        {stats['Return [%]']:.2f}%")
    print(f"Win Rate:      {stats['Win Rate [%]']:.1f}%")
    pf = stats['Profit Factor']
    print(f"Profit Factor: {pf:.2f}" if not pd.isna(pf) else "Profit Factor: N/A")
    print(f"Max Drawdown:  {stats['Max. Drawdown [%]']:.2f}%")
    print(f"# Trades:      {stats['# Trades']}")
    
    if optimize:
        print()
        print("OPTIMAL PARAMETERS:")
        print(stats._strategy)
    
    return stats, bt


def main():
    print()
    print("*" * 60)
    print("* MULTI-STRATEGY COMPARISON")
    print("*" * 60)
    
    data = load_data()
    print(f"Data: {len(data)} bars from {data.index[0]} to {data.index[-1]}")
    
    results = []
    
    # Test 1: Momentum Pullback Default
    stats1, bt1 = test_strategy("Momentum Pullback (Default)", MomentumPullbackStrategy, data, optimize=False)
    results.append(("Momentum Pullback Default", stats1))
    
    # Test 2: Smart Golden Cross Default
    stats2, bt2 = test_strategy("Smart Golden Cross (Default)", SmartGoldenCrossStrategy, data, optimize=False)
    results.append(("Smart Golden Cross Default", stats2))
    
    # Test 3: Momentum Pullback Optimized
    stats3, bt3 = test_strategy("Momentum Pullback (Optimized)", MomentumPullbackStrategy, data, optimize=True)
    results.append(("Momentum Pullback Optimized", stats3))
    
    # Test 4: Smart Golden Cross Optimized
    stats4, bt4 = test_strategy("Smart Golden Cross (Optimized)", SmartGoldenCrossStrategy, data, optimize=True)
    results.append(("Smart Golden Cross Optimized", stats4))
    
    # Summary
    print()
    print("=" * 60)
    print("*** SUMMARY ***")
    print("=" * 60)
    print(f"{'Strategy':<35} {'Return':>8} {'WinRate':>8} {'PF':>6} {'Trades':>7}")
    print("-" * 60)
    
    best = None
    best_score = 0
    
    for name, s in results:
        ret = s['Return [%]']
        wr = s['Win Rate [%]']
        pf = s['Profit Factor'] if not pd.isna(s['Profit Factor']) else 0
        trades = s['# Trades']
        
        print(f"{name:<35} {ret:>7.1f}% {wr:>7.1f}% {pf:>5.2f} {trades:>7}")
        
        score = wr * pf if pf > 1 and wr > 40 else 0
        if score > best_score:
            best_score = score
            best = (name, s)
    
    if best:
        print()
        print(f"BEST STRATEGY: {best[0]}")
        
        # Save plot for best
        bt = None
        if "Momentum" in best[0]:
            bt = bt3 if "Optimized" in best[0] else bt1
        else:
            bt = bt4 if "Optimized" in best[0] else bt2
        
        bt.plot(filename='results/best_strategy_plot.html', open_browser=False)
        print("Plot saved to results/best_strategy_plot.html")
        
        # Save trades
        trades = best[1].get('_trades')
        if trades is not None and not trades.empty:
            trades.to_csv('results/best_strategy_trades.csv')
            print("Trades saved to results/best_strategy_trades.csv")


if __name__ == "__main__":
    main()
