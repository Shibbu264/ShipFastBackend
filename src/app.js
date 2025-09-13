const express = require("express");
const cors = require("cors");
const dbRoutes = require("./routes/dbRoutes");
const aiRoutes = require("./routes/airoutes");
const alertRoutes = require("./routes/alertQueryRoutes");

const app = express();

// Configure CORS to allow requests from frontend URL in environment variables
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:3000", // Default to localhost:3000 if not set
  credentials: true, // Allow cookies and authorization headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
};

app.use(cors(corsOptions));
app.use(express.json());
app.use("/ai", aiRoutes);
app.use("/db", dbRoutes);
app.use("/api/alerts", alertRoutes);
module.exports = app;