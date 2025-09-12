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
  const m = getModel(model || "gemini-1.5-flash");
  const result = await m.generateContentStream({
    systemInstruction: system,
    contents: [
      ...(Array.isArray(history) ? history : []),
      { role: "user", parts: [{ text: prompt }] }
    ]
  });

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}

module.exports = { streamTextChunks };