const cron = require("node-cron");
const prisma = require("../config/db");
const gemini = require("../config/gemini");

/**
 * Gather comprehensive database metrics for analysis
 */
async function gatherDatabaseMetrics(userDbId) {
  try {
    // Get query performance data
    const queryLogs = await prisma.queryLog.findMany({
      where: { userDbId },
      orderBy: { meanTimeMs: "desc" },
      take: 20
    });

    // Get table usage statistics
    const tableUsages = await prisma.tableUsage.findMany({
      where: { userDbId },
      orderBy: { callCount: "desc" }
    });

    // Get table structures
    const tableStructures = await prisma.tableStructure.findMany({
      where: { userDbId }
    });

    // Get top slow queries
    const topSlowQueries = await prisma.topSlowQuery.findMany({
      where: { userDbId },
      orderBy: { meanTimeMs: "desc" },
      take: 10
    });

    // Calculate performance statistics
    const performanceStats = calculatePerformanceStats(queryLogs);
    
    // Analyze table relationships and usage patterns
    const tableAnalysis = analyzeTableUsage(tableUsages, tableStructures);

    return {
      hasData: queryLogs.length > 0 || tableStructures.length > 0,
      queryLogs,
      tableUsages,
      tableStructures,
      topSlowQueries,
      performanceStats,
      tableAnalysis,
      totalTables: tableStructures.length,
      totalQueries: queryLogs.length,
      avgQueryTime: performanceStats.avgQueryTime,
      slowestQuery: performanceStats.slowestQuery,
      mostUsedTables: tableAnalysis.mostUsedTables,
      unusedTables: tableAnalysis.unusedTables
    };
  } catch (error) {
    console.error("Error gathering database metrics:", error);
    return { hasData: false };
  }
}

/**
 * Calculate performance statistics from query logs
 */
function calculatePerformanceStats(queryLogs) {
  if (queryLogs.length === 0) {
    return {
      avgQueryTime: 0,
      slowestQuery: null,
      totalCalls: 0,
      totalTime: 0
    };
  }

  const totalCalls = queryLogs.reduce((sum, q) => sum + q.calls, 0);
  const totalTime = queryLogs.reduce((sum, q) => sum + q.totalTimeMs, 0);
  const avgQueryTime = totalTime / totalCalls;
  const slowestQuery = queryLogs[0]; // Already sorted by meanTimeMs desc

  return {
    avgQueryTime: Math.round(avgQueryTime),
    slowestQuery,
    totalCalls,
    totalTime: Math.round(totalTime)
  };
}

/**
 * Analyze table usage patterns
 */
function analyzeTableUsage(tableUsages, tableStructures) {
  const tableUsageMap = new Map();
  tableUsages.forEach(usage => {
    tableUsageMap.set(usage.tableName, usage);
  });

  const mostUsedTables = tableUsages
    .sort((a, b) => b.callCount - a.callCount)
    .slice(0, 5);

  const unusedTables = tableStructures.filter(table => 
    !tableUsageMap.has(table.tableName)
  );

  return {
    mostUsedTables,
    unusedTables,
    totalTableUsages: tableUsages.length
  };
}

/**
 * Generate fallback suggestions based on database metrics
 */
function generateFallbackSuggestions(dbMetrics) {
  const suggestions = [];
  
  // Suggestion 1: Based on query performance
  if (dbMetrics.performanceStats.avgQueryTime > 100) {
    suggestions.push({
      title: "Optimize Query Performance",
      description: `Average query time is ${dbMetrics.performanceStats.avgQueryTime}ms. Consider adding indexes and optimizing query structure.`,
      priority: "high",
      category: "query_optimization"
    });
  } else {
    suggestions.push({
      title: "Monitor Query Performance",
      description: "Set up comprehensive monitoring to track query performance and identify bottlenecks early.",
      priority: "medium",
      category: "monitoring"
    });
  }

  // Suggestion 2: Based on table usage
  if (dbMetrics.unusedTables.length > 0) {
    suggestions.push({
      title: "Clean Up Unused Tables",
      description: `Found ${dbMetrics.unusedTables.length} unused tables that can be removed to reduce storage overhead.`,
      priority: "low",
      category: "maintenance"
    });
  } else if (dbMetrics.tableAnalysis.mostUsedTables.length > 0) {
    suggestions.push({
      title: "Optimize Table Access Patterns",
      description: `Focus on optimizing the most frequently accessed tables: ${dbMetrics.tableAnalysis.mostUsedTables.slice(0, 3).map(t => t.tableName).join(', ')}.`,
      priority: "medium",
      category: "table_optimization"
    });
  } else {
    suggestions.push({
      title: "Review Database Schema",
      description: "Analyze table structures and relationships to identify optimization opportunities.",
      priority: "medium",
      category: "schema_design"
    });
  }

  // Suggestion 3: General database health
  if (dbMetrics.totalTables > 10) {
    suggestions.push({
      title: "Consider Table Partitioning",
      description: `With ${dbMetrics.totalTables} tables, consider partitioning large tables to improve performance and maintenance.`,
      priority: "low",
      category: "partitioning"
    });
  } else {
    suggestions.push({
      title: "Review Database Configuration",
      description: "Review and optimize database configuration settings for better performance.",
      priority: "low",
      category: "configuration"
    });
  }

  return suggestions;
}

/**
 * Analyze whole database and generate top 3 suggestions using AI
 */
async function analyzeAndUpdateSuggestions() {
  console.log("🔍 Starting comprehensive database analysis...");
  
  try {
    // Get all UserDBs that have monitoring enabled
    const userDbs = await prisma.userDB.findMany({ 
      where: { monitoringEnabled: true } 
    });

    for (const userDb of userDbs) {
      try {
        console.log(`📊 Analyzing database for userDb: ${userDb.username}`);
        
        // Get comprehensive database metrics
        const dbMetrics = await gatherDatabaseMetrics(userDb.id);
        
        if (!dbMetrics.hasData) {
          console.log(`✅ No data found for analysis of ${userDb.username}`);
          continue;
        }

        // System prompt for comprehensive database analysis
        const systemPrompt = `You are a database performance expert. Analyze the provided comprehensive database metrics and provide exactly 3 specific, actionable recommendations for optimization.
Don't analyze queries related to create or system queries.
Return your response as a JSON array with exactly 3 objects, each containing:
- "title": A brief title for the suggestion
- "description": Detailed explanation of the issue and solution
- "priority": "high", "medium", or "low"
- "category": One of "indexing", "query_optimization", "schema_design", "configuration", "monitoring", "table_optimization", "partitioning", "maintenance", or "capacity_planning"

Focus on:
1. Missing indexes and index optimization
2. Query structure and performance issues  
3. Table usage patterns and optimization
4. Schema design improvements
5. Database configuration tuning
6. Table partitioning opportunities
7. Maintenance and cleanup tasks
8. Capacity planning and resource optimization

Be specific and actionable. Example format:
[
  {
    "title": "Add Composite Index on User Table",
    "description": "The users table is heavily accessed but missing a composite index on (status, created_at) which would improve query performance by 60%.",
    "priority": "high",
    "category": "indexing"
  },
  {
    "title": "Partition Large Log Table",
    "description": "The query_logs table has 2M+ rows and should be partitioned by date to improve query performance and maintenance.",
    "priority": "medium", 
    "category": "partitioning"
  },
  {
    "title": "Clean Up Unused Tables",
    "description": "Remove 3 unused tables (temp_data, old_logs, backup_users) to reduce storage overhead and simplify maintenance.",
    "priority": "low",
    "category": "maintenance"
  }
]`;

        const analysisPrompt = `Please analyze this comprehensive database data and provide exactly 3 optimization recommendations in the specified JSON format:

${JSON.stringify(dbMetrics, null, 2)}`;

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
          // Fallback suggestions based on database metrics
          suggestions = generateFallbackSuggestions(dbMetrics);
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

        console.log(`✅ Updated comprehensive database suggestions for ${userDb.username}`);

      } catch (error) {
        console.error(`❌ Error analyzing database for ${userDb.username}:`, error.message);
      }
    }

    console.log("🎉 Comprehensive database analysis completed");
  } catch (error) {
    console.error("❌ Error in suggestion analysis:", error);
  }
}

/**
 * Start the cron job to run comprehensive database analysis every 20 minutes
 */
function startSuggestionCron() {
  // Run every 20 minutes: "*/20 * * * *"
  cron.schedule("*/20 * * * *", analyzeAndUpdateSuggestions);
  console.log("⏰ Comprehensive database analysis cron job started (every 20 minutes)");
}

/**
 * Manual trigger for testing comprehensive database analysis
 */
async function runSuggestionAnalysis() {
  await analyzeAndUpdateSuggestions();
}

module.exports = { 
  startSuggestionCron, 
  runSuggestionAnalysis,
  analyzeAndUpdateSuggestions 
};
