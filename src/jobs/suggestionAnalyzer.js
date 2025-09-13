const cron = require("node-cron");
const prisma = require("../config/db");
const gemini = require("../config/gemini");

/**
 * Analyze slow queries and generate top 3 suggestions using AI
 */
async function analyzeAndUpdateSuggestions() {
  console.log("🔍 Starting suggestion analysis...");
  
  try {
    // Get all UserDBs that have monitoring enabled
    const userDbs = await prisma.userDB.findMany({ 
      where: { monitoringEnabled: true } 
    });

    for (const userDb of userDbs) {
      try {
        console.log(`📊 Analyzing suggestions for userDb: ${userDb.username}`);
        
        // Get slow queries for this userDb
        const slowQueries = await prisma.queryLog.findMany({
          where: { 
            userDbId: userDb.id,
            meanTimeMs: { gt: 1000 } // Queries slower than 1 second
          },
          orderBy: { meanTimeMs: "desc" },
          take: 10
        });

        if (slowQueries.length === 0) {
          console.log(`✅ No slow queries found for ${userDb.username}`);
          continue;
        }

        // Prepare query data for analysis
        const queryData = slowQueries.map(q => ({
          query: q.query,
          avgTime: Math.round(q.meanTimeMs),
          frequency: q.calls,
          totalTime: Math.round(q.totalTimeMs)
        }));

        // System prompt for structured suggestions
        const systemPrompt = `You are a database performance expert. Analyze the provided slow queries and provide exactly 3 specific, actionable recommendations for optimization.
Don't analyze query related to create or system queries.
Return your response as a JSON array with exactly 3 objects, each containing:
- "title": A brief title for the suggestion
- "description": Detailed explanation of the issue and solution
- "priority": "high", "medium", or "low"
- "category": One of "indexing", "query_optimization", "schema_design", "configuration", or "monitoring"

Focus on:
1. Missing indexes
2. Query structure issues  
3. Performance bottlenecks
4. Configuration improvements

Be specific and actionable. Example format:
[
  {
    "title": "Add Index on User Email",
    "description": "The query 'SELECT * FROM users WHERE email = ?' is missing an index on the email column, causing full table scans.",
    "priority": "high",
    "category": "indexing"
  },
  {
    "title": "Optimize JOIN Query",
    "description": "The complex JOIN query can be optimized by adding proper indexes and restructuring the WHERE clause.",
    "priority": "medium", 
    "category": "query_optimization"
  },
  {
    "title": "Enable Query Caching",
    "description": "Enable query result caching to reduce repeated expensive operations.",
    "priority": "low",
    "category": "configuration"
  }
]`;

        const analysisPrompt = `Please analyze these slow database queries and provide exactly 3 optimization recommendations in the specified JSON format:

${JSON.stringify(queryData, null, 2)}`;

        // Get AI suggestions
        const suggestionsResponse = await gemini.generateResponse(systemPrompt, analysisPrompt, {
          model: "gemini-2.5-pro"
        });

        // Parse the JSON response
        let suggestions;
        try {
          // Extract JSON from response (in case there's extra text)
          const jsonMatch = suggestionsResponse.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            suggestions = JSON.parse(jsonMatch[0]);
          } else {
            suggestions = JSON.parse(suggestionsResponse);
          }
        } catch (parseError) {
          console.error(`❌ Failed to parse suggestions for ${userDb.username}:`, parseError);
          // Fallback suggestions
          suggestions = [
            {
              title: "Review Query Performance",
              description: "Consider analyzing the slow queries and adding appropriate indexes.",
              priority: "high",
              category: "query_optimization"
            },
            {
              title: "Check Database Configuration",
              description: "Review database configuration settings for optimal performance.",
              priority: "medium",
              category: "configuration"
            },
            {
              title: "Monitor Query Patterns",
              description: "Set up monitoring to track query performance over time.",
              priority: "low",
              category: "monitoring"
            }
          ];
        }

        // Ensure we have exactly 3 suggestions
        if (!Array.isArray(suggestions) || suggestions.length !== 3) {
          console.warn(`⚠️ Expected 3 suggestions, got ${suggestions?.length || 0} for ${userDb.username}`);
          suggestions = suggestions?.slice(0, 3) || [];
        }

        // Upsert suggestions (update if exists, create if not)
        await prisma.top3Suggestions.upsert({
          where: { userDbId: userDb.id },
          update: {
            suggestions: suggestions,
            updatedAt: new Date()
          },
          create: {
            userDbId: userDb.id,
            suggestions: suggestions
          }
        });

        console.log(`✅ Updated suggestions for ${userDb.username}`);

      } catch (error) {
        console.error(`❌ Error analyzing suggestions for ${userDb.username}:`, error.message);
      }
    }

    console.log("🎉 Suggestion analysis completed");
  } catch (error) {
    console.error("❌ Error in suggestion analysis:", error);
  }
}

/**
 * Start the cron job to run every 20 minutes
 */
function startSuggestionCron() {
  // Run every 20 minutes: "*/20 * * * *"
  cron.schedule("*/20 * * * *", analyzeAndUpdateSuggestions);
  console.log("⏰ Suggestion analysis cron job started (every 20 minutes)");
}

/**
 * Manual trigger for testing
 */
async function runSuggestionAnalysis() {
  await analyzeAndUpdateSuggestions();
}

module.exports = { 
  startSuggestionCron, 
  runSuggestionAnalysis,
  analyzeAndUpdateSuggestions 
};
