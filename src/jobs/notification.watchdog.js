require("dotenv").config();
const { Queue } = require("bullmq");
const { pool } = require("../db/pg");
const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
};
const queue = new Queue("notifications", { connection });

async function notificationWatchdog() {
  const client = await pool.connect();
  try {
    const query =
      "SELECT * from notifications where status ='in_progress' AND updated_at < now() - INTERVAL '10 minutes'";
    const { rows } = await client.query(query);

    for (const row of rows) {
      if (row.provider_message_id) {
        await client.query(
          "UPDATE notifications SET status=$1, updated_at=now() WHERE id=$2",
          ["delivered", row.id]
        );
        await client.query(
          "INSERT INTO notification_events (notification_id, event_type) VALUES ($1,$2)",
          [row.id, "delivered"]
        );
      } else {
        await client.query(
          "UPDATE notifications SET status=$1, updated_at=now() WHERE id=$2",
          ["queued", row.id]
        );
        await queue.add("send", { notificationId: row.id }, { delay: 0 });
      }
    }
  } catch (error) {
    console.error(error);
  } finally {
    client.release();
  }
}

notificationWatchdog()
  .then(() => {
    console.log("Notification watchdog completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
