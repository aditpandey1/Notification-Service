require("dotenv").config();
const { Worker, Queue } = require("bullmq");
const { pool } = require("../db/pg");
const { calcBackoffDelayMs } = require("../utils/retry");
const { sendEmail } = require("../providerService/email.service");
const { isTimeoutOrNetworkError } = require("../utils/isTimeoutError");

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

      if (notif?.provider_message_id) {
        await client.query(
          "UPDATE notifications SET status=$1, updated_at=now() WHERE id=$2",
          ["delivered", notificationId]
        );
        await client.query(
          "INSERT INTO notification_events (notification_id, event_type) VALUES ($1,$2)",
          [notificationId, "delivered"]
        );
        return;
      }

      let success = false;
      let providerMessageId = null;
      let errorMessage = null;
      let badRequest = false;
      try {
        providerMessageId = await sendEmail(
          notif.recipient.email,
          notif.payload.subject,
          notif.payload.body,
          notificationId
        );
        await client.query(
          "UPDATE notifications SET provider_message_id=$1 WHERE id=$2",
          [providerMessageId, notificationId]
        );
        success = true;
      } catch (error) {
        success = false;
        errorMessage =
          error?.response?.body?.errors?.[0]?.message ||
          error?.message ||
          "provider failed: ...";
        if (
          !isTimeoutOrNetworkError(error) &&
          error?.response?.statusCode !== 429 &&
          (error?.response?.statusCode < 500 ||
            error?.response?.statusCode >= 600)
        ) {
          badRequest = true;
        }
      }
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
        if (newAttempts >= notif.max_attempts || badRequest) {
          await client.query(
            "UPDATE notifications SET status=$1, attempts=$2, last_error=$3, updated_at=now() WHERE id=$4",
            ["dead", newAttempts, errorMessage, notificationId]
          );
          await client.query(
            "INSERT INTO notification_events (notification_id, event_type, error_message) VALUES ($1,$2,$3)",
            [notificationId, "dlq", errorMessage]
          );
        } else {
          const delay = calcBackoffDelayMs(newAttempts);
          const nextAttemptAt = new Date(Date.now() + delay);
          await client.query(
            "UPDATE notifications SET status=$1, attempts=$2, last_error=$3, next_attempt_at=$4, updated_at=now() WHERE id=$5",
            ["failed", newAttempts, errorMessage, nextAttemptAt, notificationId]
          );
          // requeue with delay
          await queue.add("send", { notificationId }, { delay });
          await client.query(
            "INSERT INTO notification_events (notification_id, event_type, error_message) VALUES ($1,$2,$3)",
            [notificationId, "retry", errorMessage]
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
