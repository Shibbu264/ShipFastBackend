const express = require("express");
const { connectDatabase, getQueryLogs, testCollectLogs } = require("../controllers/dbController");
const authenticateJWT = require("../middlewares/auth");

const router = express.Router();

router.post("/connect-db", connectDatabase);
router.get("/query-logs", authenticateJWT, getQueryLogs);
router.post("/test-collect-logs", testCollectLogs);

module.exports = router;
