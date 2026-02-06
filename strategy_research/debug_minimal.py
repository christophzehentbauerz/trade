from backtesting import Backtest, Strategy
import pandas as pd

class DebugStrategy(Strategy):
    def init(self):
        pass

    def next(self):
        # Force buy at bar 100
        if len(self.data) == 100:
            print(f"Attempting to buy at price {self.data.Close[-1]}")
            self.buy(size=0.5) # 50% of equity

        if len(self.data) == 105:
            print(f"Position size: {self.position.size}")
            self.position.close()

if __name__ == '__main__':
    df = pd.read_csv('BTC_USDT_1h.csv', index_col='timestamp', parse_dates=True)
    df = df[['Open', 'High', 'Low', 'Close', 'Volume']]
    
    print("Running minimal debug...")
    # High cash to avoid margin issues
    bt = Backtest(df, DebugStrategy, cash=1_000_000, commission=.001)
    stats = bt.run()
    print(stats)
    print(stats._trades)
