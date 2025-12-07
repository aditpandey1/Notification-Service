const { Queue } = require('bullmq');
const { pool } = require('../db/pg');

const connection = { host: process.env.REDIS_HOST || '127.0.0.1', port: process.env.REDIS_PORT || 6379 };
const queue = new Queue('notifications', { connection });

async function enqueueNotification({ type, recipient, payload, scheduledAt = null, maxAttempts = 5 }) {
  const client = await pool.connect();
  try {
    const insert = `INSERT INTO notifications (type, recipient, payload, max_attempts) VALUES ($1,$2,$3,$4) RETURNING *`;
    const { rows } = await client.query(insert, [type, recipient, payload, maxAttempts]);
    const notif = rows[0];

    const delay = scheduledAt ? Math.max(0, new Date(scheduledAt) - Date.now()) : 0;
    await queue.add('send', { notificationId: notif.id }, { delay });
    await client.query('UPDATE notifications SET status=$1 WHERE id=$2', ['queued', notif.id]);
    return notif;
  } finally {
    client.release();
  }
}

module.exports = { enqueueNotification, queue };
