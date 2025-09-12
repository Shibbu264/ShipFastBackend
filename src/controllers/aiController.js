const { streamTextChunks } = require("../services/gemini");

/**
 * POST /ai/stream
 * Body: { prompt: string, system?: string, model?: string, history?: Array }
 * Streams Server-Sent Events: { text: string } chunks, then a final 'done' event.
 */
async function streamGeneration(req, res) {
  const { prompt, system, model, history } = req.body || {};

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "prompt is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // Optional heartbeat to keep connections alive on some proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch (_) {}
  }, 15000);

  try {
    for await (const text of streamTextChunks({ prompt, system, history, model })) {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.write(`event: done\ndata: {}\n\n`);
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}

module.exports = { streamGeneration };