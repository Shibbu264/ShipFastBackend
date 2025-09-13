const express = require("express");
const { streamGeneration } = require("../controllers/aiController");
// Public endpoint; add auth if needed

const router = express.Router();

// Handle preflight OPTIONS request
router.options("/stream", (req, res) => {
  res.status(200).end();
});

router.post("/stream", streamGeneration);

module.exports = router; 