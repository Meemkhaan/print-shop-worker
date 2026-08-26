import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleWebhook } from './handler.js';
import { loadPrices } from './prices.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.raw({ type: 'application/json' }));

const PRICES = loadPrices(path.join(__dirname, 'prices.json'));

app.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    const secret = process.env.WEBHOOK_SECRET;

    if (secret && signature) {
      const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
      if (signature !== expected) {
        console.warn('Invalid webhook signature');
        return res.status(401).send('Invalid signature');
      }
    }

    const payload = JSON.parse(req.body.toString());
    await handleWebhook(payload, PRICES);

    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).send('Error');
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Worker listening on port ${PORT}`);
});