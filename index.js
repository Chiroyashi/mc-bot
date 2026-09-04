const express = require('express');
const mineflayer = require('mineflayer');

const app = express();
const PORT = process.env.PORT || 8000;

// State status bot untuk monitoring web
const botState = {
  status: 'initializing',
  connected: false,
  lastSpawn: null,
  reconnectCount: 0
};

app.get('/', (req, res) => {
  res.json({
    message: 'Bot Minecraft 24 Jam Aktif!',
    server: `${MC_CONFIG.host}:${MC_CONFIG.port}`,
    username: MC_CONFIG.username,
    ...botState,
    uptime: Math.floor(process.uptime()) + 's'
  });
});

app.listen(PORT, () => {
  console.log(`[HTTP] Web server listening on port ${PORT}`);
});

// Konfigurasi dinamis via Environment Variable (Render / .env) dengan default fallback
const MC_CONFIG = {
  host: process.env.MC_HOST || '162.55.80.246',
  port: parseInt(process.env.MC_PORT, 10) || 10790,
  username: process.env.MC_USERNAME || 'nonstop',
  version: process.env.MC_VERSION || '1.19.2',
  auth: process.env.MC_AUTH || 'offline',
  password: process.env.MC_PASSWORD || '' // jika server butuh /login <password>
};

let bot = null;
let afkInterval = null;
let reconnectTimeout = null;

function cleanup() {
  if (afkInterval) {
    clearInterval(afkInterval);
    afkInterval = null;
  }
  if (bot) {
    bot.removeAllListeners();
    bot = null;
  }
  botState.connected = false;
  botState.status = 'disconnected';
}

function scheduleReconnect(delay = 10000) {
  if (reconnectTimeout) return;
  cleanup();
  botState.reconnectCount++;
  console.log(`[BOT] Menghubungkan ulang dalam ${delay / 1000} detik (Percobaan ke-${botState.reconnectCount})...`);
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    startBot();
  }, delay);
}

function startBot() {
  cleanup();
  console.log(`[BOT] Menghubungkan ke ${MC_CONFIG.host}:${MC_CONFIG.port} sebagai ${MC_CONFIG.username}...`);
  botState.status = 'connecting';

  bot = mineflayer.createBot({
    host: MC_CONFIG.host,
    port: MC_CONFIG.port,
    username: MC_CONFIG.username,
    version: MC_CONFIG.version,
    auth: MC_CONFIG.auth,
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
    } catch {
      // Abaikan error penulisan stream
    }
  });

  bot.on('login', () => {
    console.log('[BOT] Berhasil login ke server Minecraft!');
    botState.status = 'logged_in';
  });

  bot.on('spawn', () => {
    console.log('[BOT] Karakter sudah spawn di world.');
    botState.connected = true;
    botState.status = 'online';
    botState.lastSpawn = new Date().toISOString();

    // Login otomatis jika server mewajibkan authme (/login <password>)
    if (MC_CONFIG.password) {
      setTimeout(() => {
        bot.chat(`/login ${MC_CONFIG.password}`);
      }, 1500);
    }

    // Cegah kick AFK tiap 20 detik
    if (afkInterval) clearInterval(afkInterval);
    afkInterval = setInterval(() => {
      if (!bot || !bot.entity) return;
      bot.setControlState('jump', true);
      setTimeout(() => {
        if (bot) bot.setControlState('jump', false);
      }, 350);
    }, 20000);
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    console.log(`[CHAT] ${username}: ${message}`);

    // Perintah sederhana
    if (message.toLowerCase() === '!ping') {
      bot.chat('pong!');
    }
  });

  bot.on('kicked', (reason) => {
    console.log('[BOT] Kena kick:', reason);
    botState.status = 'kicked';
    scheduleReconnect(15000);
  });

  bot.on('end', (reason) => {
    console.log(`[BOT] Terputus (${reason}).`);
    scheduleReconnect(10000);
  });

  bot.on('error', (err) => {
    console.log('[BOT] Error:', err.message);
    scheduleReconnect(10000);
  });
}

// Graceful shutdown untuk Render / container restart
process.on('SIGTERM', () => {
  console.log('[SYSTEM] SIGTERM diterima, menutup bot...');
  cleanup();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[SYSTEM] SIGINT diterima, menutup bot...');
  cleanup();
  process.exit(0);
});

startBot();
