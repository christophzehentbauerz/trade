import requests
import pandas as pd
from datetime import datetime
import os
import time

def download_data(symbol="BTCUSDT", interval="1h", start_str="2022-01-01", output_file="data/btc_usdt_1h.csv"):
    """
    Download klines from Binance API and save to CSV.
    """
    base_url = "https://api.binance.com/api/v3/klines"
    
    # Convert start_str to timestamp (ms)
    start_ts = int(datetime.strptime(start_str, "%Y-%m-%d").timestamp() * 1000)
    end_ts = int(datetime.now().timestamp() * 1000)
    
    limit = 1000
    all_klines = []
    current_start = start_ts
    
    print(f"Downloading {symbol} {interval} data from {start_str}...")
    
    while current_start < end_ts:
        params = {
            "symbol": symbol,
            "interval": interval,
            "startTime": current_start,
            "limit": limit
        }
        
        try:
            response = requests.get(base_url, params=params)
            data = response.json()
            
            if not isinstance(data, list):
                print(f"Error: {data}")
                break
                
            if len(data) == 0:
                break
                
            all_klines.extend(data)
            
            # Update start time for next batch (last close time + 1ms)
            current_start = data[-1][6] + 1
            
            # Progress indicator
            last_date = datetime.fromtimestamp(data[-1][0]/1000).strftime('%Y-%m-%d')
            print(f"Downloaded until {last_date}", end='\r')
            
            # Respect API limits
            time.sleep(0.1)
            
        except Exception as e:
            print(f"Error downloading data: {e}")
            break
            
    print(f"\nDownload complete. Total candles: {len(all_klines)}")
    
    # Process Data
    # Binance columns: Open time, Open, High, Low, Close, Volume, Close time, ...
    cols = ['timestamp', 'open', 'high', 'low', 'close', 'volume', 'close_time', 
            'quote_asset_volume', 'number_of_trades', 'taker_buy_base_asset_volume', 
            'taker_buy_quote_asset_volume', 'ignore']
    
    df = pd.DataFrame(all_klines, columns=cols)
    
    # Clean types
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
    for col in ['open', 'high', 'low', 'close', 'volume']:
        df[col] = df[col].astype(float)
        
    # Select needed columns
    df = df[['timestamp', 'open', 'high', 'low', 'close', 'volume']]
    
    # Create directory if it doesn't exist
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    # Save
    df.to_csv(output_file, index=False)
    print(f"Data saved to {output_file}")
    
    return df

if __name__ == "__main__":
    download_data()
