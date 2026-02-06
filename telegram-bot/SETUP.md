# BTC Smart Money Strategy - Telegram Bot Setup

Der Bot benachrichtigt dich auf Telegram wenn:
- 🟢 **LONG Signal** → Alle 3 Bedingungen erfüllt (Golden Cross + HTF Filter + RSI Zone)
- 🔴 **EXIT Signal** → Death Cross (EMA 15 unter EMA 300)
- 📊 **Daily Update** → Täglicher Marktbericht um 06:00

## 1. Bot erstellen

1. Öffne Telegram und suche nach `@BotFather`
2. Sende `/newbot` und folge den Anweisungen
3. Kopiere den **Bot Token** (sieht so aus: `123456789:ABCdefGHI...`)

## 2. Chat ID herausfinden

1. Suche nach `@userinfobot` auf Telegram
2. Starte den Bot mit `/start`
3. Kopiere deine **Chat ID** (nur Zahlen)

## 3. Environment Variables setzen

```bash
export TELEGRAM_BOT_TOKEN="dein-bot-token"
export TELEGRAM_CHAT_ID="deine-chat-id"
```

## 4. Bot ausführen

```bash
cd telegram-bot

# Signal Check (prüft ob Signale geändert haben)
node bot.js check

# Daily Update (sendet Tagesübersicht)
node bot.js daily
```

## 5. Automatisierung (Cron Jobs)

Für kontinuierliche Überwachung, richte Cron Jobs ein:

```bash
crontab -e
```

Füge hinzu:
```cron
# Signal Check alle 5 Minuten
*/5 * * * * TELEGRAM_BOT_TOKEN="xxx" TELEGRAM_CHAT_ID="xxx" /usr/bin/node /pfad/zu/telegram-bot/bot.js check

# Daily Update um 06:00
0 6 * * * TELEGRAM_BOT_TOKEN="xxx" TELEGRAM_CHAT_ID="xxx" /usr/bin/node /pfad/zu/telegram-bot/bot.js daily
```

## 6. Cloud Deployment (Optional)

### Railway / Render / Fly.io
1. Push den Code zu GitHub
2. Verbinde mit einem Cloud-Service
3. Setze die Environment Variables
4. Richte Cron Jobs über den Service ein

### GitHub Actions (Kostenlos)
Erstelle `.github/workflows/bot.yml`:

```yaml
name: BTC Smart Money Bot
on:
  schedule:
    - cron: '*/5 * * * *'  # Alle 5 Minuten
    - cron: '0 5 * * *'    # Daily um 06:00 (UTC+1)
  workflow_dispatch:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Check Signal
        if: github.event.schedule != '0 5 * * *'
        run: node telegram-bot/bot.js check
        env:
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
      - name: Daily Update
        if: github.event.schedule == '0 5 * * *'
        run: node telegram-bot/bot.js daily
        env:
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
```

## Strategie-Regeln

**LONG Entry (alle 3 müssen erfüllt sein):**
- ✅ Golden Cross: EMA(15) > EMA(300)
- ✅ HTF Filter: Preis > EMA(800)
- ✅ RSI Zone: RSI(14) zwischen 45 und 70

**EXIT Signal:**
- 🔴 Death Cross: EMA(15) < EMA(300)

**Risk Management:**
- Stop Loss: Entry - (ATR × 2.5)
- Trailing Stop nach Profit-Schwellen
