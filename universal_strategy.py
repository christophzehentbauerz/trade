from backtesting import Strategy
from backtesting.lib import crossover
import pandas as pd

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

class UniversalStrategy(Strategy):
    # --- Optimization Parameters ---
    
    # 1. Logic Type
    # 0 = Breakout (Golden Cross)
    # 1 = Pullback (Dip Hunter)
    strategy_mode = 1 
    
    # 2. Trend Filter (Global)
    use_htf_filter = True
    htf_period = 4800 # Daily 200
    
    # 3. Indicator Params
    ema_fast = 20
    ema_slow = 300
    rsi_period = 14
    
    # 4. Entry Triggers
    # For Breakout: RSI > breakout_rsi (e.g. 60)
    # For Pullback: RSI < pullback_rsi (e.g. 40)
    breakout_rsi = 60
    pullback_rsi = 40
    
    # 5. Exit Triggers
    # For Pullback: Exit when RSI > pullback_exit_rsi (e.g. 70)
    pullback_exit_rsi = 70
    
    # 6. Risk Management
    time_stop_bars = 24
    atr_mult_sl = 3.0 # Stop Loss distance
    
    def init(self):
        close = pd.Series(self.data.Close)
        high = pd.Series(self.data.High)
        low = pd.Series(self.data.Low)
        
        # Core Indicators
        self.fast = self.I(calculate_ema, close, self.ema_fast)
        self.slow = self.I(calculate_ema, close, self.ema_slow)
        self.rsi = self.I(calculate_rsi, close, self.rsi_period)
        self.htf = self.I(calculate_ema, close, self.htf_period)
        self.atr = self.I(calculate_atr, high, low, close, 14)
        
        self.entry_bar = 0
        self.entry_price = 0
        self.sl_price = 0

    def next(self):
        price = self.data.Close[-1]
        atr = self.atr[-1]
        
        # 0. Global Trend Check
        bull_trend = price > self.htf[-1]
        bear_trend = price < self.htf[-1]
        
        # 1. Position Management
        if self.position:
            # SL Check
            if self.position.is_long and price < self.sl_price:
                self.position.close()
                return
            elif self.position.is_short and price > self.sl_price:
                self.position.close()
                return

            # Time Stop
            bars_held = len(self.data) - self.entry_bar
            if bars_held > self.time_stop_bars and self.position.pl_pct < 0.001:
                self.position.close()
                return

            # Exit Logic - PULLBACK MODE specific
            if self.strategy_mode == 1:
                if self.position.is_long and self.rsi[-1] > self.pullback_exit_rsi:
                    self.position.close() # Take profit on RSI spike
                elif self.position.is_short and self.rsi[-1] < (100 - self.pullback_exit_rsi):
                    self.position.close()

            # Exit Logic - BREAKOUT MODE (Stop and Reverse handles it, or Cross back)
            if self.strategy_mode == 0:
                if self.position.is_long and crossover(self.slow, self.fast):
                    self.position.close()
                elif self.position.is_short and crossover(self.fast, self.slow):
                    self.position.close()

        # 2. Entry Logic
        if not self.position:
            # --- MODE 0: BREAKOUT (Golden Cross) ---
            if self.strategy_mode == 0:
                if crossover(self.fast, self.slow) and self.rsi[-1] > self.breakout_rsi:
                    if bull_trend:
                        self.buy()
                        self.entry_bar = len(self.data)
                        self.sl_price = price - (atr * self.atr_mult_sl)
                
                elif crossover(self.slow, self.fast):
                    if bear_trend:
                        self.sell()
                        self.entry_bar = len(self.data)
                        self.sl_price = price + (atr * self.atr_mult_sl)

            # --- MODE 1: PULLBACK (Dip Hunter) ---
            # Idea: Bull Trend exists, but Price Dips (RSI Low). Buy the dip.
            elif self.strategy_mode == 1:
                if bull_trend and self.rsi[-1] < self.pullback_rsi:
                    # Buy Dip
                    self.buy()
                    self.entry_bar = len(self.data)
                    self.sl_price = price - (atr * self.atr_mult_sl)
                
                elif bear_trend and self.rsi[-1] > (100 - self.pullback_rsi):
                    # Sell Rally
                    self.sell()
                    self.entry_bar = len(self.data)
                    self.sl_price = price + (atr * self.atr_mult_sl)
