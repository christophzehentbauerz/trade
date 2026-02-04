# 🤖 Telegram Bot - Schnellstart

## Was macht der Bot?
Der Bot sendet dir **automatisch Telegram-Nachrichten**, wenn:
- Ein **LONG Signal** erscheint (Kaufempfehlung)
- Ein **SHORT Signal** erscheint (Verkaufsempfehlung)  
- Das Signal sich wieder auf **NEUTRAL** ändert

**Wichtig:** Der Bot nutzt jetzt **Stundenkerzen** für genauere Signale! ✅

---

## 🚀 Setup in 3 Schritten

### Schritt 1: Telegram Bot Token holen

1. **Öffne Telegram** auf deinem Handy
2. Suche nach: **@BotFather**
3. Schreib: `/newbot`
4. Gib einen Namen: z.B. `My BTC Signal Bot`
5. Gib einen Username: z.B. `mein_btc_bot` (muss auf `bot` enden)
6. **KOPIERE DEN TOKEN** - sieht so aus:
   ```
   7362948572:AAHfiqksKZ8WmR2zSjiQ7_v4O2QtVdXYYtM
   ```

### Schritt 2: Deine Chat ID holen

1. Suche in Telegram nach: **@userinfobot**
2. Schreib: `/start`
3. Der Bot antwortet mit deiner **ID** (eine Zahl wie `123456789`)
4. **KOPIERE DIESE ZAHL**

### Schritt 3: Deinen Bot starten

1. Suche in Telegram nach deinem neuen Bot (den Namen von Schritt 1)
2. Klicke **START**

---

## 💻 Bot lokal testen

Öffne PowerShell/Terminal im `telegram-bot` Ordner und führe aus:

**Windows PowerShell:**
```powershell
$env:TELEGRAM_BOT_TOKEN="DEIN-TOKEN-HIER"
$env:TELEGRAM_CHAT_ID="DEINE-CHAT-ID-HIER"
node bot.js
```

**Windows CMD:**
```cmd
set TELEGRAM_BOT_TOKEN=DEIN-TOKEN-HIER
set TELEGRAM_CHAT_ID=DEINE-CHAT-ID-HIER
node bot.js
```

**Linux/Mac:**
```bash
export TELEGRAM_BOT_TOKEN="DEIN-TOKEN-HIER"
export TELEGRAM_CHAT_ID="DEINE-CHAT-ID-HIER"
node bot.js
```

Ersetze:
- `DEIN-TOKEN-HIER` mit dem Token von Schritt 1
- `DEINE-CHAT-ID-HIER` mit der ID von Schritt 2

---

## 🔄 Bot automatisch laufen lassen

### Option A: Mit Windows Task Scheduler (empfohlen für Windows)

1. **Erstelle eine .bat Datei** (`run-bot.bat`):
   ```batch
   @echo off
   set TELEGRAM_BOT_TOKEN=DEIN-TOKEN-HIER
   set TELEGRAM_CHAT_ID=DEINE-CHAT-ID-HIER
   cd C:\Users\Chris\.gemini\antigravity\scratch\trade\telegram-bot
   node bot.js
   ```

2. **Task Scheduler öffnen:**
   - Drücke `Win + R`
   - Tippe: `taskschd.msc`
   - Enter

3. **Neue Aufgabe erstellen:**
   - Rechtsklick → "Einfache Aufgabe erstellen"
   - Name: `BTC Signal Bot`
   - Trigger: Täglich, alle 5 Minuten
   - Aktion: Programm starten → Wähle deine `run-bot.bat`

### Option B: Mit GitHub Actions (kostenlos, Cloud-basiert)

Siehe `SETUP.md` für detaillierte Anleitung zu GitHub Actions.

---

## 📱 Beispiel Nachricht

Wenn ein Signal erkannt wird, bekommst du:

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

⏰ 04.02.2026, 11:55:00
```

---

## ⚙️ Konfiguration

In `bot.js` kannst du anpassen:

**Signal-Schwellenwerte (Zeile 258-264):**
```javascript
if (weightedScore >= 6.5) {
    state.signal = 'LONG';    // LONG bei Score ≥ 6.5
}
if (weightedScore <= 3.5) {
    state.signal = 'SHORT';   // SHORT bei Score ≤ 3.5
}
```

**Stop Loss / Take Profit (Zeile 353-358):**
```javascript
const stopLoss = state.signal === 'LONG'
    ? state.price * 0.97    // 3% SL für LONG
    : state.price * 1.03;   // 3% SL für SHORT

const takeProfit = state.signal === 'LONG'
    ? state.price * 1.05    // 5% TP für LONG
    : state.price * 0.95;   // 5% TP für SHORT
```

---

## 🔍 Troubleshooting

**Keine Nachrichten?**
- Prüfe ob Token und Chat ID korrekt sind
- Hast du den Bot mit `/start` gestartet?
- Läuft der Bot überhaupt? (Check Konsole)

**Bot läuft, aber Signal kommt nicht?**
- Der Bot sendet NUR bei **Signal-Wechsel**
- Aktuell ist wahrscheinlich **NEUTRAL** (kein Trade)
- Warte auf Score ≥ 6.5 (LONG) oder ≤ 3.5 (SHORT)

**Test ob Bot grundsätzlich funktioniert:**
Füge diese Zeile am Ende von `main()` hinzu (vor Zeile 445):
```javascript
await sendTelegramMessage("✅ Bot Test - Alles funktioniert!");
```

---

## 📊 Was bedeuten die Scores?

**Score 0-10:**
- **≤ 3.5** = SHORT Signal (Verkaufen)
- **3.5 - 6.5** = NEUTRAL (Abwarten, kein Trade!)
- **≥ 6.5** = LONG Signal (Kaufen)

**Confidence:**
- **40-60%** = Schwaches Signal
- **60-75%** = Mittlere Confidence
- **75-85%** = Starke Confidence (Max!)

---

## ✅ Fertig!

Dein Bot ist jetzt bereit! Er nutzt die gleiche Logik wie das Web-Dashboard, nur automatisch auf Telegram. 📲

**Nächste Schritte:**
1. Bot lokal testen
2. Wenn alles klappt → Task Scheduler oder GitHub Actions einrichten
3. Entspannen und auf Signale warten! 😎
