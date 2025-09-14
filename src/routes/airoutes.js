const express = require("express");
const { streamGeneration, generateResponse, analyzeQuery } = require("../controllers/aiController");
const authenticateJWT = require("../middlewares/auth");
const cacheService = require("../services/cacheService");
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

router.options("/cache/invalidate", (req, res) => {
  res.status(200).end();
});

router.options("/cache/stats", (req, res) => {
  res.status(200).end();
});

router.post("/stream", authenticateJWT, streamGeneration);
router.post("/generate", generateResponse);
router.post("/analyze-query", authenticateJWT, analyzeQuery);

// Cache management endpoints
router.post("/cache/invalidate", authenticateJWT, async (req, res) => {
  try {
    const { username } = req.user;
    const success = await cacheService.invalidateUserCache(username);
    
    res.json({
      success,
      message: success ? "Cache invalidated successfully" : "Failed to invalidate cache"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to invalidate cache",
      details: error.message
    });
  }
});

router.get("/cache/stats", authenticateJWT, async (req, res) => {
  try {
    const stats = await cacheService.getCacheStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to get cache stats",
      details: error.message
    });
  }
});

module.exports = router; 