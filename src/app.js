const express = require("express");
const dbRoutes = require("./routes/dbRoutes");

const app = express();
app.use(express.json());
app.use("/api/db", dbRoutes);

module.exports = app;