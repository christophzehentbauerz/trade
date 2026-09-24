# Telegram-Bot: Einrichtung und Diagnose

Der Bot sendet Strategiehinweise und Tagesberichte. Er führt keine Börsenorders aus. Das Dashboard berechnet Markt-Setups unabhängig vom Bot; eine funktionierende Vorschau beweist deshalb nicht, dass die automatischen GitHub-Ausführungen laufen.

## Zugangsdaten

1. Einen Bot mit Telegrams `@BotFather` erstellen.
2. Den eigenen Bot in Telegram öffnen und `/start` senden. Ohne gestarteten Chat kann er keine privaten Nachrichten zustellen.
3. Die gewünschte Chat-ID ermitteln und beide Werte als GitHub Actions Repository-Secrets hinterlegen: `TELEGRAM_BOT_TOKEN` und `TELEGRAM_CHAT_ID`.

Der Bot beantwortet ausschließlich Nachrichten aus der konfigurierten Chat-ID. Tokens gehören nicht ins Repository, in öffentliche Webseiten oder in Protokolle.

## Prüfen, ohne Nachrichten zu senden

Node.js 24 verwenden. Keine npm-Abhängigkeiten erforderlich.

```powershell
$env:TELEGRAM_BOT_TOKEN = 'DEIN_TOKEN'
$env:TELEGRAM_CHAT_ID = 'DEINE_CHAT_ID'
node telegram-bot/bot.js diagnose
```

`diagnose` prüft Bot-Identität, Chat-Erreichbarkeit, einen möglichen Webhook-Konflikt und die aktuellen Kerzendaten. Es sendet keine Nachrichten, konsumiert keine Chat-Updates und verändert den Bot-Zustand nicht. Ein erfolgreicher Lauf bestätigt API-Zugriff, aber noch keine tatsächliche Nachrichtenzustellung.

In GitHub Actions: **BTC Signal Check → Run workflow → mode: diagnose**.

## Normaler Betrieb

```powershell
node telegram-bot/bot.js check
node telegram-bot/bot.js daily
```

- `check`: Signalprüfung, virtuelle Positionsverwaltung und Antworten auf `/status`, `/score`, `/plan`, `/ema`, `/daily`, `/hilfe`.
- `daily`: Tagesbericht; ein erfolgreich zugestellter Bericht wird am selben UTC-Tag nicht erneut gesendet.
- `STATE_FILE`: optionaler Pfad für die Zustandsdatei. Standard ist `btc-smart-money-state.json` im temporären Systemordner. Bei eigenem Dauerbetrieb einen persistenten Pfad verwenden.

Die vorhandenen Workflows sind bereits eingerichtet:

- **BTC Signal Check:** alle zehn Minuten.
- **Daily Report:** 06:00 UTC, Wiederholungsversuch 06:30 UTC. In Wien ist das 07:00 im Winter bzw. 08:00 im Sommer.
- Beide Workflows teilen sich eine Ausführungssperre und dieselbe Zustandsdatei. Ein laufender Bot wird nicht durch den nächsten Lauf abgebrochen.

GitHub-Zeitpläne können verzögert sein und bei Inaktivität deaktiviert werden. Unter **Actions** beide Workflows auf ihren Aktivierungszustand prüfen. Eine Webseite muss für diese Jobs nicht geöffnet sein. Antworten auf Telegram-Befehle erfolgen erst beim nächsten Bot-Lauf; es ist kein ständig laufender Chat-Server.

GitHub Actions Cache ist kein dauerhaftes Transaktionsarchiv. Wird er gelöscht oder verdrängt, fehlen frühere virtuelle Positionen und Versandinformationen. Für dauerhaften Betrieb eine persistente Zustandsdatei auf einem eigenen Dienst verwenden. Ein Neustart interpretiert einen bereits laufenden Trend nicht als frischen Cross: dafür werden die beiden letzten geschlossenen Kerzen verglichen.

## Fehler finden

| Fehler | Prüfung |
| --- | --- |
| `401` von Telegram | Bot-Token prüfen bzw. beim BotFather erneuern. |
| `403` von Telegram | Bot blockiert oder keine Berechtigung im Zielchat. |
| `400: chat not found` | Chat-ID und gestarteten Chat prüfen. |
| Webhook-Konflikt / `409` | Nur einen Empfänger verwenden; Polling und Webhook können nicht parallel laufen. Diagnose entfernt keine Webhooks automatisch. |
| `disabled_inactivity` auf GitHub | Den betreffenden Workflow wieder aktivieren. |
| Marktdaten fehlen oder Zeitüberschreitung | Der Lauf bleibt fehlgeschlagen statt ein erfundenes Signal zu senden; nächsten Lauf und Quellenerreichbarkeit prüfen. |
| Zustand nicht lesbar | Zustandsdatei prüfen. Beschädigte Daten werden nicht still durch einen leeren Zustand ersetzt. |

Die im Juli 2026 protokollierte Fehlerkette war `CryptoCompare 401 → Binance 451`; der Bot brach vor dem Telegram-Versand ab. Er nutzt jetzt die [offizielle öffentliche Marktdaten-Schnittstelle](https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md), ohne CryptoCompare-Schlüssel und ohne Zugriff auf ein Börsenkonto.

## Tests

```powershell
node --test tests/*.test.cjs
```

Die Tests verwenden simulierte Telegram-Antworten. Sie senden keine echten Nachrichten und verändern keine produktiven Zustandsdateien.
