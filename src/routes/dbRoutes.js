const express = require("express");
const { connectDatabase, getQueryLogs } = require("../controllers/dbController");
const authenticateJWT = require("../middleware/auth");

const router = express.Router();

router.post("/connect-db", connectDatabase);
router.get("/query-logs", authenticateJWT, getQueryLogs);

module.exports = router;
