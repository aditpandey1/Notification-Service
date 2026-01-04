const express = require("express");
const router = express.Router();
const sendNotification = require("../controllers/sendNotification");
const listNotification = require("../controllers/listNotifications")

router.post("/notifications", sendNotification);
router.get('/notifications', listNotification);

module.exports = router;
