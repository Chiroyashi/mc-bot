const express = require('express');
const mineflayer = require('mineflayer');
const app = express();

// Web server kecil agar Koyeb / Render mendeteksi aplikasi dalam keadaan 'Healthy'
const PORT = process.env.PORT || 8000;
app.get('/', (req, res) => {
  res.send('Bot Minecraft 24 Jam Aktif!');
});
app.listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`);
});

// Konfigurasi Server Minecraft Kamu
const MC_CONFIG = {
  host: '163.5.201.2', // Contoh: 'myserver.freemcserver.net'
  port: 12546,             // Ganti dengan port servermu (angka)
  username: 'BotPenjaga24Jam',
  version: '1.20.1'           // Auto-detect versi Minecraft
};

function startBot() {
  console.log(`[BOT] Menghubungkan ke ${MC_CONFIG.host}:${MC_CONFIG.port}...`);

  const bot = mineflayer.createBot({
    host: MC_CONFIG.host,
    port: MC_CONFIG.port,
    username: MC_CONFIG.username,
    version: MC_CONFIG.version
  });

  bot.on('login', () => {
    console.log('[BOT] Berhasil masuk ke server Minecraft!');
  });

  bot.on('spawn', () => {
    console.log('[BOT] Karakter sudah spawn di world.');
    // Lompat tiap 15 detik agar tidak di-kick oleh sistem anti-AFK
    setInterval(() => {
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 400);
    }, 15000);
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
