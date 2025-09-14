const { streamTextChunks } = require("../services/gemini");
const gemini = require("../config/gemini");
const prisma = require("../config/db");
const cacheService = require("../services/cacheService");

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

  // Get database context if user is authenticated
  let databaseContext = "";
  if (req.user && req.user.username) {
    try {
      // Try to get cached context first
      let context = await cacheService.getQueryContext(req.user.username);
      
      if (!context) {
        // Cache miss - build and cache new context
        console.log("🔄 Building fresh query context for user:", req.user.username);
        context = await cacheService.buildAndCacheQueryContext(req.user.username);
      } else {
        console.log("⚡ Using cached query context for user:", req.user.username);
      }

      databaseContext = context.databaseContext || "";
    } catch (contextError) {
      console.error("Error fetching database context:", contextError);
      // Continue without context if there's an error
    }
  }

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

    // Create system prompt for database expert
    const databaseSystemPrompt = `You are a database performance expert and optimization specialist. You have access to the user's specific database context including:

1. **Query Performance Data**: Recent slow queries with execution times, call counts, and performance metrics
2. **Table Structures**: Complete schema information including columns, data types, primary keys, foreign keys, and existing indexes
3. **Row Counts**: Current table sizes and data distribution

You can provide specific, actionable recommendations based on this real database context. You do NOT need to ask for more information - you already have everything needed to give expert database advice.

When analyzing queries, focus on:
- Missing indexes that would improve performance
- Query structure optimizations
- Join order improvements
- WHERE clause optimizations
- Specific SQL statements for fixes

Be direct and specific with your recommendations.`;

    // Combine system prompts
    const finalSystemPrompt = system ? `${databaseSystemPrompt}\n\n${system}` : databaseSystemPrompt;
    
    // Combine user prompt with database context
    const contextualPrompt = databaseContext + prompt;
    
    for await (const text of streamTextChunks({ prompt: contextualPrompt, system: finalSystemPrompt, history, model })) {
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

async function analyzeQuery(req, res) {
  try {
    // Get the query ID from request body
    const { id } = req.body;
    
    if (!id || typeof id !== "string") {
      return res.status(400).json({
        success: false,
        error: "Query ID is required and must be a string"
      });
    }

    // Find the UserDB by username
    const userDb = await prisma.userDB.findUnique({
      where: { username: req.user.username },
    });

    if (!userDb) {
      return res.status(404).json({ 
        success: false,
        error: "Database connection not found" 
      });
    }

    // Find the query log by ID and userDbId
    const queryLog = await prisma.queryLog.findFirst({
      where: { 
        id: id,
        userDbId: userDb.id 
      }
    });

    if (!queryLog) {
      return res.status(404).json({
        success: false,
        error: "Query not found or doesn't belong to your database"
      });
    }

    // Try to get cached context first, fallback to database query
    let context = await cacheService.getQueryContext(req.user.username);
    
    if (!context) {
      // Cache miss - build and cache new context
      console.log("🔄 Building fresh query context for analyzeQuery");
      context = await cacheService.buildAndCacheQueryContext(req.user.username);
    } else {
      console.log("⚡ Using cached query context for analyzeQuery");
    }

    const tableStructures = context.tableStructures || [];

    if (tableStructures.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No table structure data found. Please run table data collection first."
      });
    }

    // Prepare context data for LLM
    const contextData = {
      query: queryLog.query,
      queryStats: {
        calls: queryLog.calls,
        totalTimeMs: queryLog.totalTimeMs,
        meanTimeMs: queryLog.meanTimeMs,
        rowsReturned: queryLog.rowsReturned,
        collectedAt: queryLog.collectedAt
      },
      tables: tableStructures.map(t => ({
        tableName: t.tableName,
        columns: t.columns,
        primaryKeys: t.primaryKeys,
        foreignKeys: t.foreignKeys,
        indexes: t.indexes,
        rowCount: t.rowCount
      }))
    };

    // System prompt for query analysis
    const systemPrompt = `You are a database performance expert. Analyze the provided SQL query and table structures to provide optimization recommendations.
If the query is already optimized, return the query as it is.
Return your response as a JSON object with this exact structure:
{
  "success": true,
  "generalDescription": "Detailed analysis with numbered recommendations (use \\n\\n for line breaks)",
  "recommendedIndexes": [
    {
      "table": "table_name",
      "columns": "column1, column2",
      "priority": "High/Medium/Low",
      "description": "Brief description of the optimization",
      "sqlStatement": "CREATE INDEX statement"
    }
  ],
  "optimizedQuery": {
    "description": "Description of optimizations made",
    "sqlStatement": "Optimized SQL query"
  }
}

Focus on:
1. Missing indexes that would improve performance
2. Query structure optimizations
3. Join order improvements
4. WHERE clause optimizations
5. Specific, actionable recommendations

Be specific about table names, column names, and provide exact SQL statements.`;

    const analysisPrompt = `Please analyze this SQL query and provide optimization recommendations:

Query to analyze:
${contextData.query}

Query Performance Stats:
- Calls: ${contextData.queryStats.calls}
- Total Time: ${contextData.queryStats.totalTimeMs}ms
- Mean Time: ${contextData.queryStats.meanTimeMs}ms
- Rows Returned: ${contextData.queryStats.rowsReturned}
- Last Collected: ${contextData.queryStats.collectedAt}

Table structures and indexes:
${JSON.stringify(contextData.tables, null, 2)}

Provide your analysis in the exact JSON format specified.`;

    // Get AI analysis
    const analysisResponse = await gemini.generateResponse(systemPrompt, analysisPrompt, {
      model: "gemini-2.5-pro"
    });

    // Parse the JSON response
    let analysis;
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No valid JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      return res.status(500).json({
        success: false,
        error: "Failed to parse AI analysis response",
        details: parseError.message
      });
    }

    // Return the analysis
    res.json(analysis);

  } catch (error) {
    console.error("Error in analyzeQuery:", error);
    res.status(500).json({
      success: false,
      error: "Failed to analyze query",
      details: error.message
    });
  }
}

module.exports = { streamGeneration, generateResponse, analyzeQuery };