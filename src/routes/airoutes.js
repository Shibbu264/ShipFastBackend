const express = require("express");
const { streamGeneration } = require("../controllers/aiController");
// Public endpoint; add auth if needed

const router = express.Router();

router.post("/stream", streamGeneration);

module.exports = router; 