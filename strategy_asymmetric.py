# -*- coding: utf-8 -*-
"""
ASYMMETRIC STRATEGY v3.0
========================
Goal: Let winners RUN. Cut losers quick.

Key Changes from v2.0:
1. NO fixed Take Profit - let trends play out
2. Trailing Stop that WIDENS as profit grows
3. Tighter initial SL (2.5 ATR) - cut losers faster
4. Only exit on: Trailing Stop OR Death Cross OR Time Stop (if flat)

Expected Result:
- Lower win rate (maybe 45-50%)
- But BIGGER winners (+10%, +15%, +20% possible)
- Better overall return through asymmetry
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


class AsymmetricStrategy(Strategy):
    """
    Asymmetric Risk/Reward Strategy
    
    Core Philosophy:
    - Small losses (tight SL)
    - BIG winners (no TP, trailing stop only)
    - Let the trend be your friend
    
    Trailing Stop Logic:
    - Start at 2.5 ATR (tight)
    - After 3 ATR profit: Trail at 2.0 ATR (protect gains)
    - After 6 ATR profit: Trail at 3.0 ATR (let it run!)
    - After 10 ATR profit: Trail at 4.0 ATR (ride the wave)
    """
    
    # === ENTRY PARAMETERS (OPTIMIZED) ===
    fast_ema = 15
    slow_ema = 300
    htf_ema = 800
    
    rsi_length = 14
    rsi_entry_min = 45
    rsi_entry_max = 70
    
    # === RISK PARAMETERS ===
    initial_sl_atr = 2.5      # Tight initial stop
    
    # Trailing Stop Tiers (ATR multiples)
    trail_tier1_trigger = 3.0   # After 3 ATR profit
    trail_tier1_distance = 2.0  # Trail at 2 ATR
    
    trail_tier2_trigger = 5.0   # After 5 ATR profit
    trail_tier2_distance = 4.0  # Trail at 4 ATR (let it run!)
    
    trail_tier3_trigger = 10.0  # After 10 ATR profit
    trail_tier3_distance = 4.0  # Trail at 4 ATR
    
    # Time stop only if flat
    time_stop_bars = 72         # 3 days - give it time!
    time_stop_min_profit = 0.5  # Exit if <0.5% after 72 bars
    
    def init(self):
        close = pd.Series(self.data.Close)
        high = pd.Series(self.data.High)
        low = pd.Series(self.data.Low)
        
        self.fast = self.I(calculate_ema, close, self.fast_ema)
        self.slow = self.I(calculate_ema, close, self.slow_ema)
        self.htf = self.I(calculate_ema, close, self.htf_ema)
        self.rsi = self.I(calculate_rsi, close, self.rsi_length)
        self.atr = self.I(calculate_atr, high, low, close, 14)
        
        self.entry_bar = 0
        self.entry_price = 0
        self.entry_atr = 0
        self.sl_price = 0
        self.highest_price = 0  # Track highest price since entry
        self.current_tier = 0   # Current trailing tier
        self.trend_is_up = False
    
    def next(self):
        if len(self.data) < self.slow_ema + 10:
            return
        
        price = self.data.Close[-1]
        high = self.data.High[-1]
        atr = self.atr[-1]
        rsi = self.rsi[-1] if not pd.isna(self.rsi[-1]) else 50
        
        if pd.isna(atr) or atr <= 0:
            return
        
        # Trend Detection
        fast_above_slow = self.fast[-1] > self.slow[-1]
        price_above_htf = price > self.htf[-1]
        new_trend_up = fast_above_slow and price_above_htf
        
        golden_cross = not self.trend_is_up and new_trend_up
        death_cross = self.trend_is_up and not fast_above_slow
        
        # === POSITION MANAGEMENT ===
        if self.position:
            bars_held = len(self.data) - self.entry_bar
            
            # Update highest price for trailing
            if self.position.is_long:
                self.highest_price = max(self.highest_price, high)
            
            # Calculate profit in ATR terms
            profit_atr = (self.highest_price - self.entry_price) / self.entry_atr if self.entry_atr > 0 else 0
            
            # === DYNAMIC TRAILING STOP ===
            if self.position.is_long:
                # Determine current tier based on profit
                new_tier = 0
                trail_distance = self.initial_sl_atr
                
                if profit_atr >= self.trail_tier3_trigger:
                    new_tier = 3
                    trail_distance = self.trail_tier3_distance
                elif profit_atr >= self.trail_tier2_trigger:
                    new_tier = 2
                    trail_distance = self.trail_tier2_distance
                elif profit_atr >= self.trail_tier1_trigger:
                    new_tier = 1
                    trail_distance = self.trail_tier1_distance
                
                # Only move stop UP, never down
                if new_tier > 0:
                    # Trail from highest price
                    new_sl = self.highest_price - (atr * trail_distance)
                    
                    # Minimum: break-even after tier 1
                    if new_tier >= 1:
                        new_sl = max(new_sl, self.entry_price * 1.002)
                    
                    self.sl_price = max(self.sl_price, new_sl)
                    self.current_tier = new_tier
            
            # === STOP LOSS CHECK ===
            if self.position.is_long and price <= self.sl_price:
                self.position.close()
                self._reset_state()
                self.trend_is_up = new_trend_up
                return
            
            # === DEATH CROSS EXIT ===
            # Only exit on death cross if we're not in a big winner
            if self.position.is_long and death_cross:
                current_profit_pct = (price - self.entry_price) / self.entry_price * 100
                # If we're up big, let the trailing stop do its job
                if current_profit_pct < 5.0:  # Only exit on death cross if <5% profit
                    self.position.close()
                    self._reset_state()
                    self.trend_is_up = new_trend_up
                    return
            
            # === TIME STOP (only if flat) ===
            if bars_held >= self.time_stop_bars:
                current_profit_pct = (price - self.entry_price) / self.entry_price * 100
                if current_profit_pct < self.time_stop_min_profit:
                    self.position.close()
                    self._reset_state()
                    self.trend_is_up = new_trend_up
                    return
        
        # === ENTRY LOGIC ===
        if not self.position:
            rsi_in_zone = self.rsi_entry_min <= rsi <= self.rsi_entry_max
            
            if golden_cross and rsi_in_zone:
                # Tight initial stop
                sl = price - (atr * self.initial_sl_atr)
                
                self.buy(size=0.95)
                self.entry_bar = len(self.data)
                self.entry_price = price
                self.entry_atr = atr
                self.sl_price = sl
                self.highest_price = price
                self.current_tier = 0
        
        self.trend_is_up = new_trend_up
    
    def _reset_state(self):
        self.entry_bar = 0
        self.entry_price = 0
        self.entry_atr = 0
        self.sl_price = 0
        self.highest_price = 0
        self.current_tier = 0


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
    bt = Backtest(clean_data, AsymmetricStrategy, cash=100_000, commission=.001)
    stats = bt.run()
    
    print()
    print("=" * 60)
    print("ASYMMETRIC STRATEGY - LET WINNERS RUN")
    print("=" * 60)
    print()
    print(f"Return:        {stats['Return [%]']:.2f}%")
    print(f"Win Rate:      {stats['Win Rate [%]']:.1f}%")
    pf = stats['Profit Factor']
    print(f"Profit Factor: {pf:.2f}" if not pd.isna(pf) else "Profit Factor: N/A")
    print(f"Max Drawdown:  {stats['Max. Drawdown [%]']:.2f}%")
    print(f"# Trades:      {stats['# Trades']}")
    print(f"Best Trade:    {stats['Best Trade [%]']:.2f}%")
    print(f"Avg Trade:     {stats['Avg. Trade [%]']:.2f}%")
    print()
    
    # Trade analysis
    trades = stats.get('_trades')
    if trades is not None and not trades.empty:
        wins = trades[trades['ReturnPct'] > 0]
        
        print("TOP 10 WINNERS:")
        print("-" * 40)
        top_wins = wins.nlargest(10, 'ReturnPct')
        for _, t in top_wins.iterrows():
            print(f"  {t['EntryTime'].strftime('%Y-%m-%d')} | +{t['ReturnPct']*100:.2f}% | {t['Duration']}")
        
        # Distribution
        big_wins = len(wins[wins['ReturnPct'] > 0.05])  # >5%
        medium_wins = len(wins[(wins['ReturnPct'] > 0.02) & (wins['ReturnPct'] <= 0.05)])  # 2-5%
        small_wins = len(wins[wins['ReturnPct'] <= 0.02])  # <2%
        
        print()
        print("WIN DISTRIBUTION:")
        print(f"  Big (>5%):    {big_wins} trades")
        print(f"  Medium (2-5%): {medium_wins} trades")
        print(f"  Small (<2%):   {small_wins} trades")
    
    # Generate plot
    bt.plot(filename='results/asymmetric_strategy_plot.html', open_browser=False)
    print()
    print("Plot saved to results/asymmetric_strategy_plot.html")
