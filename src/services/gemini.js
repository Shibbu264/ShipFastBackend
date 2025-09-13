// Re-export from the centralized config
const gemini = require("../config/gemini");

// For backward compatibility, export the streamTextChunks function
const { streamTextChunks } = gemini;

module.exports = { streamTextChunks };