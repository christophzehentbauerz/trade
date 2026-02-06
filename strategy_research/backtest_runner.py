from backtesting import Backtest, Strategy
import pandas as pd
import numpy as np

def SMA(values, n):
    return pd.Series(values).rolling(n).mean()

def ATR(df, n):
    try:
        high = df['High']
        low = df['Low']
        close = df['Close']
        prev_close = close.shift(1)
        tr = pd.DataFrame({'tr1': high - low, 'tr2': (high - prev_close).abs(), 'tr3': (low - prev_close).abs()}).max(axis=1)
        return tr.rolling(n).mean()
    except Exception:
        return pd.Series(0, index=df.index)

def ADX(df, n):
    high = df['High']
    low = df['Low']
    close = df['Close']
    
    up = high - high.shift(1)
    down = low.shift(1) - low
    
    pos_dm = np.where((up > down) & (up > 0), up, 0)
    neg_dm = np.where((down > up) & (down > 0), down, 0)
    
    tr = ATR(df, 1).values 
    tr_s = pd.Series(tr).rolling(n).sum()
    pos_dm_s = pd.Series(pos_dm).rolling(n).sum()
    neg_dm_s = pd.Series(neg_dm).rolling(n).sum()
    
    pos_di = 100 * (pos_dm_s / tr_s)
    neg_di = 100 * (neg_dm_s / tr_s)
    
    dx = 100 * (abs(pos_di - neg_di) / (pos_di + neg_di))
    adx = dx.rolling(n).mean()
    return adx

class RiskManagedStrategy(Strategy):
    n_atr = 14
    atr_multiplier = 4.0 # Back to wide stops
    ma_period = 200
    donchian_period = 50
    adx_threshold = 25
    risk_per_trade = 0.02 # 2% risk of equity default
    
    def init(self):
        self.atr = self.I(ATR, self.data.df, self.n_atr)
        self.ma = self.I(SMA, self.data.Close, self.ma_period)
        self.adx = self.I(ADX, self.data.df, 14)
        
        self.donchian_high = self.I(lambda x: pd.Series(x).rolling(self.donchian_period).max().shift(1), self.data.High)
        self.donchian_low = self.I(lambda x: pd.Series(x).rolling(self.donchian_period).min().shift(1), self.data.Low)

    def next(self):
        if len(self.data) < max(self.ma_period, self.donchian_period) + 5: return
        if pd.isna(self.ma[-1]): return

        price = self.data.Close[-1]
        
        uptrend = price > self.ma[-1]
        strong_trend = self.adx[-1] > self.adx_threshold
        atr_value = self.atr[-1]
        
        if not self.position:
            # Calculate Position Size based on Risk
            # Risk Amount = Equity * Risk %
            # Risk Distance = ATR * Multiplier
            # Position Size (Units) = Risk Amount / Risk Distance
            
            risk_amount = self.equity * self.risk_per_trade
            stop_distance = atr_value * self.atr_multiplier
            
            if stop_distance == 0: return # Safety
            
            # Units to buy/sell
            units = int(risk_amount / stop_distance)
            
            # Check if units are too small/large (basic sanity)
            max_units = int((self.equity * 0.95) / price)
            units = min(units, max_units) 
            
            if units < 1: return
            
            # Long Entry
            if uptrend and strong_trend and price > self.donchian_high[-1]: 
                sl = price - stop_distance
                self.buy(sl=sl, size=units)
            
            # Short Entry
            elif not uptrend and strong_trend and price < self.donchian_low[-1]:
                sl = price + stop_distance
                self.sell(sl=sl, size=units)
        
        for trade in self.trades:
            if trade.is_long:
                new_sl = price - (atr_value * self.atr_multiplier)
                if new_sl > trade.sl:
                    trade.sl = new_sl
            else:
                new_sl = price + (atr_value * self.atr_multiplier)
                if new_sl < trade.sl:
                    trade.sl = new_sl

def optim_func(series):
    # Minimum 10 trades
    if series['# Trades'] < 10: return -1
    
    # Strict Constraints
    if series['Max. Drawdown [%]'] < -20: return -1 # Reject if worse than 20%
    
    # Maximize Profit (since we constrained risk via sizing and DD limit)
    # Or Return / DD
    return series['Return [%]'] / abs(series['Max. Drawdown [%]'])

if __name__ == '__main__':
    try:
        df = pd.read_csv('BTC_USDT_1h.csv', index_col='timestamp', parse_dates=True)
    except FileNotFoundError:
        exit()

    df = df[['Open', 'High', 'Low', 'Close', 'Volume']]
    
    print("Running Risk-Managed Optimization...")
    bt = Backtest(df, RiskManagedStrategy, cash=10_000_000, commission=.001, exclusive_orders=True)
    
    stats_opt, heatmap = bt.optimize(
        risk_per_trade=[0.01, 0.02, 0.03], # 1%, 2%, 3% risk
        n_atr=[14],
        atr_multiplier=[3.0, 4.0, 5.0], # Wide stops
        ma_period=[200, 800],
        donchian_period=[50, 100],
        adx_threshold=[20, 25],
        maximize=optim_func,
        return_heatmap=True
    )
    
    print("\nBest Parameters:")
    print(stats_opt._strategy)
    print("\nOptimized Stats:")
    print(stats_opt)
    
    print("\nTop 5 Configs:")
    print(heatmap.sort_values(ascending=False).head(5))
