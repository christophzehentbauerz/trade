import pandas as pd
from backtesting import Backtest
from strategy_gc import GoldenCrossStrategy
from data_loader import download_data
import os
import argparse
import multiprocessing
import backtesting
# backtesting.set_verbose(False) # invalid
backtesting.Pool = multiprocessing.Pool # Enable multi-core optimization

def load_or_fetch_data(filepath="data/btc_usdt_1h.csv"):
    if not os.path.exists(filepath):
        print("Data file not found. Downloading...")
        df = download_data(output_file=filepath)
    else:
        print(f"Loading data from {filepath}...")
        df = pd.read_csv(filepath)
        
    # Standardize columns (Backtesting.py requires Capitalized)
    if 'timestamp' in df.columns:
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df.set_index('timestamp', inplace=True)
    
    df.rename(columns={
        'open': 'Open',
        'high': 'High',
        'low': 'Low',
        'close': 'Close',
        'volume': 'Volume'
    }, inplace=True)
            
    return df

def run_backtest(args):
    data = load_or_fetch_data()
    
    # Filter by date if needed
    if args.year:
        data = data[data.index.year == int(args.year)]
        print(f"Filtered for year {args.year}")

    print("Running Golden Cross Trend Strategy...")
    bt = Backtest(data, GoldenCrossStrategy, cash=100_000, commission=.001, trade_on_close=False)
    
    if args.optimize:
        print("Optimizing parameters for PF > 1.5...")
        stats, heatmap = bt.optimize(
            fast_length=[10, 20, 30],
            slow_length=[200, 300, 400],
            time_stop_bars=[12, 24, 48],
            sl_be_trigger=[1.0, 1.5, 2.0], # Trailing Stop Params
            constraint=lambda p: p.fast_length < p.slow_length,
            maximize='Profit Factor',
            return_heatmap=True
        )
        print("\n--- Optimization Results ---")
        print(stats)
        print("\nTop Parameters:")
        print(stats._strategy)
        
        # Save Heatmap
        heatmap.to_csv("results/optimization_heatmap.csv")
        print("Optimization heatmap saved to results/optimization_heatmap.csv")
        
    else:
        print("Running Backtest with default parameters...")
        stats = bt.run()
        print(stats)
        
        # Custom breakdown
        trades = stats['_trades']
        if not trades.empty:
            trades.to_csv("results/trades.csv")
            print("Trades saved to results/trades.csv")
            
    # Plot
    if args.plot:
        filename = "results/backtest_plot.html"
        bt.plot(filename=filename, open_browser=False)
        print(f"Plot saved to {filename}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BTC Smart Money Backtester")
    parser.add_argument("--optimize", action="store_true", help="Run optimization grid search")
    parser.add_argument("--plot", action="store_true", help="Generate HTML plot")
    parser.add_argument("--year", type=int, help="Filter by specific year")
    
    args = parser.parse_args()
    
    os.makedirs("results", exist_ok=True)
    run_backtest(args)
