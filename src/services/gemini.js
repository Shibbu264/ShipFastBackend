const { GoogleGenerativeAI } = require("@google/generative-ai");

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not set in environment.");
}

const client = new GoogleGenerativeAI(apiKey);

function getModel(model = "gemini-2.5-pro") {
  return client.getGenerativeModel({ model });
}

/**
 * Async generator yielding text chunks for SSE.
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.system]
 * @param {Array} [opts.history] - Optional chat history in Gemini format
 * @param {string} [opts.model]
 */
async function* streamTextChunks({ prompt, system, history = [], model }) {
  console.log("🔍 Starting streamTextChunks with:", { prompt, system, historyLength: history.length, model });
  
  try {
    const m = getModel(model || "gemini-2.5-pro");
    console.log("✅ Model initialized");
    
    const requestData = {
      systemInstruction: system,
      contents: [
        ...(Array.isArray(history) ? history : []),
        { role: "user", parts: [{ text: prompt }] }
      ]
    };
    console.log("📤 Request data:", JSON.stringify(requestData, null, 2));
    
    const result = await m.generateContentStream(requestData);
    console.log("📡 Stream started");

    for await (const chunk of result.stream) {
      const text = chunk.text();
      console.log("📦 Chunk received:", text ? text.substring(0, 50) + "..." : "empty");
      if (text) yield text;
    }
    console.log("✅ Stream completed");
  } catch (error) {
    console.error("❌ Error in streamTextChunks:", error);
    throw error;
  }
}

module.exports = { streamTextChunks };