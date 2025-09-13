let GoogleGenerativeAI;
let client;

// Initialize the Google Generative AI client
async function initializeGemini() {
  if (!client) {
    const { GoogleGenerativeAI: GAI } = await import("@google/generative-ai");
    GoogleGenerativeAI = GAI;
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set in environment.");
    }
    
    client = new GoogleGenerativeAI(apiKey);
  }
  return client;
}

class GeminiService {
  constructor() {
    this.client = null;
  }

  /**
   * Initialize the client if not already done
   */
  async ensureInitialized() {
    if (!this.client) {
      this.client = await initializeGemini();
    }
  }

  /**
   * Get a model instance
   * @param {string} model - Model name (default: "gemini-2.5-pro")
   * @returns {GenerativeModel}
   */
  async getModel(model = "gemini-2.5-pro") {
    await this.ensureInitialized();
    return this.client.getGenerativeModel({ model });
  }

  /**
   * Generate a complete response (non-streaming) - internal method
   * @param {Object} options
   * @param {string} options.prompt - User prompt
   * @param {string} [options.system] - System prompt/instruction
   * @param {Array} [options.history] - Chat history in Gemini format
   * @param {string} [options.model] - Model name
   * @returns {Promise<string>} Complete response text
   */
  async _generateResponse({ prompt, system, history = [], model }) {
    try {
      const m = await this.getModel(model);
      
      const requestData = {
        systemInstruction: system,
        contents: [
          ...(Array.isArray(history) ? history : []),
          { role: "user", parts: [{ text: prompt }] }
        ]
      };
      
      const result = await m.generateContent(requestData);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error("Error in _generateResponse:", error);
      throw error;
    }
  }

  /**
   * Stream text chunks for Server-Sent Events
   * @param {Object} options
   * @param {string} options.prompt - User prompt
   * @param {string} [options.system] - System prompt/instruction
   * @param {Array} [options.history] - Chat history in Gemini format
   * @param {string} [options.model] - Model name
   * @returns {AsyncGenerator<string>} Yields text chunks
   */
  async* streamTextChunks({ prompt, system, history = [], model }) {
    try {
      const m = await this.getModel(model);
      
      const requestData = {
        systemInstruction: system,
        contents: [
          ...(Array.isArray(history) ? history : []),
          { role: "user", parts: [{ text: prompt }] }
        ]
      };
      
      const result = await m.generateContentStream(requestData);
      
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) yield text;
      }
    } catch (error) {
      console.error("Error in streamTextChunks:", error);
      throw error;
    }
  }

  /**
   * Generate response with system prompt and actual prompt
   * @param {string} systemPrompt - System prompt/instruction
   * @param {string} prompt - User prompt
   * @param {Object} [options] - Additional options
   * @param {Array} [options.history] - Chat history
   * @param {string} [options.model] - Model name
   * @param {boolean} [options.stream] - Whether to stream response
   * @returns {Promise<string>|AsyncGenerator<string>} Response or stream
   */
  async generateResponse(systemPrompt, prompt, options = {}) {
    const { history = [], model, stream = false } = options;
    
    if (stream) {
      return this.streamTextChunks({ 
        prompt, 
        system: systemPrompt, 
        history, 
        model 
      });
    } else {
      return this._generateResponse({ 
        prompt, 
        system: systemPrompt, 
        history, 
        model 
      });
    }
  }
}

// Create and export a singleton instance
const gemini = new GeminiService();

module.exports = gemini;
