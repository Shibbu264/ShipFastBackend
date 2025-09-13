const { streamTextChunks } = require("../services/gemini");
const gemini = require("../config/gemini");

/**
 * POST /ai/stream
 * Body: { prompt: string, system?: string, model?: string, history?: Array }
 * Streams Server-Sent Events: { text: string } chunks, then a final 'done' event.
 */
async function streamGeneration(req, res) {
  console.log("🚀 streamGeneration called with body:", req.body);
  const { prompt, system, model, history } = req.body || {};

  if (!prompt || typeof prompt !== "string") {
    console.log("❌ Invalid prompt:", prompt);
    return res.status(400).json({ error: "prompt is required" });
  }
  
  console.log("✅ Request validated, starting stream...");

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.flushHeaders?.();

  // Track if response is still writable
  let isActive = true;
  
  // Handle client disconnect - but don't be too aggressive
  req.on('close', () => {
    console.log("🔌 Client connection closed");
    setTimeout(() => {
      isActive = false;
    }, 100); // Small delay to allow for normal SSE behavior
  });

  req.on('aborted', () => {
    console.log("🔌 Client connection aborted");
    isActive = false;
  });
  
  console.log("🔗 Connection state - isActive:", isActive, "res.destroyed:", res.destroyed, "res.writable:", res.writable);

  // Removed heartbeat as it might interfere with streaming

  try {
    // Send initial connection confirmation
    if (isActive && res.writable && !res.destroyed) {
      res.write(": connected\n\n");
    }

    for await (const text of streamTextChunks({ prompt, system, history, model })) {
      // Only check if response is still writable, ignore connection events
      if (res.destroyed || !res.writable) {
        console.log("⚠️ Response not writable, breaking");
        break;
      }
      try {
        const dataToSend = `data: ${JSON.stringify({ text })}\n\n`;
        console.log("📤 Sending chunk:", text.substring(0, 50) + "...");
        res.write(dataToSend);
        // Force flush the data immediately
        if (res.flush) res.flush();
      } catch (writeErr) {
        console.error('Write error:', writeErr);
        break;
      }
    }
    
    if (isActive && res.writable && !res.destroyed) {
      console.log("✅ Sending done event");
      res.write(`event: done\ndata: {}\n\n`);
    }
  } catch (err) {
    console.error('Stream error:', err);
    if (isActive && res.writable && !res.destroyed) {
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
      } catch (_) {
        // Response already closed
      }
    }
  } finally {
    if (!res.destroyed && res.writable) {
      try {
        res.end();
      } catch (_) {
        // Response already ended
      }
    }
  }
}

/**
 * POST /ai/generate
 * Body: { systemPrompt: string, prompt: string, model?: string, history?: Array }
 * Returns a complete response (non-streaming)
 */
async function generateResponse(req, res) {
  console.log("🚀 generateResponse called with body:", req.body);
  const { systemPrompt, prompt, model, history } = req.body || {};

  if (!prompt || typeof prompt !== "string") {
    console.log("❌ Invalid prompt:", prompt);
    return res.status(400).json({ error: "prompt is required" });
  }

  if (!systemPrompt || typeof systemPrompt !== "string") {
    console.log("❌ Invalid systemPrompt:", systemPrompt);
    return res.status(400).json({ error: "systemPrompt is required" });
  }
  
  console.log("✅ Request validated, generating response...");

  try {
    // Non-streaming response using the simplified Gemini service
    const response = await gemini.generateResponse(systemPrompt, prompt, { history, model });
    res.json({ 
      response,
      success: true 
    });
  } catch (error) {
    console.error("❌ Error in generateResponse:", error);
    res.status(500).json({ 
      error: "Failed to generate response", 
      details: error.message 
    });
  }
}

module.exports = { streamGeneration, generateResponse };