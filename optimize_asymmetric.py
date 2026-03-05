# -*- coding: utf-8 -*-
"""
Optimize Asymmetric Strategy
"""

import pandas as pd
from backtesting import Backtest
from strategy_asymmetric import AsymmetricStrategy
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


def asymmetry_score(stats):
    """Score that rewards BIG winners."""
    if stats['# Trades'] < 20:
        return 0
    if pd.isna(stats['Profit Factor']) or stats['Profit Factor'] < 1.0:
        return 0
    if stats['Return [%]'] < 10:
        return 0
    
    # Reward: Return * BestTrade * ProfitFactor
    # This favors strategies with big winners
    ret = max(0, stats['Return [%]'])
    best = max(0, stats['Best Trade [%]'])
    pf = stats['Profit Factor']
    
    return ret * best * pf


def main():
    print()
    print("=" * 60)
    print("ASYMMETRIC STRATEGY OPTIMIZATION")
    print("Goal: Maximize best trades + overall return")
    print("=" * 60)
    
    data = load_data()
    print(f"Data: {len(data)} bars")
    print()
    
    bt = Backtest(data, AsymmetricStrategy, cash=100_000, commission=.001, trade_on_close=False)
    
    print("Running optimization...")
    
    stats, heatmap = bt.optimize(
        # Entry
        fast_ema=[8, 10, 15],
        rsi_entry_min=[45, 50, 55],
        rsi_entry_max=[70, 75, 80],
        
        # Initial Stop (tighter = more asymmetry potential)
        initial_sl_atr=[2.0, 2.5, 3.0],
        
        # Trailing Tiers
        trail_tier1_trigger=[2.0, 3.0, 4.0],
        trail_tier1_distance=[1.5, 2.0, 2.5],
        
        trail_tier2_trigger=[5.0, 6.0, 8.0],
        trail_tier2_distance=[2.5, 3.0, 4.0],
        
        # Time stop
        time_stop_bars=[48, 72, 96],
        
        # Constraints
        constraint=lambda p: (
            p.trail_tier2_trigger > p.trail_tier1_trigger and
            p.trail_tier2_distance > p.trail_tier1_distance
        ),
        
        maximize=asymmetry_score,
        return_heatmap=True,
        max_tries=500
    )
    
    print()
    print("=" * 60)
    print("*** OPTIMIZED ASYMMETRIC STRATEGY ***")
    print("=" * 60)
    print()
    print(f"Return:        {stats['Return [%]']:.2f}%")
    print(f"Win Rate:      {stats['Win Rate [%]']:.1f}%")
    pf = stats['Profit Factor']
    print(f"Profit Factor: {pf:.2f}" if not pd.isna(pf) else "Profit Factor: N/A")
    print(f"Max Drawdown:  {stats['Max. Drawdown [%]']:.2f}%")
    print(f"# Trades:      {stats['# Trades']}")
    print(f"Best Trade:    {stats['Best Trade [%]']:.2f}%")
    print(f"Avg Trade:     {stats['Avg. Trade [%]']:.2f}%")
    
    print()
    print("OPTIMAL PARAMETERS:")
    print("-" * 40)
    print(stats._strategy)
    
    # Trade analysis
    trades = stats.get('_trades')
    if trades is not None and not trades.empty:
        wins = trades[trades['ReturnPct'] > 0]
        
        print()
        print("TOP 10 WINNERS:")
        print("-" * 40)
        top_wins = wins.nlargest(10, 'ReturnPct')
        for _, t in top_wins.iterrows():
            print(f"  {t['EntryTime'].strftime('%Y-%m-%d')} | +{t['ReturnPct']*100:.2f}% | {t['Duration']}")
        
        # Distribution
        huge_wins = len(wins[wins['ReturnPct'] > 0.10])  # >10%
        big_wins = len(wins[(wins['ReturnPct'] > 0.05) & (wins['ReturnPct'] <= 0.10)])  # 5-10%
        medium_wins = len(wins[(wins['ReturnPct'] > 0.02) & (wins['ReturnPct'] <= 0.05)])  # 2-5%
        
        print()
        print("WIN DISTRIBUTION:")
        print(f"  Huge (>10%):   {huge_wins} trades")
        print(f"  Big (5-10%):   {big_wins} trades")
        print(f"  Medium (2-5%): {medium_wins} trades")
        
        trades.to_csv('results/asymmetric_trades.csv')
    
    heatmap.to_csv('results/asymmetric_heatmap.csv')
    bt.plot(filename='results/asymmetric_optimized_plot.html', open_browser=False)
    
    print()
    print("Files saved.")
    
    return stats


if __name__ == "__main__":
    main()
