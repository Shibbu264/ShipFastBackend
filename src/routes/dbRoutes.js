const express = require("express");

const {
  connectDatabase,
  getQueryLogs,
  runAllCronJobs,
  getDashboardData,
  topKSlowQueries,
  analyzeQueries,
  generateSuggestions,
} = require("../controllers/dbController");
const authenticateJWT = require("../middlewares/auth");

const router = express.Router();

router.post("/connect-db", connectDatabase);
router.get("/query-logs", authenticateJWT, getQueryLogs);
router.get("/metric-data", authenticateJWT, getDashboardData);
router.post("/top-k-slow-queries", authenticateJWT, topKSlowQueries);
router.get("/get-insights", authenticateJWT, analyzeQueries);
router.post("/generate-suggestions", generateSuggestions);
router.post("/runAllCronJobs", runAllCronJobs);

module.exports = router;
