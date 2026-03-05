from backtesting import Strategy
import pandas as pd
import numpy as np

# --- Helper Functions ---

def calculate_ema(series, length):
    return series.ewm(span=length, adjust=False).mean()

def calculate_atr(high, low, close, length=14):
    high_low = high - low
    high_close = np.abs(high - close.shift())
    low_close = np.abs(low - close.shift())
    
    ranges = pd.concat([high_low, high_close, low_close], axis=1)
    true_range = np.max(ranges, axis=1)
    # Wilder's Smoothing
    atr = pd.Series(true_range).ewm(alpha=1/length, adjust=False).mean()
    return atr

def calculate_supertrend(high, low, close, length=10, multiplier=3.0):
    atr = calculate_atr(high, low, close, length)
    hl2 = (high + low) / 2
    
    # Basic Bands
    upper_basic = hl2 + (multiplier * atr)
    lower_basic = hl2 - (multiplier * atr)
    
    # Final Bands
    upper_final = pd.Series(index=high.index, dtype='float64')
    lower_final = pd.Series(index=high.index, dtype='float64')
    
    # Trend Direction: True=Bull, False=Bear
    # Initialize with first valid value
    trend = pd.Series(index=high.index, dtype='bool')
    trend.iloc[:length] = True # Default
    
    # Recursive Calculation (slow in python loop, but essential for SuperTrend)
    # Optimized vector-like approach is hard for SuperTrend state.
    # We will use a simplified loop for accuracy.
    
    # Pre-fill arrays for speed
    c_arr = close.values
    ub_arr = upper_basic.values
    lb_arr = lower_basic.values
    
    uf_arr = np.zeros_like(c_arr)
    lf_arr = np.zeros_like(c_arr)
    tr_arr = np.zeros_like(c_arr, dtype=bool) # 1=Bull, 0=Bear
    
    # Init
    uf_arr[:] = np.nan
    lf_arr[:] = np.nan
    
    # Iterate
    # Warning: Loop is slow, but length is 30k candles. Should be < 1 sec.
    prev_close = c_arr[0]
    prev_uf = ub_arr[0]
    prev_lf = lb_arr[0]
    prev_trend = True
    
    for i in range(1, len(c_arr)):
        curr_close = c_arr[i]
        curr_ub_basic = ub_arr[i]
        curr_lb_basic = lb_arr[i]
        
        # Upper Band Logic
        if curr_ub_basic < prev_uf or prev_close > prev_uf:
            curr_uf = curr_ub_basic
        else:
            curr_uf = prev_uf
            
        # Lower Band Logic
        if curr_lb_basic > prev_lf or prev_close < prev_lf:
            curr_lf = curr_lb_basic
        else:
            curr_lf = prev_lf
            
        # Trend Switch Logic
        if prev_trend: # Currently Bull
            if curr_close < prev_lf:
                curr_trend = False # Flip to Bear
            else:
                curr_trend = True
        else: # Currently Bear
            if curr_close > prev_uf:
                curr_trend = True # Flip to Bull
            else:
                curr_trend = False
                
        # Store
        uf_arr[i] = curr_uf
        lf_arr[i] = curr_lf
        tr_arr[i] = curr_trend
        
        # Update Prev
        prev_close = curr_close
        prev_uf = curr_uf
        prev_lf = curr_lf
        prev_trend = curr_trend
        
    return pd.Series(tr_arr, index=high.index), pd.Series(uf_arr, index=high.index), pd.Series(lf_arr, index=high.index)


class SuperTrendStrategy(Strategy):
    # Parameters to Optimize
    ema_length = 200
    st_length = 12       # SuperTrend Length
    st_multiplier = 3.0  # SuperTrend Multiplier
    risk_per_trade = 1.0 # 1 BTC (Fixed Size)
    
    # Optional TP/SL on top of trend (Trend typically exits on reversal)
    # But adding a Take Profit can smooth equity
    use_tp = False
    tp_atr_mult = 4.0

    def init(self):
        close = pd.Series(self.data.Close)
        high = pd.Series(self.data.High)
        low = pd.Series(self.data.Low)
        
        # Indicators
        self.ema = self.I(calculate_ema, close, self.ema_length)
        
        # SuperTrend (We need to unpack the tuple result in Backtesting.py properly)
        # self.I stores the *result*, so if function returns specific type, we handle it
        # But self.I expects an array mostly. Let's wrap it to return just the Trend bool for plotting logic usage if needed
        # Or calculate inside init without self.I for the complex tuple, then self.I individual parts.
        
        trend, upper, lower = calculate_supertrend(high, low, close, self.st_length, self.st_multiplier)
        
        self.st_trend = self.I(lambda x: x, trend.astype(int), name="SuperTrend_Trend") # Plot as 0/1
        self.st_upper = self.I(lambda x: x, upper, name="SuperTrend_Upper")
        self.st_lower = self.I(lambda x: x, lower, name="SuperTrend_Lower")
        
        self.atr = self.I(calculate_atr, high, low, close, 14)

    def next(self):
        # Current values
        trend_bull = self.st_trend[-1] == 1
        close = self.data.Close[-1]
        ema = self.ema[-1]
        
        # --- ENTRY LOGIC ---
        
        # LONG: SuperTrend is Bullish AND Price > EMA 200 (Momentum + Trend Alignment)
        if trend_bull and close > ema:
            if not self.position.is_long:
                if self.position.is_short:
                    self.position.close()
                self.buy(size=self.risk_per_trade)
                
        # SHORT: SuperTrend is Bearish AND Price < EMA 200
        elif not trend_bull and close < ema:
            if not self.position.is_short:
                if self.position.is_long:
                    self.position.close()
                self.sell(size=self.risk_per_trade)
        
        # --- EXIT LOGIC (Trend Flip) ---
        # If we are Long but trend turns Bearish -> Close
        if self.position.is_long and not trend_bull:
            self.position.close()
            
        # If we are Short but trend turns Bullish -> Close
        if self.position.is_short and trend_bull:
            self.position.close()
