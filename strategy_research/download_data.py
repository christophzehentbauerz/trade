import ccxt
import pandas as pd
import os
from datetime import datetime

def download_data(symbol='BTC/USDT', timeframe='1h', limit=1000, since_str='2020-01-01 00:00:00'):
    print(f"Initializing download for {symbol} - {timeframe} since {since_str}...")
    exchange = ccxt.binance()
    
    # Calculate 'since' timestamp
    since = exchange.parse8601(since_str)
    
    all_candles = []
    
    while True:
        try:
            print(f"Fetching from {datetime.fromtimestamp(since/1000)}...")
            candles = exchange.fetch_ohlcv(symbol, timeframe, since, limit)
            
            if not candles:
                print("No more data received.")
                break
                
            all_candles.extend(candles)
            
            # Update 'since' to the last timestamp + 1 timeframe duration
            # Binance returns [timestamp, open, high, low, close, volume]
            last_timestamp = candles[-1][0]
            since = last_timestamp + 1 
            
            # Use specific break condition if caught up to now (approx)
            if len(candles) < limit:
                break
                
        except Exception as e:
            print(f"Error occurred: {e}")
            break

    if not all_candles:
        print("No data downloaded.")
        return

    df = pd.DataFrame(all_candles, columns=['timestamp', 'Open', 'High', 'Low', 'Close', 'Volume'])
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
    df.set_index('timestamp', inplace=True)
    
    # Save to CSV
    filename = f"BTC_USDT_{timeframe}.csv"
    df.to_csv(filename)
    print(f"Data saved to {filename}. Total rows: {len(df)}")

if __name__ == "__main__":
    download_data(since_str='2022-01-01 00:00:00')
