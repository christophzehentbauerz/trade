/**
 * Quick Test Script - Get your Chat ID
 * This will send you a test message and help you find your Chat ID
 */

const https = require('https');

const BOT_TOKEN = '8373288870:AAFjnJdqdXGrMgyjVJjPNFT0YBtC7sz4lMA';

console.log('🔍 Getting recent messages from your bot...\n');

// Get updates to find chat ID
https.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const response = JSON.parse(data);

            if (!response.ok) {
                console.error('❌ Error:', response.description);
                return;
            }

            if (response.result.length === 0) {
                console.log('⚠️  Keine Nachrichten gefunden!');
                console.log('\n📱 WICHTIG: Gehe zu Telegram und:');
                console.log('   1. Suche nach: @Tradeeebtcjetztbot');
                console.log('   2. Klicke START oder schreib /start');
                console.log('   3. Schreib eine beliebige Nachricht (z.B. "Hi")');
                console.log('   4. Führe dieses Script nochmal aus\n');
                return;
            }

            console.log('✅ Nachrichten gefunden!\n');

            // Get unique chat IDs
            const chatIds = new Set();
            response.result.forEach(update => {
                if (update.message && update.message.chat) {
                    chatIds.add(update.message.chat.id);
                    console.log('👤 User:', update.message.from.first_name);
                    console.log('💬 Message:', update.message.text);
                    console.log('🆔 CHAT ID:', update.message.chat.id);
                    console.log('---');
                }
            });

            if (chatIds.size > 0) {
                const chatId = Array.from(chatIds)[0];
                console.log(`\n✅ DEINE CHAT ID: ${chatId}`);
                console.log('\n📋 Kopiere diese Chat ID und verwende sie für den Bot!\n');

                // Send test message
                sendTestMessage(chatId);
            }

        } catch (e) {
            console.error('❌ Fehler beim Parsen:', e.message);
        }
    });
}).on('error', (e) => {
    console.error('❌ Netzwerkfehler:', e.message);
});

function sendTestMessage(chatId) {
    const message = '✅ <b>Bot Test erfolgreich!</b>\n\nDein BTC Signal Bot ist einsatzbereit! 🚀\n\n📊 Du bekommst Nachrichten wenn:\n• LONG Signal erscheint 🟢\n• SHORT Signal erscheint 🔴\n• Signal zurück auf NEUTRAL ⚪';

    const data = JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
    });

    const options = {
        hostname: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };

    const req = https.request(options, (res) => {
        if (res.statusCode === 200) {
            console.log('📨 Test-Nachricht gesendet! Check dein Telegram! ✅\n');
        }
    });

    req.on('error', (e) => console.error('Fehler beim Senden:', e.message));
    req.write(data);
    req.end();
}
