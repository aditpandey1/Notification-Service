// src/utils/retry.js
function calcBackoffDelayMs(attempts) {
  const base = 1000; // 1s base
  const cap = 60 * 60 * 1000; // max 1 hour
  const jitter = Math.floor(Math.random() * 1000); // up to 1s jitter
  const delay = Math.min(cap, base * Math.pow(2, attempts - 1)) + jitter;
  return delay;
}

module.exports = { calcBackoffDelayMs };
