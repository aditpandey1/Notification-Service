require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const routes = require("../routes/notificationRoutes");
app.use(bodyParser.json());

app.use("/api/v1", routes);

app.get("/health", (req, res) => res.json({ ok: true }));

module.exports = app;
