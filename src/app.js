const express = require("express");
const dbRoutes = require("./routes/dbRoutes");
const aiRoutes = require("./routes/airoutes");

const app = express();
app.use(express.json());
app.use("/", dbRoutes);
app.use("/ai", aiRoutes);
module.exports = app;