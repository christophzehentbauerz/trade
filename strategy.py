from backtesting import Strategy
import pandas as pd
import numpy as np

# --- Helper Functions for Indicators (replacing pandas_ta) ---

def calculate_ema(series, length):
    return series.ewm(span=length, adjust=False).mean()

def calculate_atr(high, low, close, length=14):
    high_low = high - low
    high_close = np.abs(high - close.shift())
    low_close = np.abs(low - close.shift())
    
    ranges = pd.concat([high_low, high_close, low_close], axis=1)
    true_range = np.max(ranges, axis=1)
    
    # Wilder's Smoothing for ATR
    # ATR = (Prev ATR * (n-1) + TR) / n
    # This is equivalent to EWM with alpha=1/n
    atr = pd.Series(true_range).ewm(alpha=1/length, adjust=False).mean()
    return atr

class SmartMoneyStrategy(Strategy):
    # Parameters
    swing_length = 10
    regime_buffer = 0.01  # 1%
    tp_atr_mult = 2.5
    sl_atr_mult = 0.2     # Buffer for SL
    risk_per_trade = 1.0  # 1 BTC

    def init(self):
        # Indicators
        close = pd.Series(self.data.Close)
        high = pd.Series(self.data.High)
        low = pd.Series(self.data.Low)
        
        # EMA
        self.ema50 = self.I(calculate_ema, close, 50)
        self.ema200 = self.I(calculate_ema, close, 200)
        
        # ATR
        self.atr = self.I(calculate_atr, high, low, close, 14)

        # State for Swings
        self.last_swing_high = None # Price
        self.last_swing_low = None  # Price
        self.last_swing_high_idx = -1
        self.last_swing_low_idx = -1
        
    def next(self):
        # Index Logic
        # We need at least 2 * swing_length + 1 bars to detect a swing completely if we were looking at history
        # But here valid detection:
        # A swing high at index `i` is confirmed at index `i + swing_length`
        # So at `self.data.index[-1]` (current bar), we check if `current - swing_length` was a swing.
        
        i = len(self.data) - 1
        x = self.swing_length
        
        if i < x * 2 + 1:
            return

        # --- Update Swings ---
        # Current confirmation index (the pivot was x bars ago)
        pivot_idx = i - x
        
        # We need to access data arrays directly for speed/indexing
        highs = self.data.High
        lows = self.data.Low
        
        # Pivot detection
        potential_high = highs[pivot_idx]
        potential_low = lows[pivot_idx]
        
        # Ranges around pivot
        # Left: [pivot-x, pivot-1] -> python slice [pivot-x : pivot]
        # Right: [pivot+1, pivot+x] -> python slice [pivot+1 : pivot+x+1]
        
        # Check High Pivot
        left_highs = highs[pivot_idx-x : pivot_idx]
        right_highs = highs[pivot_idx+1 : pivot_idx+x+1] # Confirm FULL swing structure
        
        # Note: In `next`, we are at index `i`.
        # `i` corresponds to `pivot + x`.
        # So `right_highs` goes up to index `i`.
        
        if len(left_highs) == x and len(right_highs) == x:
            if potential_high > np.max(left_highs) and potential_high > np.max(right_highs):
                self.last_swing_high = potential_high
                self.last_swing_high_idx = pivot_idx

        # Check Low Pivot
        left_lows = lows[pivot_idx-x : pivot_idx]
        right_lows = lows[pivot_idx+1 : pivot_idx+x+1]
        
        if len(left_lows) == x and len(right_lows) == x:
            if potential_low < np.min(left_lows) and potential_low < np.min(right_lows):
                self.last_swing_low = potential_low
                self.last_swing_low_idx = pivot_idx

        # --- Regime Detection ---
        ema50 = self.ema50[-1]
        ema200 = self.ema200[-1]
        close = self.data.Close[-1]
        open_ = self.data.Open[-1]
        
        bull_regime = (ema50 > ema200 * (1 + self.regime_buffer)) and (close > ema50)
        bear_regime = (ema50 < ema200 * (1 - self.regime_buffer)) and (close < ema50)
        
        # Close positions if regime changes
        if self.position.is_long and not bull_regime:
            self.position.close()
            return
        if self.position.is_short and not bear_regime:
            self.position.close()
            return
            
        if self.position:
            return # Only one position at a time
            
        # --- Entry Signals ---
        
        # We need defined swings
        if self.last_swing_high is None or self.last_swing_low is None:
            return

        atr = self.atr[-1]
        
        # BULL SETUPS
        if bull_regime:
            # Signal 1: Liquidity Sweep (Long)
            range_ = self.data.High[-1] - self.data.Low[-1]
            bottom_wick = min(open_, close) - self.data.Low[-1]
            
            is_sweep_long = (
                self.data.Low[-1] < self.last_swing_low and
                close > self.last_swing_low and
                close > open_ and
                (bottom_wick / range_ > 0.3 if range_ > 0 else False)
            )
            
            # Signal 2: BOS (Long)
            is_bos_long = (
                close > self.last_swing_high and
                self.data.Close[-2] <= self.last_swing_high
            )
            
            if is_sweep_long or is_bos_long:
                sl_price = self.last_swing_low - (self.sl_atr_mult * atr)
                tp_price = close + (self.tp_atr_mult * atr)
                
                if sl_price < close:
                    self.buy(sl=sl_price, tp=tp_price, size=self.risk_per_trade)

        # BEAR SETUPS
        elif bear_regime:
            # Signal 1: Liquidity Sweep (Short)
            range_ = self.data.High[-1] - self.data.Low[-1]
            top_wick = self.data.High[-1] - max(open_, close)
            
            is_sweep_short = (
                self.data.High[-1] > self.last_swing_high and
                close < self.last_swing_high and
                close < open_ and
                (top_wick / range_ > 0.3 if range_ > 0 else False)
            )
            
            # Signal 2: BOS (Short)
            is_bos_short = (
                close < self.last_swing_low and
                self.data.Close[-2] >= self.last_swing_low
            )
            
            if is_sweep_short or is_bos_short:
                sl_price = self.last_swing_high + (self.sl_atr_mult * atr)
                tp_price = close - (self.tp_atr_mult * atr)
                
                if sl_price > close:
                    self.sell(sl=sl_price, tp=tp_price, size=self.risk_per_trade)
