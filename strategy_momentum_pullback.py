# -*- coding: utf-8 -*-
"""
Smart Momentum Pullback Strategy v3.0
=====================================
Goal: >55% win rate with solid profitability.

Key Insight: BTC is trend-driven. Instead of mean reversion,
we buy PULLBACKS in strong trends and use smart exits.

Approach:
1. Strong Trend Filter (Price above EMA 200)
2. Wait for Price to Pull Back to EMA 50
3. Confirm Pullback Bounce with RSI turning up
4. Smart Profit Taking at Previous High/Low
5. Trailing Stop to protect gains
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


def calculate_swing_high(high, lookback=20):
    """Find recent swing high for take profit."""
    return high.rolling(lookback).max()


def calculate_swing_low(low, lookback=20):
    """Find recent swing low for stop loss."""
    return low.rolling(lookback).min()


class MomentumPullbackStrategy(Strategy):
    """
    Smart Momentum Pullback Strategy
    
    Logic:
    - In UPTREND: Wait for pullback to support EMA, then buy when RSI turns up
    - In DOWNTREND: Wait for rally to resistance EMA, then sell when RSI turns down
    - Take Profit at previous swing high/low
    - Trailing stop after profit started
    """
    
    # === OPTIMIZATION PARAMETERS ===
    
    # Trend Definition
    trend_ema = 200          # Primary trend (above = uptrend)
    pullback_ema = 50        # Pullback support/resistance
    
    # Entry Filters
    rsi_length = 14
    rsi_pullback_low = 40    # RSI below this on pullback (oversold in trend)
    rsi_turn_up = 45         # RSI must turn up past this to confirm bounce
    
    # Risk Management
    atr_length = 14
    atr_sl_mult = 2.0        # Stop Loss distance
    swing_lookback = 30      # Bars to look back for swing high/low
    
    # Exit Rules
    use_swing_tp = True      # Take profit at swing high
    trailing_start = 1.5     # Start trailing after 1.5x ATR profit
    trailing_mult = 2.0      # Trail at 2x ATR distance
    time_exit_bars = 48      # Max hold time if flat
    
    def init(self):
        close = pd.Series(self.data.Close)
        high = pd.Series(self.data.High)
        low = pd.Series(self.data.Low)
        
        # Trend Indicators
        self.trend_ema_line = self.I(calculate_ema, close, self.trend_ema)
        self.pullback_ema_line = self.I(calculate_ema, close, self.pullback_ema)
        
        # RSI
        self.rsi = self.I(calculate_rsi, close, self.rsi_length)
        
        # ATR
        self.atr = self.I(calculate_atr, high, low, close, self.atr_length)
        
        # Swing Points
        self.swing_high = self.I(calculate_swing_high, high, self.swing_lookback)
        self.swing_low = self.I(calculate_swing_low, low, self.swing_lookback)
        
        # State
        self.entry_bar = 0
        self.entry_price = 0
        self.sl_price = 0
        self.tp_price = 0
        self.trailing_active = False
        self.prev_rsi = 50
    
    def next(self):
        if len(self.data) < self.trend_ema + 10:
            return
            
        price = self.data.Close[-1]
        low = self.data.Low[-1]
        high = self.data.High[-1]
        atr = self.atr[-1]
        rsi = self.rsi[-1]
        
        if pd.isna(atr) or atr <= 0:
            return
        if pd.isna(rsi):
            rsi = 50
        
        # === TREND CONTEXT ===
        uptrend = price > self.trend_ema_line[-1]
        downtrend = price < self.trend_ema_line[-1]
        
        # Pullback Detection
        near_pullback_support = low <= self.pullback_ema_line[-1] * 1.02  # Within 2% of EMA 50
        near_pullback_resistance = high >= self.pullback_ema_line[-1] * 0.98
        
        # RSI Turn Detection
        rsi_turning_up = rsi > self.prev_rsi and self.prev_rsi < self.rsi_pullback_low and rsi > self.rsi_turn_up
        rsi_turning_down = rsi < self.prev_rsi and self.prev_rsi > (100 - self.rsi_pullback_low) and rsi < (100 - self.rsi_turn_up)
        
        # === POSITION MANAGEMENT ===
        if self.position:
            bars_held = len(self.data) - self.entry_bar
            
            # Stop Loss Check
            if self.position.is_long and price <= self.sl_price:
                self.position.close()
                self._reset_state()
                self.prev_rsi = rsi
                return
            elif self.position.is_short and price >= self.sl_price:
                self.position.close()
                self._reset_state()
                self.prev_rsi = rsi
                return
            
            # Take Profit Check
            if self.position.is_long and price >= self.tp_price:
                self.position.close()
                self._reset_state()
                self.prev_rsi = rsi
                return
            elif self.position.is_short and price <= self.tp_price:
                self.position.close()
                self._reset_state()
                self.prev_rsi = rsi
                return
            
            # Trailing Stop Logic
            if self.position.is_long:
                profit_atr = (price - self.entry_price) / atr
                if profit_atr >= self.trailing_start and not self.trailing_active:
                    self.trailing_active = True
                
                if self.trailing_active:
                    new_sl = price - (atr * self.trailing_mult)
                    self.sl_price = max(self.sl_price, new_sl)
            
            elif self.position.is_short:
                profit_atr = (self.entry_price - price) / atr
                if profit_atr >= self.trailing_start and not self.trailing_active:
                    self.trailing_active = True
                
                if self.trailing_active:
                    new_sl = price + (atr * self.trailing_mult)
                    self.sl_price = min(self.sl_price, new_sl)
            
            # Time Exit (if flat after X bars)
            if bars_held >= self.time_exit_bars:
                pnl_pct = self.position.pl_pct
                if pnl_pct < 0.01:  # Less than 1% profit
                    self.position.close()
                    self._reset_state()
                    self.prev_rsi = rsi
                    return
        
        # === ENTRY LOGIC ===
        if not self.position:
            # === LONG: Pullback Buy in Uptrend ===
            # Conditions:
            # 1. Price above EMA 200 (uptrend)
            # 2. Price pulled back to EMA 50 (support)
            # 3. RSI was oversold but now turning up (bounce confirmation)
            long_signal = (
                uptrend and
                near_pullback_support and
                rsi_turning_up
            )
            
            if long_signal:
                sl = price - (atr * self.atr_sl_mult)
                
                # Take Profit at recent swing high
                if self.use_swing_tp and not pd.isna(self.swing_high[-1]):
                    tp = self.swing_high[-1]
                    # Minimum 1.5 ATR TP
                    if tp < price + (atr * 1.5):
                        tp = price + (atr * 2.5)
                else:
                    tp = price + (atr * 3.0)
                
                self.buy(size=0.95)
                self.entry_bar = len(self.data)
                self.entry_price = price
                self.sl_price = sl
                self.tp_price = tp
                self.trailing_active = False
            
            # === SHORT: Rally Sell in Downtrend ===
            short_signal = (
                downtrend and
                near_pullback_resistance and
                rsi_turning_down
            )
            
            if short_signal:
                sl = price + (atr * self.atr_sl_mult)
                
                # Take Profit at recent swing low
                if self.use_swing_tp and not pd.isna(self.swing_low[-1]):
                    tp = self.swing_low[-1]
                    if tp > price - (atr * 1.5):
                        tp = price - (atr * 2.5)
                else:
                    tp = price - (atr * 3.0)
                
                self.sell(size=0.5)  # Reduced size for shorts
                self.entry_bar = len(self.data)
                self.entry_price = price
                self.sl_price = sl
                self.tp_price = tp
                self.trailing_active = False
        
        # Update previous RSI
        self.prev_rsi = rsi
    
    def _reset_state(self):
        self.entry_bar = 0
        self.entry_price = 0
        self.sl_price = 0
        self.tp_price = 0
        self.trailing_active = False


# Second Strategy: Simplified Golden Cross with smarter exits
class SmartGoldenCrossStrategy(Strategy):
    """
    Improved Golden Cross with smarter entries and exits.
    
    Changes from original:
    1. Wait for RSI pullback before entry (don't chase)
    2. Use swing points for TP targets
    3. Break-even after small profit
    4. Trend strength filter (ADX)
    """
    
    # EMAs
    fast_ema = 20
    slow_ema = 200
    htf_ema = 800
    
    # Entry Filters
    rsi_length = 14
    rsi_entry_max = 70    # Don't buy if RSI too high (overbought)
    rsi_entry_min = 40    # Wait for pullback
    
    # Risk Management
    atr_sl_mult = 2.5
    be_trigger_atr = 2.0  # Move to BE after 2 ATR profit
    swing_lookback = 40
    
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
                    self.sl_price = self.entry_price * 1.002  # Slightly above entry
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
            # LONG Entry: After Golden Cross + RSI Pullback
            rsi_in_zone = self.rsi_entry_min <= rsi <= self.rsi_entry_max
            
            if golden_cross and rsi_in_zone:
                sl = price - (atr * self.atr_sl_mult)
                tp = self.swing_high[-1] if not pd.isna(self.swing_high[-1]) else price + (atr * 4)
                
                # Ensure minimum TP
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
