require('dotenv').config();
const { Worker, Queue } = require('bullmq');
const { pool } = require('../db/pg');

const connection = { host: process.env.REDIS_HOST || '127.0.0.1', port: process.env.REDIS_PORT || 6379 };
const queue = new Queue('notifications', { connection });

const worker = new Worker('notifications', async job => {
  const { notificationId } = job.data;
  const client = await pool.connect();
  try {
    // fetch current notification
    const { rows } = await client.query('SELECT * FROM notifications WHERE id=$1', [notificationId]);
    const notif = rows[0];
    if (!notif) return;

    // guard: if already delivered, skip
    if (notif.status === 'delivered') return;

    // mark in progress & increment attempts
    await client.query('UPDATE notifications SET status=$1, attempts=attempts+1, updated_at=now() WHERE id=$2', ['in_progress', notificationId]);

    // MOCK send: simulate success/failure
    const success = Math.random() > 0.2; // 80% success
    if (success) {
      await client.query('UPDATE notifications SET status=$1, updated_at=now() WHERE id=$2', ['delivered', notificationId]);
      await client.query('INSERT INTO notification_events (notification_id, event_type) VALUES ($1,$2)', [notificationId, 'delivered']);
    } else {
      // write failed event
      await client.query('INSERT INTO notification_events (notification_id, event_type, error_message) VALUES ($1,$2,$3)', [notificationId, 'failed', 'mock failure']);
      const newAttempts = notif.attempts + 1;
      if (newAttempts >= notif.max_attempts) {
        await client.query('UPDATE notifications SET status=$1, updated_at=now() WHERE id=$2', ['dead', notificationId]);
      } else {
        await client.query('UPDATE notifications SET status=$1, attempts=$2, updated_at=now() WHERE id=$3', ['failed', newAttempts, notificationId]);
        // re-enqueue with simple fixed delay (replace with exponential later)
        const delay = 5000 * Math.pow(2, newAttempts); // simple backoff
        await queue.add('send', { notificationId }, { delay });
      }
    }
  } finally {
    client.release();
  }
}, { connection });

worker.on('completed', job => {
  console.log('Job completed', job.id);
});
worker.on('failed', (job, err) => {
  console.error('Job failed', job?.id, err);
});
