const express = require("express");
const { streamGeneration, generateResponse } = require("../controllers/aiController");
// Public endpoint; add auth if needed

const router = express.Router();

// Handle preflight OPTIONS request
router.options("/stream", (req, res) => {
  res.status(200).end();
});

router.options("/generate", (req, res) => {
  res.status(200).end();
});

router.post("/stream", streamGeneration);
router.post("/generate", generateResponse);

module.exports = router; 