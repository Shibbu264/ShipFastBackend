const express = require("express");

const { connectDatabase, getQueryLogs,runAllCronJobs } = require("../controllers/dbController");
const authenticateJWT = require("../middlewares/auth");

const router = express.Router();

router.post("/connect-db", connectDatabase);
router.get("/query-logs", authenticateJWT, getQueryLogs);
router.post("/test-collect-logs",runAllCronJobs);

module.exports = router;
