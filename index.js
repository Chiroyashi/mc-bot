const express = require('express');
const mineflayer = require('mineflayer');
const app = express();

const PORT = process.env.PORT || 8000;
app.get('/', (req, res) => {
  res.send('Bot Minecraft 24 Jam Aktif!');
});
app.listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`);
});

const MC_CONFIG = {
  host: '163.5.201.2',
  port: 12546,
  username: 'BotPenjaga24Jam',
  version: '1.20.1'
};

function startBot() {
  console.log(`[BOT] Menghubungkan ke ${MC_CONFIG.host}:${MC_CONFIG.port}...`);

  const bot = mineflayer.createBot({
    host: MC_CONFIG.host,
    port: MC_CONFIG.port,
    username: MC_CONFIG.username,
    version: MC_CONFIG.version,
    checkTimeoutInterval: 60000
  });

  // Balas query paket kustom dari Fabric & owo-lib saat handshake
  bot._client.on('custom_payload', (packet) => {
    try {
      if (packet.channel && (packet.channel.includes('owo') || packet.channel.includes('fabric'))) {
        bot._client.write('custom_payload', {
          channel: packet.channel,
          data: Buffer.alloc(0)
        });
      }
    } catch (err) {
      // Abaikan error penulisan stream
    }
  });

  bot.on('login', () => {
    console.log('[BOT] Berhasil masuk ke server Minecraft!');
  });

  bot.on('spawn', () => {
    console.log('[BOT] Karakter sudah spawn di world.');
    // Cegah kick AFK tiap 20 detik
    setInterval(() => {
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 350);
    }, 20000);
  });

  bot.on('end', (reason) => {
    console.log(`[BOT] Terputus (${reason}). Reconnecting dalam 10 detik...`);
    setTimeout(startBot, 10000);
  });

  bot.on('error', (err) => {
    console.log('[BOT] Error:', err.message);
  });
}

startBot();
