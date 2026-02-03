# 🤖 BTC Telegram Bot - Setup Anleitung

Dieser Bot sendet dir Trading-Signale direkt auf dein Handy via Telegram!

## 📋 Was du brauchst

1. **Telegram App** (hast du wahrscheinlich schon)
2. **GitHub Account** (kostenlos)

## 🚀 Setup in 5 Schritten

### Schritt 1: Telegram Bot erstellen

1. Öffne Telegram und suche nach **@BotFather**
2. Schreibe `/newbot`
3. Gib deinem Bot einen Namen (z.B. `BTC Signal Bot`)
4. Gib einen Benutzernamen (muss auf `bot` enden, z.B. `mein_btc_signal_bot`)
5. **WICHTIG:** Kopiere den **API Token** - sieht so aus:
   ```
   123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```

### Schritt 2: Deine Chat ID herausfinden

1. Öffne Telegram und suche nach **@userinfobot**
2. Schreibe `/start`
3. Der Bot antwortet mit deiner **ID** - das ist eine Zahl wie `123456789`
4. **WICHTIG:** Kopiere diese Zahl

### Schritt 3: Bot starten

1. Suche in Telegram nach deinem neuen Bot (den Namen von Schritt 1)
2. Klicke auf **Start** oder schreibe `/start`
3. Jetzt kann der Bot dir schreiben!

### Schritt 4: GitHub Repository erstellen

1. Gehe zu [github.com](https://github.com) und logge dich ein
2. Klicke auf **New Repository** (grüner Button)
3. Name: `btc-signals` (oder was du willst)
4. Wähle **Private** (empfohlen)
5. Klicke **Create Repository**

### Schritt 5: Secrets hinzufügen

1. In deinem neuen Repository, gehe zu **Settings** → **Secrets and variables** → **Actions**
2. Klicke **New repository secret**
3. Füge zwei Secrets hinzu:

   | Name | Value |
   |------|-------|
   | `TELEGRAM_BOT_TOKEN` | Der Token von Schritt 1 |
   | `TELEGRAM_CHAT_ID` | Die ID von Schritt 2 |

### Schritt 6: Code hochladen

Du kannst entweder:

**Option A: Über GitHub Desktop**
1. Installiere [GitHub Desktop](https://desktop.github.com/)
2. Clone dein Repository
3. Kopiere den `telegram-bot` Ordner und `.github` Ordner rein
4. Commit & Push

**Option B: Über die Kommandozeile**
```bash
cd pfad/zu/btc-intelligence
git init
git remote add origin https://github.com/DEIN-USERNAME/btc-signals.git
git add .
git commit -m "Initial commit"
git push -u origin main
```

## ✅ Fertig!

Der Bot läuft jetzt automatisch **alle 5 Minuten** und checkt die Signale.

Wenn ein LONG oder SHORT Signal erscheint, bekommst du sofort eine Nachricht!

---

## 🧪 Testen

Du kannst den Bot lokal testen:

```bash
cd telegram-bot
set TELEGRAM_BOT_TOKEN=dein-token-hier
set TELEGRAM_CHAT_ID=deine-chat-id
node bot.js
```

Oder in GitHub: Gehe zu **Actions** → **BTC Signal Check** → **Run workflow**

---

## ❓ FAQ

**Q: Wie oft prüft der Bot?**
A: Alle 5 Minuten (kann im Workflow angepasst werden)

**Q: Bekomme ich bei jedem Check eine Nachricht?**
A: Nein! Nur wenn sich das Signal **ändert** (z.B. NEUTRAL → LONG)

**Q: Was kostet das?**
A: Nichts! GitHub Actions bietet 2000 Minuten/Monat kostenlos.

**Q: Kann ich die Schwellenwerte ändern?**
A: Ja, in `bot.js` die Werte 6.5 (LONG) und 3.5 (SHORT) anpassen.

---

## 📱 Beispiel Nachricht

```
🟢 BTC LONG SIGNAL 🟢

💰 Preis: $98,500
📊 Score: 7.2/10
🎯 Konfidenz: 72%

📋 Indikatoren:
• RSI: 28 (überverkauft)
• Trend: 📈 Bullish
• F&G: 25 (Angst)
• Funding: -0.0100%
• L/S: 45% / 55%

🎯 Empfehlung: 📈 KAUFEN

📍 Trade Setup:
• Entry: ~$98,500
• Stop Loss: $95,545
• Take Profit: $103,425

⏰ 03.02.2026, 19:55:00
```
