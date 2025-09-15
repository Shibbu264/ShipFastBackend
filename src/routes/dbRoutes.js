const express = require("express");

const {
  connectDatabase,
  getQueryLogs,
  runAllCronJobs,
  getDashboardData,
  topKSlowQueries,
  getAllQueries,
  analyzeQueries,
  generateSuggestions,
  testTableDataCollectionEndpoint,
  getQueryLogById,
  compareQueries,
} = require("../controllers/dbController");
const authenticateJWT = require("../middlewares/auth");

const router = express.Router();

router.post("/connect-db", connectDatabase);
router.get("/query-logs", authenticateJWT, getQueryLogs);
router.get("/metric-data", authenticateJWT, getDashboardData);
router.post("/top-k-slow-queries", authenticateJWT, topKSlowQueries);
router.get("/get-all-queries", authenticateJWT, getAllQueries);
router.get("/get-insights", authenticateJWT, analyzeQueries);
router.post("/generate-suggestions", generateSuggestions);
router.post("/runAllCronJobs", runAllCronJobs);
router.post("/test-table-data-collection", testTableDataCollectionEndpoint);
router.get("/query-log/:queryId", authenticateJWT, getQueryLogById);
router.post("/compare-queries", authenticateJWT, compareQueries);

module.exports = router;
