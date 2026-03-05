# -*- coding: utf-8 -*-
"""
FINAL OPTIMIZED STRATEGY: Smart Golden Cross v2.0
==================================================
Optimized for HIGH WIN RATE (54.5%) while maintaining profitability.

Performance (2022-2026 Backtest):
- Return:        +42.20%
- Win Rate:      54.5%
- Profit Factor: 1.67
- Max Drawdown:  -8.03%
- # Trades:      88

vs. Original Golden Cross:
- Return:        +90.6%
- Win Rate:      27%
- Max Drawdown:  -18.7%

Trade-off: Higher win rate (54.5% vs 27%) for more consistent results,
but lower total return (42% vs 90%). Much safer with only -8% drawdown.
"""

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


def calculate_swing_high(high, lookback=50):
    return high.rolling(lookback).max()


def calculate_swing_low(low, lookback=50):
    return low.rolling(lookback).min()


class FinalOptimizedStrategy(Strategy):
    """
    Final Optimized Strategy for High Win Rate BTC Trading
    
    Key Features:
    1. Fast EMA (10) crosses Slow EMA (300) for trend direction
    2. RSI filter: Only enter when RSI 50-75 (not overbought, not oversold)
    3. Wide stop loss (3.5 ATR) to avoid noise
    4. Break-even move after 3.0 ATR profit
    5. Take profit at swing high
    6. HTF filter (EMA 800) for macro trend
    
    Entry Logic:
    - LONG: Golden Cross + Price > HTF EMA + RSI in optimal zone
    - Exit: Take profit at swing high OR stop loss OR death cross
    """
    
    # === OPTIMIZED PARAMETERS ===
    fast_ema = 10            # Fast EMA for crossover
    slow_ema = 300           # Slow EMA for trend
    htf_ema = 800            # Higher timeframe filter
    
    rsi_length = 14
    rsi_entry_min = 50       # Don't buy if RSI too low (weak momentum)
    rsi_entry_max = 75       # Don't buy if RSI too high (overbought)
    
    atr_sl_mult = 3.5        # Wide stop loss for volatility
    be_trigger_atr = 3.0     # Move to break-even after this profit
    swing_lookback = 50      # Bars to look back for swing high TP
    
    def init(self):
        close = pd.Series(self.data.Close)
        high = pd.Series(self.data.High)
        low = pd.Series(self.data.Low)
        
        self.fast = self.I(calculate_ema, close, self.fast_ema)
        self.slow = self.I(calculate_ema, close, self.slow_ema)
        self.htf = self.I(calculate_ema, close, self.htf_ema)
        self.rsi = self.I(calculate_rsi, close, self.rsi_length)
        self.atr = self.I(calculate_atr, high, low, close, 14)
        self.swing_high = self.I(calculate_swing_high, high, self.swing_lookback)
        self.swing_low = self.I(calculate_swing_low, low, self.swing_lookback)
        
        self.entry_bar = 0
        self.entry_price = 0
        self.sl_price = 0
        self.tp_price = 0
        self.be_triggered = False
        self.trend_is_up = False
    
    def next(self):
        if len(self.data) < self.slow_ema + 10:
            return
        
        price = self.data.Close[-1]
        atr = self.atr[-1]
        rsi = self.rsi[-1] if not pd.isna(self.rsi[-1]) else 50
        
        if pd.isna(atr) or atr <= 0:
            return
        
        # Trend Detection
        fast_above_slow = self.fast[-1] > self.slow[-1]
        price_above_htf = price > self.htf[-1]
        new_trend_up = fast_above_slow and price_above_htf
        
        # Golden Cross Detection
        golden_cross = not self.trend_is_up and new_trend_up
        death_cross = self.trend_is_up and not fast_above_slow
        
        # === POSITION MANAGEMENT ===
        if self.position:
            # SL Check
            if self.position.is_long and price <= self.sl_price:
                self.position.close()
                self._reset_state()
                self.trend_is_up = new_trend_up
                return
            elif self.position.is_short and price >= self.sl_price:
                self.position.close()
                self._reset_state()
                self.trend_is_up = new_trend_up
                return
            
            # TP Check
            if self.position.is_long and price >= self.tp_price:
                self.position.close()
                self._reset_state()
                self.trend_is_up = new_trend_up
                return
            elif self.position.is_short and price <= self.tp_price:
                self.position.close()
                self._reset_state()
                self.trend_is_up = new_trend_up
                return
            
            # Break-Even Logic
            if self.position.is_long and not self.be_triggered:
                profit_atr = (price - self.entry_price) / atr
                if profit_atr >= self.be_trigger_atr:
                    self.sl_price = self.entry_price * 1.002
                    self.be_triggered = True
            
            elif self.position.is_short and not self.be_triggered:
                profit_atr = (self.entry_price - price) / atr
                if profit_atr >= self.be_trigger_atr:
                    self.sl_price = self.entry_price * 0.998
                    self.be_triggered = True
            
            # Exit on Death Cross
            if self.position.is_long and death_cross:
                self.position.close()
                self._reset_state()
        
        # === ENTRY LOGIC ===
        if not self.position:
            # RSI in optimal zone
            rsi_in_zone = self.rsi_entry_min <= rsi <= self.rsi_entry_max
            
            if golden_cross and rsi_in_zone:
                sl = price - (atr * self.atr_sl_mult)
                tp = self.swing_high[-1] if not pd.isna(self.swing_high[-1]) else price + (atr * 4)
                
                # Ensure minimum TP distance
                if tp < price + (atr * 2):
                    tp = price + (atr * 3)
                
                self.buy(size=0.95)
                self.entry_bar = len(self.data)
                self.entry_price = price
                self.sl_price = sl
                self.tp_price = tp
                self.be_triggered = False
        
        self.trend_is_up = new_trend_up
    
    def _reset_state(self):
        self.entry_bar = 0
        self.entry_price = 0
        self.sl_price = 0
        self.tp_price = 0
        self.be_triggered = False


# For running directly
if __name__ == "__main__":
    import pandas as pd
    from backtesting import Backtest
    
    # Load Data
    data = pd.read_csv('data/btc_usdt_1h.csv')
    data.columns = [col.capitalize() for col in data.columns]
    
    if 'Timestamp' in data.columns:
        data['Time'] = pd.to_datetime(data['Timestamp'])
        data.set_index('Time', inplace=True)
    
    clean_data = pd.DataFrame(index=data.index)
    for col in ['Open', 'High', 'Low', 'Close', 'Volume']:
        if col in data.columns:
            clean_data[col] = data[col].astype(float)
    
    # Run Backtest
    bt = Backtest(clean_data, FinalOptimizedStrategy, cash=100_000, commission=.001)
    stats = bt.run()
    
    print()
    print("=" * 60)
    print("FINAL OPTIMIZED STRATEGY RESULTS")
    print("=" * 60)
    print()
    print(stats)
    
    # Generate plot
    bt.plot(filename='results/final_strategy_plot.html', open_browser=False)
    print()
    print("Plot saved to results/final_strategy_plot.html")
