const express = require("express");

const {
  connectDatabase,
  getQueryLogs,
  runAllCronJobs,
  getDashboardData,
  topKSlowQueries,
} = require("../controllers/dbController");
const authenticateJWT = require("../middlewares/auth");

const router = express.Router();

router.post("/connect-db", connectDatabase);
router.get("/query-logs", authenticateJWT, getQueryLogs);
router.get("/metric-data", authenticateJWT, getDashboardData);
router.post("/top-k-slow-queries", authenticateJWT, topKSlowQueries);
router.post("/runAllCronJobs", runAllCronJobs);

module.exports = router;
