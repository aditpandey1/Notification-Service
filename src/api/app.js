require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const ipRateLimit = require("../middlewares/ipRateLimit");
const app = express();
const routes = require("../routes/notificationRoutes");
app.use(bodyParser.json());

app.use("/api/v1", routes);

app.get("/health", ipRateLimit, (req, res) => res.json({ ok: true }));

module.exports = app;
