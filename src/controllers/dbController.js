const prisma = require("../config/db");
const gemini = require("../config/gemini");
const { runSuggestionAnalysis } = require("../jobs/suggestionAnalyzer");
const { categorizeQueryPerformance, getSeverityLevel } = require("../utils/queryCategorizer");

// Debug: Check if prisma is properly loaded
console.log("Prisma client loaded:", !!prisma);
console.log(
  "Prisma client methods:",
  prisma ? Object.keys(prisma) : "undefined"
);
const { encrypt } = require("../utils/encryption");
const { generateToken } = require("../utils/jwt");
const { Client } = require("pg");
const { parse } = require("pg-connection-string");
const { collectLogs } = require("../jobs/queryCollector");
const { testTableDataCollection } = require("./collectTableDataController");

async function testDBConnection({ host, port, dbName, username, password }) {
  const client = new Client({
    host,
    port,
    database: dbName,
    user: username,
    password,
  });
  try {
    await client.connect();
    const res = await client.query(
      "SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements';"
    );
    return res.rowCount > 0;
  } catch (err) {
    console.error("DB Connection failed:", err.message);
    return false;
  } finally {
    await client.end();
  }
}

// For parsing Postgres URLs safely

async function connectDatabase(req, res) {
  const { url, database_url, host, port, dbType, username, password, dbName } =
    req.body;

  let dbConfig = {};
  try {
    if (url) {
      // Parse database_url if provided
      if (!database_url) {
        return res
          .status(400)
          .json({ error: "database_url is required when url = true" });
      }
      const parsed = parse(database_url);
      // { host, port, database, user, password }

      // Validate parsed connection string
      if (
        !parsed ||
        !parsed.host ||
        !parsed.database ||
        !parsed.user ||
        !parsed.password
      ) {
        return res.status(400).json({
          error:
            "Invalid database URL format. Missing required fields: host, database, user, or password",
        });
      }

      dbConfig = {
        host: parsed.host,
        port: parsed.port || 5432, // Default PostgreSQL port
        dbType: "postgresql", // infer type from url
        dbName: parsed.database,
        username: parsed.user,
        password: parsed.password,
      };
    } else {
      // Use standard format
      if (!host || !port || !dbType || !username || !password || !dbName) {
        return res
          .status(400)
          .json({ error: "Missing required database credentials" });
      }
      dbConfig = { host, port, dbType, dbName, username, password };
    }

    // Test DB connection first
    const hasAccess = await testDBConnection(dbConfig);

    // Encrypt password
    const encryptedPass = encrypt(dbConfig.password);

    // Create or find mock user with specific ID
    let user = await prisma.user.findUnique({
      where: { id: "shivu264" },
    });
    if (!user) {
      user = await prisma.user.create({
        data: { id: "shivu264" },
      });
    }

    // Use findFirst instead of findUnique
    let dbEntry = await prisma.userDB.findFirst({
      where: { username: dbConfig.username },
    });

    if (dbEntry) {
      // Update existing entry
      dbEntry = await prisma.userDB.update({
        where: { id: dbEntry.id },
        data: {
          userId: user.id,
          host: dbConfig.host,
          port: Number(dbConfig.port),
          dbType: dbConfig.dbType,
          dbName: dbConfig.dbName,
          passwordEncrypted: encryptedPass,
          monitoringEnabled: hasAccess,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new entry
      dbEntry = await prisma.userDB.create({
        data: {
          userId: user.id,
          host: dbConfig.host,
          port: Number(dbConfig.port),
          dbType: dbConfig.dbType,
          dbName: dbConfig.dbName,
          username: dbConfig.username,
          passwordEncrypted: encryptedPass,
          monitoringEnabled: hasAccess,
        },
      });
    }

    // Generate JWT with fixed userId and username
    const token = generateToken({
      userId: "shivu264",
      username: dbConfig.username,
    });

    res.json({
      token,
      monitoringEnabled: hasAccess,
      dbName: dbEntry.dbName,
      username: dbEntry.username,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to connect database" + err.message });
  }
}

async function getQueryLogs(req, res) {
  console.log("getQueryLogs called with req.user:");

  // Check if req.user exists
  if (!req?.user) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  // First find the UserDB by username
  const userDb = await prisma.userDB.findUnique({
    where: { username: req.user.username },
  });

  if (!userDb) {
    return res.status(404).json({ error: "Database connection not found" });
  }

  const logs = await prisma.queryLog.findMany({
    where: { userDbId: userDb.id },
    orderBy: { collectedAt: "desc" },
    take: 100,
  });
  res.json(logs);
}

async function topKSlowQueries(req, res) {
  // First find the UserDB by username
  const userDb = await prisma.userDB.findUnique({
    where: { username: req.user.username },
  });

  if (!userDb) {
    return res.status(404).json({ error: "Database connection not found" });
  }

  // Get k parameter from request body, default to 10 if not provided
  const { k = 10 } = req.body;

  // Validate k parameter
  if (typeof k !== "number" || k <= 0) {
    return res
      .status(400)
      .json({ error: "Invalid k parameter. Must be a positive number." });
  }

  // Get all query logs and sort by meanTimeMs in descending order
  const logs = await prisma.queryLog.findMany({
    where: { userDbId: userDb.id },
    orderBy: { meanTimeMs: "desc" },
    take: k,
  });

  // Transform logs to the required format
  const formattedLogs = logs.map((log, index) => {
      // Use centralized severity calculation
      const severity = getSeverityLevel(log.meanTimeMs);

    return {
      id: log.id,
      query: log.query,
      avgTime: Math.round(log.meanTimeMs),
      frequency: log.calls,
      severity: severity,
    };
  });

  res.json({
    logs: formattedLogs,
  });
}

async function getDashboardData(req, res) {
  const userDb = await prisma.userDB.findUnique({
    where: { username: req.user.username },
  });

  if (!userDb) {
    return res.status(404).json({ error: "Database connection not found" });
  }

  const logs = await prisma.queryLog.findMany({
    where: { userDbId: userDb.id },
    orderBy: { collectedAt: "desc" },
  });

  const totalQueries = logs.length;

  const totalCalls = logs.reduce((sum, log) => sum + log.calls, 0);
  const totalTimeMs = logs.reduce((sum, log) => sum + log.totalTimeMs, 0);
  const avgLatencyMs = totalCalls > 0 ? totalTimeMs / totalCalls : 0;

  // Count slow queries (>500ms mean time) - matching the severity logic from topKSlowQueries
  const slowQueries = logs.filter((log) => log.meanTimeMs > 500).length;

  res.json({
    totalQueries,
    avgLatency: Math.round(avgLatencyMs), // Round to nearest integer
    slowQueries,
  });
}

async function runAllCronJobs(req, res) {
  try {
    await collectLogs();
    await runSuggestionAnalysis();
    res.json({ message: "All cron jobs completed successfully" });
  } catch (error) {
    console.error("Error in cron jobs:", error);
    res
      .status(500)
      .json({ error: "Failed to run cron jobs", details: error.message });
  }
}

/**
 * POST /generate-suggestions
 * Manually trigger suggestion analysis
 */
async function generateSuggestions(req, res) {
  try {
    await runSuggestionAnalysis();
    res.json({ message: "Suggestion analysis completed successfully" });
  } catch (error) {
    console.error("Error in generateSuggestions:", error);
    res.status(500).json({
      error: "Failed to generate suggestions",
      details: error.message,
    });
  }
}

/**
 * GET /get-all-queries
 * Gets all queries from QueryLog in the same format as topKSlowQueries
 */
async function getAllQueries(req, res) {
  try {
    // First find the UserDB by username
    const userDb = await prisma.userDB.findUnique({
      where: { username: req.user.username },
    });

    if (!userDb) {
      return res.status(404).json({ error: "Database connection not found" });
    }

    // Get all query logs for this userDb
    const logs = await prisma.queryLog.findMany({
      where: { userDbId: userDb.id },
      orderBy: { meanTimeMs: "desc" },
    });

    // Transform logs to the required format (same as topKSlowQueries)
    const formattedLogs = logs.map((log, index) => {
      // Use centralized severity calculation
      const severity = getSeverityLevel(log.meanTimeMs);

      return {
        id: log.id, // Use actual database ID
        query: log.query,
        avgTime: Math.round(log.meanTimeMs), // Round to nearest integer
        frequency: log.calls,
        severity: severity,
      };
    });

    res.json({
      logs: formattedLogs,
      count: formattedLogs.length,
    });
  } catch (error) {
    console.error("Error in getAllQueries:", error);
    res.status(500).json({
      error: "Failed to fetch queries",
      details: error.message,
    });
  }
}

/**
 * GET /get-insights
 * Fetches pre-computed top 3 suggestions from the database
 */
async function analyzeQueries(req, res) {
  try {
    const userDb = await prisma.userDB.findUnique({
      where: { username: req.user.username },
    });

    if (!userDb) {
      return res.status(404).json({ error: "Database connection not found" });
    }

    // Get the top 3 suggestions for this userDb
    const suggestions = await prisma.top3Suggestions.findUnique({
      where: { userDbId: userDb.id },
      include: { userDb: true },
    });

    // Trigger suggestion analysis asynchronously (non-blocking)
    runSuggestionAnalysis().catch((error) => {
      console.error("Background suggestion analysis failed:", error);
    });

    if (!suggestions) {
      return res.json({
        suggestions: [],
        message:
          "No suggestions available yet. Suggestions are generated every 10 minutes.",
        lastUpdated: null,
      });
    }

    res.json({
      suggestions: suggestions.suggestions,
      lastUpdated: suggestions.updatedAt,
      message: "Top 3 database optimization suggestions",
    });
  } catch (error) {
    console.error("Error in analyzeQueries:", error);
    res.status(500).json({
      error: "Failed to fetch suggestions",
      details: error.message,
    });
  }
}

async function testTableDataCollectionEndpoint(req, res) {
  try {
    const result = await testTableDataCollection();
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        error: result.error || "Unknown error"
      });
    }
  } catch (error) {
    console.error("Error in test table data collection:", error);
    res.status(500).json({
      success: false,
      error: "Failed to test table data collection",
      details: error.message
    });
  }
}

/**
 * Format query log data for user-friendly display
 */
function formatQueryForUser(queryLog) {
  const severity = queryLog.meanTimeMs > 500 ? 'Critical' : 
                  queryLog.meanTimeMs > 300 ? 'Warning' : 'Healthy';
  
  
  return {
    // Basic Info
    queryId: queryLog.id,
    queryPreview: queryLog.query.substring(0, 150) + (queryLog.query.length > 150 ? '...' : ''),
    fullQuery: queryLog.query,
    
    // Performance Summary
    performance: {
      averageTime: `${Math.round(queryLog.meanTimeMs)}ms`,
      frequency: `${queryLog.calls} times`,
      totalImpact: `${Math.round(queryLog.totalTimeMs / 1000)}s`,
      severity: severity,
      threshold: queryLog.meanTimeMs > 500 ? '> 500ms' : 
                queryLog.meanTimeMs > 300 ? '> 300ms' : '≤ 300ms',
      minTime: `${Math.round(queryLog.minTimeMs)}ms`,
      maxTime: `${Math.round(queryLog.maxTimeMs)}ms`
    },
    
    // Data Info
    data: {
      type: queryLog.queryType,
      mainTable: queryLog.firstTable || 'Unknown',
      rowsReturned: queryLog.rowsReturned,
      collectedAt: queryLog.collectedAt
    },
    
    // Health Status
    health: getQueryHealthStatus(queryLog)
  };
}

/**
 * Get query health status based on performance metrics
 */
function getQueryHealthStatus(queryLog) {
  const isCritical = queryLog.meanTimeMs > 500;
  const isWarning = queryLog.meanTimeMs > 300;
  const isFrequent = queryLog.calls > 100;
  
  if (isCritical && isFrequent) {
    return {
      status: 'Critical',
      message: 'This query is very slow and runs frequently',
      recommendation: 'Urgent: Optimize this query immediately',
      priority: 'High'
    };
  } else if (isCritical) {
    return {
      status: 'High',
      message: 'This query is very slow but not frequent',
      recommendation: 'High priority: Consider optimizing this query',
      priority: 'High'
    };
  } else if (isWarning) {
    return {
      status: 'Warning',
      message: 'This query is moderately slow',
      recommendation: 'Monitor this query and consider optimization',
      priority: 'Medium'
    };
  } else {
    return {
      status: 'Healthy',
      message: 'This query is performing well',
      recommendation: 'No action needed',
      priority: 'Low'
    };
  }
}


/**
 * Get complete query log by query ID
 * GET /db/query-log/:queryId
 */
async function getQueryLogById(req, res) {
  try {
    const { queryId } = req.params;
    
    if (!queryId) {
      return res.status(400).json({
        success: false,
        error: "Query ID is required"
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
        id: queryId,
        userDbId: userDb.id 
      }
    });

    if (!queryLog) {
      return res.status(404).json({
        success: false,
        error: "Query not found or doesn't belong to your database"
      });
    }

    // Format query data for user-friendly display
    const userFriendlyData = formatQueryForUser(queryLog);
    
    // Return the user-friendly query details
    res.json({
      success: true,
      data: userFriendlyData
    });

  } catch (error) {
    console.error("Error in getQueryLogById:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get query log",
      details: error.message
    });
  }
}

/**
 * Compare two SQL queries by running EXPLAIN (FORMAT JSON) on both
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function compareQueries(req, res) {
  try {
    const { username } = req.user;
    const { query1, query2 } = req.body;

    // Validate input
    if (!query1 || !query2) {
      return res.status(400).json({ 
        error: "Both query1 and query2 are required" 
      });
    }

    // Get user's database connection
    const userDb = await prisma.userDB.findUnique({
      where: { username }
    });

    if (!userDb) {
      return res.status(404).json({ 
        error: "Database connection not found for user" 
      });
    }

    // Decrypt password and create database connection
    const { decrypt } = require("../utils/encryption");
    const password = decrypt(userDb.passwordEncrypted);
    
    const client = new Client({
      host: userDb.host,
      port: userDb.port,
      database: userDb.dbName,
      user: userDb.username,
      password
    });

    try {
      await client.connect();
      console.log(`Connected to database ${userDb.dbName} for query comparison`);

      // Run EXPLAIN (FORMAT JSON) on both queries
      let plan1 = null;
      let plan2 = null;
      let error1 = null;
      let error2 = null;

      try {
        // Clean the query by removing comments and normalizing whitespace
        const cleanQuery1 = query1
          .replace(/--.*$/gm, '') // Remove SQL comments
          .replace(/\s+/g, ' ')   // Replace multiple whitespace with single space
          .trim();
        console.log('Cleaned query1:', cleanQuery1);
        
        const explainResult1 = await client.query(`EXPLAIN (FORMAT JSON) ${cleanQuery1}`);
        console.log('Query1 EXPLAIN result:', JSON.stringify(explainResult1.rows, null, 2));
        
        // Try different ways to access the plan
        if (explainResult1.rows && explainResult1.rows.length > 0) {
          const row = explainResult1.rows[0];
          plan1 = row.query_plan || row['QUERY PLAN'] || row[0] || null;
        }
        console.log('Query1 extracted plan:', plan1);
      } catch (err) {
        console.error(`Error explaining query1:`, err.message);
        error1 = err.message;
      }

      try {
        // Clean the query by removing comments and normalizing whitespace
        const cleanQuery2 = query2
          .replace(/--.*$/gm, '') // Remove SQL comments
          .replace(/\s+/g, ' ')   // Replace multiple whitespace with single space
          .trim();
        console.log('Cleaned query2:', cleanQuery2);
        
        const explainResult2 = await client.query(`EXPLAIN (FORMAT JSON) ${cleanQuery2}`);
        console.log('Query2 EXPLAIN result:', JSON.stringify(explainResult2.rows, null, 2));
        
        // Try different ways to access the plan
        if (explainResult2.rows && explainResult2.rows.length > 0) {
          const row = explainResult2.rows[0];
          plan2 = row.query_plan || row['QUERY PLAN'] || row[0] || null;
        }
        console.log('Query2 extracted plan:', plan2);
      } catch (err) {
        console.error(`Error explaining query2:`, err.message);
        error2 = err.message;
      }

      // Return both plans with error information
      res.json({
        success: true,
        data: {
          query1: {
            sql: query1,
            plan: plan1,
            error: error1
          },
          query2: {
            sql: query2,
            plan: plan2,
            error: error2
          }
        }
      });

    } catch (dbError) {
      console.error(`Database error during query comparison:`, dbError);
      return res.status(500).json({ 
        error: "Failed to execute queries", 
        details: dbError.message 
      });
    } finally {
      await client.end();
    }

  } catch (error) {
    console.error("Error in compareQueries:", error);
    res.status(500).json({ 
      error: "Internal server error", 
      details: error.message 
    });
  }
}

module.exports = {
  connectDatabase,
  getQueryLogs,
  runAllCronJobs,
  getDashboardData,
  topKSlowQueries,
  getAllQueries,
  analyzeQueries,
  generateSuggestions,
  testTableDataCollectionEndpoint,
  getQueryLogById,
  compareQueries,
};
