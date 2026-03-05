import pandas as pd
from backtesting import Backtest
from universal_strategy import UniversalStrategy

def run_research():
    # Load Data
    data = pd.read_csv('data/btc_usdt_1h.csv')
    
    # Capitalize columns first (Open, High, Low, Close, Volume)
    data.columns = [col.capitalize() for col in data.columns]
    
    # If 'Timestamp' or 'Date' exists, make it index
    if 'Timestamp' in data.columns:
        data['Time'] = pd.to_datetime(data['Timestamp'])
    elif 'Date' in data.columns:
        data['Time'] = pd.to_datetime(data['Date'])
    
    if 'Time' in data.columns:
         data.set_index('Time', inplace=True)
    
    # Create a fresh Clean DataFrame to ensure no hidden object dtypes
    clean_data = pd.DataFrame(index=data.index)
    cols = ['Open', 'High', 'Low', 'Close', 'Volume']
    for col in cols:
        if col in data.columns:
            clean_data[col] = data[col].astype(float)
    
    data = clean_data
    
    # Initialize Backtest
    bt = Backtest(data, UniversalStrategy, cash=100_000, commission=.001, trade_on_close=False)
    
    print("Running Deep Optimization... (This may take time)")
    print("Searching for: WinRate > 60%, PF > 2.0")
    
    # Custom Scorer to enforce "Holy Grail" constraints
    def holy_grail_score(stats):
        # Constraints
        if stats['# Trades'] < 30: return 0
        if stats['Win Rate [%]'] < 60: return 0
        if stats['Profit Factor'] < 1.5: return 0
        
        # Score = Return * PF (Favor high return and high efficiency)
        return stats['Return [%]'] * stats['Profit Factor']

    stats, heatmap = bt.optimize(
        # 1. Strategy Mode
        strategy_mode=[0, 1], # 0=Breakout, 1=Pullback
        
        # 2. Indicators
        ema_fast=[10, 20, 30],
        ema_slow=[200, 300, 400],
        
        # 3. Triggers
        breakout_rsi=[60, 70],
        pullback_rsi=[30, 40], # Buy when RSI < 30/40
        pullback_exit_rsi=[60, 70],
        
        # 4. Risk
        atr_mult_sl=[2.0, 3.0, 4.0],
        time_stop_bars=[12, 24, 48],
        
        # Constraints (Only Check Params here)
        constraint=lambda p: p.ema_fast < p.ema_slow,
        
        # Maximize: Custom Score
        maximize=holy_grail_score,
        return_heatmap=True
    )
    
    print("\n--- OPTIMIZATION WINNER ---")
    print(stats)
    print("\n--- PARAMETERS ---")
    print(stats._strategy)
    
    # Save Heatmap
    heatmap.to_csv('results/research_heatmap.csv')
    print("\nHeatmap saved to results/research_heatmap.csv")

if __name__ == "__main__":
    run_research()
