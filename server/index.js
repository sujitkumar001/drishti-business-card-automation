const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.API_KEY || '';
const app = express();

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '256kb' }));

let whatsappReady = false;

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'business-card-engine',
    dataPath: process.env.WWEBJS_AUTH_PATH || './.wwebjs_auth'
  }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', (qr) => {
  whatsappReady = false;
  console.log('\nScan this QR code with the WhatsApp account used by the engine:\n');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => console.log('[WhatsApp] Authenticated.'));

client.on('ready', () => {
  whatsappReady = true;
  console.log('[WhatsApp] Client ready.');
});

client.on('auth_failure', (message) => {
  whatsappReady = false;
  console.error('[WhatsApp] Authentication failure:', message);
});

client.on('disconnected', (reason) => {
  whatsappReady = false;
  console.warn('[WhatsApp] Disconnected:', reason);
});

function requireApiKey(req, res, next) {
  if (!API_KEY) return next(); // Convenient for LAN development only.
  if (req.get('x-api-key') !== API_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized.' });
  }
  next();
}

function normalizePhoneForWhatsApp(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    throw new Error('Invalid phone number.');
  }
  return `${digits}@c.us`;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, whatsappReady });
});

app.post('/api/send-greeting', requireApiKey, async (req, res) => {
  try {
    if (!whatsappReady) {
      return res.status(503).json({
        ok: false,
        error: 'WhatsApp client is not ready. Check server QR/authentication state.'
      });
    }

    const { phone, customMessage, mediaUrl } = req.body || {};
    if (!phone || !customMessage || typeof customMessage !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'phone and customMessage are required.'
      });
    }

    if (customMessage.length > 4000) {
      return res.status(400).json({ ok: false, error: 'Message is too long.' });
    }

    const chatId = normalizePhoneForWhatsApp(phone);

    // Validate that WhatsApp recognizes the destination before sending.
    const numberId = await client.getNumberId(chatId.replace('@c.us', ''));
    if (!numberId) {
      return res.status(404).json({
        ok: false,
        error: 'The destination number is not registered on WhatsApp.'
      });
    }

    await client.sendMessage(numberId._serialized, customMessage);

    if (mediaUrl) {
      if (!isHttpUrl(mediaUrl)) {
        return res.status(400).json({
          ok: false,
          error: 'mediaUrl must be an HTTP(S) URL reachable by the server.'
        });
      }

      const media = await MessageMedia.fromUrl(mediaUrl, {
        unsafeMime: false
      });
      await client.sendMessage(numberId._serialized, media);
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('[send-greeting]', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unexpected server error.'
    });
  }
});

app.use((_req, res) => res.status(404).json({ ok: false, error: 'Not found.' }));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[HTTP] Listening on http://0.0.0.0:${PORT}`);
});

async function shutdown(signal) {
  console.log(`[System] ${signal} received. Shutting down...`);
  server.close();
  try {
    await client.destroy();
  } catch (error) {
    console.error('[System] WhatsApp shutdown error:', error);
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.initialize().catch((error) => {
  console.error('[WhatsApp] Initialization failed:', error);
});
