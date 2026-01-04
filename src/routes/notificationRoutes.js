const express = require("express");
const router = express.Router();
const sendNotification = require("../controllers/sendNotification");
const listNotification = require("../controllers/listNotifications");
const { retryNotification } = require("../controllers/retryNotification");
const { validateApiKey } = require("../middlewares/apiKey.middleware");

router.post("/notifications", sendNotification);
router.get("/notifications", validateApiKey, listNotification);
router.post("/notifications/:id/retry", validateApiKey, retryNotification);

module.exports = router;
