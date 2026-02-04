# 🔄 Bot Automatisch Laufen Lassen - Beste Methoden

## 📊 Vergleich der Optionen

| Methode | Zuverlässigkeit | Einfachheit | Kosten | Empfehlung |
|---------|----------------|-------------|---------|------------|
| **Windows Task Scheduler** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Kostenlos | **✅ BESTE für Windows** |
| **GitHub Actions** | ⭐⭐⭐⭐ | ⭐⭐⭐ | Kostenlos | ✅ Gut (Cloud) |
| **Node.js Cron** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Kostenlos | ⚠️ Braucht dauerhaft laufenden PC |

---

## 🏆 **EMPFEHLUNG: Windows Task Scheduler**

### Vorteile:
- ✅ Läuft immer wenn PC an ist
- ✅ Sehr zuverlässig
- ✅ Keine Cloud-Abhängigkeit
- ✅ Einfach einzurichten
- ✅ Kostenlos

### Nachteile:
- ⚠️ Nur wenn PC läuft
- ⚠️ Funktioniert nicht wenn PC aus ist

---

## 📋 **Anleitung: Windows Task Scheduler Setup**

### Schritt 1: Task Scheduler öffnen

1. Drücke `Win + R`
2. Tippe: `taskschd.msc`
3. Enter

### Schritt 2: Neue Aufgabe erstellen

1. Rechtsklick auf **"Aufgabenplanungsbibliothek"** (links)
2. **"Aufgabe erstellen..."** (NICHT "Einfache Aufgabe"!)

### Schritt 3: Allgemein

- **Name:** `BTC Signal Bot`
- **Beschreibung:** `Prüft BTC Trading-Signale und sendet Telegram Nachrichten`
- ✅ **"Unabhängig von der Benutzeranmeldung ausführen"**
- ✅ **"Mit höchsten Privilegien ausführen"**

### Schritt 4: Trigger

1. Tab **"Trigger"** → **"Neu..."**
2. **"Aufgabe starten:"** → `Nach einem Zeitplan`
3. **Einstellungen:**
   - ✅ **Täglich**
   - **Wiederholen alle:** `15 Minuten`
   - **Für eine Dauer von:** `1 Tag`
   - ✅ **Aktiviert**

### Schritt 5: Aktionen

1. Tab **"Aktionen"** → **"Neu..."**
2. **Aktion:** `Programm starten`
3. **Programm/Skript:**
   ```
   C:\Users\Chris\.gemini\antigravity\scratch\trade\telegram-bot\start-bot.bat
   ```
4. **Starten in (optional):**
   ```
   C:\Users\Chris\.gemini\antigravity\scratch\trade\telegram-bot
   ```

### Schritt 6: Bedingungen

1. Tab **"Bedingungen"**
2. **DEAKTIVIERE:**
   - ❌ Aufgabe nur starten, falls Computer im Netzbetrieb läuft
   - ❌ Aufgabe beenden, falls Computer in Akkubetrieb wechselt

### Schritt 7: Einstellungen

1. Tab **"Einstellungen"**
2. **AKTIVIERE:**
   - ✅ Ausführung der Aufgabe bei Bedarf zulassen
   - ✅ Wenn eine laufende Instanz der Aufgabe bereits vorhanden ist: `Neue Instanz nicht starten`

3. **Klicke OK** und gib ggf. dein Windows-Passwort ein

---

## ✅ **Fertig! Bot läuft jetzt automatisch**

### Was passiert jetzt:
- ✅ Bot startet **alle 15 Minuten**
- ✅ Prüft Marktdaten
- ✅ Sendet Telegram bei:
  - **Signal-Wechsel** (NEUTRAL → LONG/SHORT)
  - **Early Warning** (Preis nähert sich Entry - 1-2% vorher!)
  - **Signal-Reset** (LONG/SHORT → NEUTRAL)

---

## 🔧 **Anpassungen**

### Andere Intervalle:

**Alle 5 Minuten** (sehr aktiv):
- Trigger → Wiederholen: `5 Minuten`

**Alle 30 Minuten** (moderat):
- Trigger → Wiederholen: `30 Minuten`

**Stündlich** (entspannt):
- Trigger → Wiederholen: `1 Stunde`

---

## 🧪 **Testen**

1. **Task Scheduler** öffnen
2. Finde deine Aufgabe: `BTC Signal Bot`
3. Rechtsklick → **"Ausführen"**
4. Check Telegram!

---

## 🛑 **Deaktivieren/Löschen**

### Temporär deaktivieren:
1. Task Scheduler öffnen
2. Rechtsklick auf `BTC Signal Bot`
3. **"Deaktivieren"**

### Komplett löschen:
1. Task Scheduler öffnen
2. Rechtsklick auf `BTC Signal Bot`
3. **"Löschen"**

---

## 📱 **Was sind die Benachrichtigungen?**

### 1️⃣ **Normal Signal** (wenn Signal wechselt):
```
🟢 BTC LONG SIGNAL 🟢

💰 Preis: $98,500
📊 Score: 7.2/10
🎯 Konfidenz: 72%
...
```

### 2️⃣ **⚡ EARLY WARNING** (NEU! 1-2% vor Entry):
```
⚡ EARLY WARNING ⚡

🟢 LONG Signal aktiv!

💰 Aktueller Preis: $89,000
📍 Entry Zone: $90,000
📏 Abstand: 1.11%

💡 Bereite deinen Trade vor! 
   Entry-Zone wird bald erreicht.
```

---

## ❓ **Häufige Fragen**

**Q: Warum bekomme ich keine Nachrichten?**
A: Bot sendet NUR bei Signal-Wechsel oder Early Warning. Aktuell ist Score 5.3 = NEUTRAL.

**Q: Kann ich es auch ohne Task Scheduler machen?**
A: Ja, dann musst du `start-bot.bat` manuell klicken wenn du prüfen willst.

**Q: Funktioniert es wenn PC aus ist?**
A: Nein, dann nutze GitHub Actions (siehe SETUP.md).

**Q: Kann ich mehrere Bots haben?**
A: Ja! Kopiere einfach den telegram-bot Ordner und ändere die Token.

---

## ✅ **Empfohlenes Setup**

- **Intervall:** Alle 15 Minuten
- **Laufzeit:** Immer wenn PC an
- **Benachrichtigungen:**
  - ✅ Signal-Wechsel
  - ✅ Early Warning (1-2% vor Entry)
  - ✅ Signal-Reset

**Viel Erfolg beim Trading! 🚀**
