const redis = require("../redis");

const WINDOW_SIZE = 60;
const MAX_REQUESTS = 100;

module.exports = async function ipRateLimit(req, res, next) {
  try {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;

    const key = `rate_limit:ip:${ip}`;

    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, WINDOW_SIZE);
    }

    if (current > MAX_REQUESTS) {
      return res.status(429).json({
        error: "Too many requests. Please try again later.",
      });
    }

    next();
  } catch (err) {
    next();
  }
};
