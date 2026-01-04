require("dotenv").config();
const { Worker, Queue } = require("bullmq");
const { pool } = require("../db/pg");
const { calcBackoffDelayMs } = require("../utils/retry");

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
};
const queue = new Queue("notifications", { connection });

const worker = new Worker(
  "notifications",
  async (job) => {
    const { notificationId } = job.data;
    const client = await pool.connect();
    try {
      // fetch current notification
      // 1️⃣ atomic claim
      const { rows } = await client.query(
        `
  UPDATE notifications
  SET status='in_progress',
      attempts=attempts+1,
      updated_at=now()
  WHERE id=$1 AND status IN ('queued','failed')
  RETURNING *
  `,
        [notificationId]
      );

      const notif = rows[0];
      if (!notif) return;

      // 2️⃣ scheduling guard
      if (
        notif.next_attempt_at &&
        new Date(notif.next_attempt_at) > new Date()
      ) {
        const remaining = new Date(notif.next_attempt_at) - Date.now();
        await queue.add("send", { notificationId }, { delay: remaining });
        await client.query("UPDATE notifications SET status=$1 WHERE id=$2", [
          "failed",
          notificationId,
        ]);
        return;
      }

      // 3️⃣ safe to send now

      // MOCK send: simulate success/failure

      const success = Math.random() > 0.2; // 80% success

      if (success) {
        await client.query(
          "UPDATE notifications SET status=$1, updated_at=now() WHERE id=$2",
          ["delivered", notificationId]
        );
        await client.query(
          "INSERT INTO notification_events (notification_id, event_type) VALUES ($1,$2)",
          [notificationId, "delivered"]
        );
      } else {
        const newAttempts = notif.attempts;
        const errorMsg = "provider failed: ..."; // real provider error
        if (newAttempts >= notif.max_attempts) {
          await client.query(
            "UPDATE notifications SET status=$1, attempts=$2, last_error=$3, updated_at=now() WHERE id=$4",
            ["dead", newAttempts, errorMsg, notificationId]
          );
          await client.query(
            "INSERT INTO notification_events (notification_id, event_type, error_message) VALUES ($1,$2,$3)",
            [notificationId, "dlq", errorMsg]
          );
        } else {
          const delay = calcBackoffDelayMs(newAttempts);
          const nextAttemptAt = new Date(Date.now() + delay);
          await client.query(
            "UPDATE notifications SET status=$1, attempts=$2, last_error=$3, next_attempt_at=$4, updated_at=now() WHERE id=$5",
            ["failed", newAttempts, errorMsg, nextAttemptAt, notificationId]
          );
          // requeue with delay
          await queue.add("send", { notificationId }, { delay });
          await client.query(
            "INSERT INTO notification_events (notification_id, event_type, error_message) VALUES ($1,$2,$3)",
            [notificationId, "retry", errorMsg]
          );
        }
      }
    } finally {
      client.release();
    }
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log("Job completed", job.id);
});
worker.on("failed", (job, err) => {
  console.error("Job failed", job?.id, err);
});
