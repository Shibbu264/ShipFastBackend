const express = require("express");
const { streamGeneration, generateResponse, analyzeQuery } = require("../controllers/aiController");
const authenticateJWT = require("../middlewares/auth");
// Public endpoint; add auth if needed

const router = express.Router();

// Handle preflight OPTIONS request
router.options("/stream", (req, res) => {
  res.status(200).end();
});

router.options("/generate", (req, res) => {
  res.status(200).end();
});

router.options("/analyze-query", (req, res) => {
  res.status(200).end();
});

router.post("/stream", authenticateJWT, streamGeneration);
router.post("/generate", generateResponse);
router.post("/analyze-query", authenticateJWT, analyzeQuery);

module.exports = router; 