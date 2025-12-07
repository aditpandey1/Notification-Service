require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { enqueueNotification } = require('../services/enqueueService');

const app = express();
app.use(bodyParser.json());

app.post('/api/v1/notifications', async (req, res) => {
  try {
    const { type, recipient, payload, scheduledAt, maxAttempts } = req.body;
    // basic validation
    if (!type || !recipient || !payload) {
      return res.status(400).json({ error: 'type, recipient and payload are required' });
    }
    const notif = await enqueueNotification({
      type,
      recipient,
      payload,
      scheduledAt,
      maxAttempts
    });
    res.status(201).json({ id: notif.id, status: notif.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

module.exports = app;
