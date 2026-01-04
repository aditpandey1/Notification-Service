const { pool } = require("../db/pg");
const { Queue } = require("bullmq");
const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
};
let isUUID;

(async () => {
  const uuid = await import("uuid");
  isUUID = uuid.validate;
})();

const queue = new Queue("notifications", { connection });
const retryNotification = async (req, res) => {
  const client = await pool.connect();
  const { id: notificationId } = req.params;
  if (!notificationId || !isUUID(notificationId))
    return res.status(400).json({
      error: "ID is Invalid or not present",
    });

  try {
    const query =
      "UPDATE NOTIFICATIONS SET attempts=$1, status=$2, next_attempt_at=$3, updated_at=now(),last_error=NULL WHERE id=$4 RETURNING *;";
    const { rows } = await client.query(query, [
      0,
      "queued",
      new Date(),
      notificationId,
    ]);

    if (rows.length == 0) {
      return res.status(404).json({
        error: `The ${notificationId} is not present in the database or it is already delivered`,
      });
    }

    await queue.add("send", { notificationId });
    res.status(200).json({
      id: rows[0]?.id,
      status: rows[0]?.status,
    });
  } catch (err) {
    res.status(500).json({
      error: err,
    });
  }
};
module.exports = { retryNotification };
