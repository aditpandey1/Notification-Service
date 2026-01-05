function isTimeoutOrNetworkError(error) {
  return (
    !error.response || // no HTTP response
    [
      "ETIMEDOUT",
      "ESOCKETTIMEDOUT",
      "ECONNRESET",
      "ENOTFOUND",
      "EAI_AGAIN",
    ].includes(error.code)
  );
}
module.exports = { isTimeoutOrNetworkError };
