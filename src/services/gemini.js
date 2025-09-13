// Re-export from the centralized config
const gemini = require("../config/gemini");

// For backward compatibility, export the streamTextChunks function
// Bind the method to the instance to preserve 'this' context
const streamTextChunks = gemini.streamTextChunks.bind(gemini);

module.exports = { streamTextChunks };