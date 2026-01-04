const { pool } = require("../db/pg");
const listNotification = async (req, res) => {
  const client = await pool.connect();
  const { status, page = "1", limit = "10" } = req.query;

  if (!status) res.status(400).json({ error: "can't fetch without status" });

  try {
    const query =
      "SELECT * FROM notifications WHERE status=$1 LIMIT $2 OFFSET $3";
    const result = await client.query(query, [
      status,
      limit,
      (page - 1) * limit,
    ]);
    res.status(200).json({
      data: result?.rows,
    });
  } catch (err) {
    res.status(500).json({
      error: "Intrenal Server Erorr",
    });
  }
};

module.exports = listNotification;
