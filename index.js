const express = require('express');
const mineflayer = require('mineflayer');

// 1. Konfigurasi diletakkan di PALING ATAS agar tidak terjadi error hoisting
const MC_CONFIG = {
  host: process.env.MC_HOST || '162.55.80.246',
  port: parseInt(process.env.MC_PORT, 10) || 10790,
  username: process.env.MC_USERNAME || 'nonstop',
  version: process.env.MC_VERSION || '1.20.1', // Versi server Minecraft
  auth: process.env.MC_AUTH || 'offline',
  pin: process.env.MC_PIN || '2111', // PIN AuthMe kamu
  autoAttack: process.env.AUTO_ATTACK !== 'false', // default aktif
  attackIntervalMs: parseInt(process.env.ATTACK_INTERVAL_MS, 10) || 1000
};

const app = express();
const PORT = process.env.PORT || 8000;

// State status bot untuk monitoring web
const botState = {
  status: 'initializing',
  connected: false,
  authenticated: false,
  lastSpawn: null,
  reconnectCount: 0,
  autoAttack: true
};

// Web Endpoint untuk Uptime & Health Check (Render/UptimeRobot)
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

let bot = null;
let afkInterval = null;
let attackInterval = null;
let reconnectTimeout = null;
let intentionalDisconnect = false;

function cleanup() {
  intentionalDisconnect = true;
  if (afkInterval) {
    clearInterval(afkInterval);
    afkInterval = null;
  }
  if (attackInterval) {
    clearInterval(attackInterval);
    attackInterval = null;
  }
  if (bot) {
    try {
      if (bot._client) {
        bot._client.on('error', () => {});
      }
      bot.end();
    } catch {
      // Abaikan error saat cleanup socket
    }
    bot = null;
  }
  botState.connected = false;
  botState.authenticated = false;
  botState.status = 'disconnected';
  intentionalDisconnect = false;
}

// Hanya serang monster musuh (tidak membunuh ayam/sapi/kambing ternak)
const HOSTILE_MOBS = new Set([
  'zombie', 'skeleton', 'creeper', 'spider', 'cave_spider', 'enderman',
  'witch', 'phantom', 'pillager', 'ravager', 'evoker', 'vindicator',
  'blaze', 'wither_skeleton', 'piglin_brute', 'slime', 'magma_cube',
  'drowned', 'husk', 'stray'
]);

function startAutoAttack() {
  if (attackInterval) clearInterval(attackInterval);
  botState.autoAttack = true;
  console.log(`[BOT] Auto-attack diaktifkan (interval: ${MC_CONFIG.attackIntervalMs}ms).`);

  attackInterval = setInterval(() => {
    if (!bot || !bot.entity) return;

    // Cari monster musuh terdekat dalam jarak 3.5 blok
    const target = bot.nearestEntity((entity) => {
      return (
        entity.name &&
        HOSTILE_MOBS.has(entity.name.toLowerCase()) &&
        entity.position.distanceTo(bot.entity.position) <= 3.5
      );
    });

    if (target) {
      bot.attack(target);
    }
  }, MC_CONFIG.attackIntervalMs);
}

function stopAutoAttack() {
  if (attackInterval) {
    clearInterval(attackInterval);
    attackInterval = null;
  }
  botState.autoAttack = false;
  console.log('[BOT] Auto-attack dinonaktifkan.');
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

// Fungsi eksekusi AuthMe
function handleAuthMe(action) {
  if (!bot) return;

  if (action === 'register') {
    console.log('[AUTH] Menjalankan /register *** ***');
    bot.chat(`/register ${MC_CONFIG.pin} ${MC_CONFIG.pin}`);
  } else if (action === 'login') {
    console.log('[AUTH] Menjalankan /login ***');
    bot.chat(`/login ${MC_CONFIG.pin}`);
  }
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
      // Abaikan
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

    // 1. Eksekusi AuthMe saat spawn (coba login & register sekaligus)
    setTimeout(() => {
      // Coba register dulu (jika belum terdaftar), lalu login
      handleAuthMe('register');
      setTimeout(() => {
        handleAuthMe('login');
        botState.authenticated = true;
      }, 1000);
    }, 1500);

    // 2. Cegah kick AFK tiap 20 detik (lompat kecil)
    if (afkInterval) clearInterval(afkInterval);
    afkInterval = setInterval(() => {
      if (!bot || !bot.entity) return;
      bot.setControlState('jump', true);
      setTimeout(() => {
        if (bot) bot.setControlState('jump', false);
      }, 350);
    }, 20000);

    // 3. Aktifkan auto-attack setelah bot masuk sepenuhnya
    if (MC_CONFIG.autoAttack) {
      setTimeout(() => {
        startAutoAttack();
      }, 3000);
    }
  });

  // Listener pesan dari server (Deteksi AuthMe via chat)
  bot.on('messagestr', (message) => {
    const rawMsg = message.toLowerCase();

    // Sembunyikan PIN dari console log jika server memantulkan kembali chat login
    const sanitizedLog = message.replace(new RegExp(MC_CONFIG.pin, 'g'), '***');
    console.log(`[CHAT/SERVER] ${sanitizedLog}`);

    // Jika server meminta /register
    if (rawMsg.includes('/register') || rawMsg.includes('daftar')) {
      if (!botState.authenticated) {
        handleAuthMe('register');
      }
    }

    // Jika server meminta /login
    if (rawMsg.includes('/login') || rawMsg.includes('masuk')) {
      if (!botState.authenticated) {
        handleAuthMe('login');
      }
    }

    // Indikasi sukses login AuthMe
    if (rawMsg.includes('successful') || rawMsg.includes('berhasil masuk') || rawMsg.includes('logged in')) {
      botState.authenticated = true;
      console.log('[AUTH] Terautentikasi penuh dengan AuthMe!');
    }
  });

  // Perintah interaktif pemain via chat
  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    const cmd = message.toLowerCase().trim();

    if (cmd === '!ping') {
      bot.chat('pong!');
    } else if (cmd === '!attack on') {
      startAutoAttack();
      bot.chat('Auto-attack aktif!');
    } else if (cmd === '!attack off') {
      stopAutoAttack();
      bot.chat('Auto-attack dinonaktifkan.');
    } else if (cmd === '!status') {
      bot.chat(`Status: ${botState.status} | Auth: ${botState.authenticated ? 'YES' : 'NO'} | Attack: ${botState.autoAttack ? 'ON' : 'OFF'}`);
    }
  });

  bot.on('kicked', (reason) => {
    console.log('[BOT] Kena kick:', reason);
    botState.status = 'kicked';
    scheduleReconnect(15000);
  });

  bot.on('end', (reason) => {
    if (intentionalDisconnect) return;
    console.log(`[BOT] Terputus (${reason}).`);
    scheduleReconnect(10000);
  });

  bot.on('error', (err) => {
    console.log('[BOT] Error:', err.message);
    scheduleReconnect(10000);
  });

  if (bot._client) {
    bot._client.on('error', (err) => {
      console.log('[CLIENT] Socket error:', err.message);
    });
  }
}

// Mencegah crash jika terjadi socket reset mendadak
process.on('uncaughtException', (err) => {
  console.error('[SYSTEM] Uncaught Exception:', err.message);
});

process.on('SIGTERM', () => {
  console.log('[SYSTEM] SIGTERM diterima, mematikan bot...');
  cleanup();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[SYSTEM] SIGINT diterima, mematikan bot...');
  cleanup();
  process.exit(0);
});

startBot();
