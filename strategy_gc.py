from backtesting import Strategy
from backtesting.lib import crossover
import pandas as pd
# import pandas_ta as ta # Removed
# I will implement RSI manually to stay safe.

def calculate_ema(series, length):
    return series.ewm(span=length, adjust=False).mean()

def calculate_rsi(close, length=14):
    delta = close.diff()
    gain = (delta.where(delta > 0, 0)).ewm(alpha=1/length, adjust=False).mean()
    loss = (-delta.where(delta < 0, 0)).ewm(alpha=1/length, adjust=False).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))

def calculate_atr(high, low, close, length=14):
    high_low = high - low
    high_close = (high - close.shift()).abs()
    low_close = (low - close.shift()).abs()
    ranges = pd.concat([high_low, high_close, low_close], axis=1)
    true_range = ranges.max(axis=1)
    return true_range.rolling(length).mean()


class GoldenCrossStrategy(Strategy):
    # Parameters to Optimize
    fast_length = 20
    slow_length = 300
    rsi_threshold = 60
    
    # Balanced "Sweet Spot" Parameters
    use_htf_filter = True
    htf_ema_period = 4800
    # Balanced "Sweet Spot" Parameters
    use_htf_filter = True
    htf_ema_period = 4800
    time_stop_bars = 18 
    short_size = 0.5
    atr_period = 14
    atr_multiplier = 5.0 # Wide Safety Net
    sl_be_trigger = 3.0 # Break Even at 3 ATR
    
    def init(self):
        close = pd.Series(self.data.Close)
        high = pd.Series(self.data.High)
        low = pd.Series(self.data.Low)
        
        # Indicators
        self.fast_ema = self.I(calculate_ema, close, self.fast_length)
        self.slow_ema = self.I(calculate_ema, close, self.slow_length)
        self.rsi = self.I(calculate_rsi, close, 14)
        
        # HTF Filter
        self.htf_ema = self.I(calculate_ema, close, self.htf_ema_period)
        
        # ATR
        self.atr = self.I(calculate_atr, high, low, close, self.atr_period)
        
        self.entry_bar = 0
        self.entry_price = 0
        self.sl_price = 0

    def next(self):
        price = self.data.Close[-1]
        atr = self.atr[-1]
        
        # 1. Manage Position
        if self.position:
            # Trailing Stop Logic (Simple & Wide)
            if self.position.is_long:
                new_sl = price - (atr * self.atr_multiplier)
                # Break Even Logic
                if price > self.entry_price + (atr * self.sl_be_trigger):
                    new_sl = max(new_sl, self.entry_price * 1.001)
                
                self.sl_price = max(self.sl_price, new_sl)
                if price < self.sl_price:
                    self.position.close()
                    return

            elif self.position.is_short:
                new_sl = price + (atr * self.atr_multiplier)
                if price < self.entry_price - (atr * self.sl_be_trigger):
                    new_sl = min(new_sl, self.entry_price * 0.999)
                
                if self.sl_price == 0: self.sl_price = new_sl
                else: self.sl_price = min(self.sl_price, new_sl)
                
                if price > self.sl_price:
                    self.position.close()
                    return

            # Time Stop
            bars_held = len(self.data) - self.entry_bar
            if bars_held >= self.time_stop_bars and self.position.pl_pct < 0.002:
                self.position.close()
                return

        # 2. Entry Logic
        bull_trend = price > self.htf_ema[-1]
        bear_trend = price < self.htf_ema[-1]
        
        # LONG
        if crossover(self.fast_ema, self.slow_ema) and self.rsi[-1] > self.rsi_threshold:
            if not self.use_htf_filter or bull_trend:
                if self.position.is_short: self.position.close()
                self.buy(size=0.99)
                self.entry_bar = len(self.data)
                self.entry_price = price
                self.sl_price = price - (atr * self.atr_multiplier)

        # SHORT
        elif crossover(self.slow_ema, self.fast_ema):
            if not self.use_htf_filter or bear_trend:
                if self.position.is_long: self.position.close()
                self.sell(size=self.short_size)
                self.entry_bar = len(self.data)
                self.entry_price = price
                self.sl_price = price + (atr * self.atr_multiplier)
