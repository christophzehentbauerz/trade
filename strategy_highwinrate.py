"""
High Win Rate BTC Strategy v2.0
===============================
Goal: Achieve >60% win rate while maintaining profitability.

Key Improvements:
1. Multi-Confirmation Entry (EMA + RSI + Volume + Momentum)
2. Mean Reversion + Trend Hybrid Approach
3. Partial Take Profit Exits
4. Tighter Risk Management
5. Avoid Choppy Market Detection
"""

from backtesting import Strategy
from backtesting.lib import crossover
import pandas as pd
import numpy as np


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


def calculate_adx(high, low, close, length=14):
    """Calculate ADX for trend strength detection."""
    tr = calculate_atr(high, low, close, 1) * 1  # True Range (no averaging)
    
    plus_dm = high.diff()
    minus_dm = -low.diff()
    
    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0)
    minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0)
    
    # Smoothed values
    atr = tr.ewm(span=length, adjust=False).mean()
    plus_di = 100 * (plus_dm.ewm(span=length, adjust=False).mean() / atr)
    minus_di = 100 * (minus_dm.ewm(span=length, adjust=False).mean() / atr)
    
    dx = 100 * (abs(plus_di - minus_di) / (plus_di + minus_di + 0.0001))
    adx = dx.ewm(span=length, adjust=False).mean()
    
    return adx


def calculate_bollinger_bands(close, length=20, std_dev=2.0):
    """Calculate Bollinger Bands for mean reversion."""
    sma = close.rolling(length).mean()
    std = close.rolling(length).std()
    upper = sma + (std * std_dev)
    lower = sma - (std * std_dev)
    return sma, upper, lower


def calculate_macd(close, fast=12, slow=26, signal=9):
    """MACD for momentum confirmation."""
    fast_ema = close.ewm(span=fast, adjust=False).mean()
    slow_ema = close.ewm(span=slow, adjust=False).mean()
    macd_line = fast_ema - slow_ema
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def calculate_volume_sma(volume, length=20):
    """Volume moving average for volume confirmation."""
    return volume.rolling(length).mean()


class HighWinRateStrategy(Strategy):
    """
    High Win Rate Strategy focusing on quality over quantity.
    
    Core Logic:
    - Only enter when multiple confirmations align
    - Use mean reversion for precise entries 
    - Use trend filter for direction bias
    - Quick partial profits to lock in wins
    """
    
    # === OPTIMIZATION PARAMETERS ===
    
    # Trend Filter
    trend_ema = 200          # Primary trend filter
    htf_ema = 800            # Higher timeframe trend (approx daily for 1H)
    
    # Entry Triggers
    rsi_oversold = 35        # Buy zone for mean reversion
    rsi_overbought = 65      # Sell zone for mean reversion
    rsi_length = 14
    
    # Bollinger Bands
    bb_length = 20
    bb_std = 2.0
    
    # Volume Filter
    volume_mult = 1.2        # Require 1.2x average volume
    
    # ADX - Trend Strength
    adx_threshold = 20       # Minimum trend strength
    
    # Risk Management
    atr_sl_mult = 1.5        # Tight stop loss
    atr_tp_mult = 2.0        # Take profit at 2x risk (1.33 R:R)
    time_stop_bars = 12      # Exit if no profit after 12 bars
    
    # Position Management
    use_partial_tp = True    # Take partial profit at 50%
    partial_tp_pct = 0.5     # Close 50% at first target
    
    def init(self):
        close = pd.Series(self.data.Close)
        high = pd.Series(self.data.High)
        low = pd.Series(self.data.Low)
        volume = pd.Series(self.data.Volume)
        
        # Trend Indicators
        self.trend_ema_line = self.I(calculate_ema, close, self.trend_ema)
        self.htf_ema_line = self.I(calculate_ema, close, self.htf_ema)
        
        # Entry Indicators
        self.rsi = self.I(calculate_rsi, close, self.rsi_length)
        
        # Bollinger Bands
        bb_result = calculate_bollinger_bands(close, self.bb_length, self.bb_std)
        self.bb_mid = self.I(lambda x: x, bb_result[0])
        self.bb_upper = self.I(lambda x: x, bb_result[1])
        self.bb_lower = self.I(lambda x: x, bb_result[2])
        
        # ADX
        self.adx = self.I(calculate_adx, high, low, close, 14)
        
        # MACD
        macd_result = calculate_macd(close)
        self.macd_line = self.I(lambda x: x, macd_result[0])
        self.macd_signal = self.I(lambda x: x, macd_result[1])
        self.macd_hist = self.I(lambda x: x, macd_result[2])
        
        # Volume
        self.volume_avg = self.I(calculate_volume_sma, volume, 20)
        
        # ATR for sizing
        self.atr = self.I(calculate_atr, high, low, close, 14)
        
        # State
        self.entry_bar = 0
        self.entry_price = 0
        self.sl_price = 0
        self.tp_price = 0
        self.partial_taken = False
    
    def next(self):
        if len(self.data) < 250:  # Wait for indicators to warm up
            return
            
        price = self.data.Close[-1]
        high = self.data.High[-1]
        low = self.data.Low[-1]
        volume = self.data.Volume[-1]
        atr = self.atr[-1]
        
        if atr <= 0 or pd.isna(atr):
            return
        
        # === TREND CONTEXT ===
        bull_trend = price > self.trend_ema_line[-1] and price > self.htf_ema_line[-1]
        bear_trend = price < self.trend_ema_line[-1] and price < self.htf_ema_line[-1]
        trend_strength = self.adx[-1] > self.adx_threshold if not pd.isna(self.adx[-1]) else False
        
        # === POSITION MANAGEMENT ===
        if self.position:
            bars_held = len(self.data) - self.entry_bar
            
            # Stop Loss
            if self.position.is_long and price <= self.sl_price:
                self.position.close()
                return
            elif self.position.is_short and price >= self.sl_price:
                self.position.close()
                return
            
            # Take Profit
            if self.position.is_long and price >= self.tp_price:
                self.position.close()
                self.partial_taken = False
                return
            elif self.position.is_short and price <= self.tp_price:
                self.position.close()
                self.partial_taken = False
                return
            
            # Partial Take Profit (Lock in 50% at halfway to TP)
            if self.use_partial_tp and not self.partial_taken:
                half_tp = self.entry_price + (self.tp_price - self.entry_price) * 0.5
                if self.position.is_long and price >= half_tp:
                    # Move SL to break even after partial
                    self.sl_price = self.entry_price * 1.001
                    self.partial_taken = True
                elif self.position.is_short:
                    half_tp = self.entry_price - (self.entry_price - self.tp_price) * 0.5
                    if price <= half_tp:
                        self.sl_price = self.entry_price * 0.999
                        self.partial_taken = True
            
            # Time Stop (close if flat after X bars)
            if bars_held >= self.time_stop_bars:
                pnl_pct = (price - self.entry_price) / self.entry_price if self.position.is_long else (self.entry_price - price) / self.entry_price
                if pnl_pct < 0.005:  # Less than 0.5% profit
                    self.position.close()
                    self.partial_taken = False
                    return
        
        # === ENTRY LOGIC ===
        if not self.position:
            # Volume Confirmation
            vol_confirm = volume > (self.volume_avg[-1] * self.volume_mult) if not pd.isna(self.volume_avg[-1]) else True
            
            # MACD Confirmation
            macd_bull = self.macd_hist[-1] > 0 if not pd.isna(self.macd_hist[-1]) else False
            macd_bear = self.macd_hist[-1] < 0 if not pd.isna(self.macd_hist[-1]) else False
            
            # RSI Conditions
            rsi_val = self.rsi[-1] if not pd.isna(self.rsi[-1]) else 50
            rsi_oversold = rsi_val < self.rsi_oversold
            rsi_overbought = rsi_val > self.rsi_overbought
            
            # Bollinger Band touch
            bb_lower_touch = low <= self.bb_lower[-1] if not pd.isna(self.bb_lower[-1]) else False
            bb_upper_touch = high >= self.bb_upper[-1] if not pd.isna(self.bb_upper[-1]) else False
            
            # === LONG ENTRY ===
            # Multi-Confirmation Long: Trend + Momentum + One of (RSI oversold OR BB touch)
            # More flexible than requiring ALL conditions
            oversold_condition = bb_lower_touch or rsi_oversold
            momentum_confirm = macd_bull or (rsi_val > 40 and rsi_val < 60)  # MACD or neutral RSI
            
            long_signal = (
                bull_trend and                    # In uptrend
                trend_strength and                # ADX confirms trend
                oversold_condition and            # Entry trigger
                momentum_confirm                  # Momentum not against us
            )
            
            if long_signal:
                sl = price - (atr * self.atr_sl_mult)
                tp = price + (atr * self.atr_tp_mult)
                
                self.buy(size=0.95)
                self.entry_bar = len(self.data)
                self.entry_price = price
                self.sl_price = sl
                self.tp_price = tp
                self.partial_taken = False
            
            # === SHORT ENTRY ===
            # Multi-Confirmation Short: Bear Trend + Momentum + Overbought condition
            overbought_condition = bb_upper_touch or rsi_overbought
            momentum_confirm_short = macd_bear or (rsi_val > 40 and rsi_val < 60)
            
            short_signal = (
                bear_trend and
                trend_strength and
                overbought_condition and
                momentum_confirm_short
            )
            
            if short_signal:
                sl = price + (atr * self.atr_sl_mult)
                tp = price - (atr * self.atr_tp_mult)
                
                self.sell(size=0.5)  # Reduced size for shorts
                self.entry_bar = len(self.data)
                self.entry_price = price
                self.sl_price = sl
                self.tp_price = tp
                self.partial_taken = False
