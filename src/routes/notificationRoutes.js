const express = require("express");
const router = express.Router();
const sendNotification = require("../controllers/sendNotification");
const listNotification = require("../controllers/listNotifications")
const {retryNotification} = require("../controllers/retryNotification")

router.post("/notifications", sendNotification);
router.get('/notifications', listNotification);
router.post('/notifications/:id/retry', retryNotification);

module.exports = router;
