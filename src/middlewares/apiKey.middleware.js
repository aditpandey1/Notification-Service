require("dotenv").config();
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Invalid API Key" });
  }
  next();
};

module.exports = { validateApiKey };
