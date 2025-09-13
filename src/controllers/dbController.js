const prisma = require("../config/db");
const gemini = require("../config/gemini");
const { runSuggestionAnalysis } = require("../jobs/suggestionAnalyzer");

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
    getQueryLogs()
    res.json({ token, monitoringEnabled: hasAccess,dbName:dbEntry.dbName,username:dbEntry.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to connect database" + err.message });
  }
}

async function getQueryLogs(req, res) {
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
    // Determine severity based on meanTimeMs
    let severity = "low";
    if (log.meanTimeMs > 1000) {
      severity = "high";
    } else if (log.meanTimeMs > 500) {
      severity = "medium";
    }

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
  const slowQueries = logs.filter((log) => log.meanTimeMs > 1000).length;

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
      details: error.message 
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
      include: { userDb: true }
    });

    if (!suggestions) {
      return res.json({ 
        suggestions: [],
        message: "No suggestions available yet. Suggestions are generated every 10 minutes.",
        lastUpdated: null
      });
    }

    res.json({
      suggestions: suggestions.suggestions,
      lastUpdated: suggestions.updatedAt,
      message: "Top 3 database optimization suggestions"
    });

  } catch (error) {
    console.error("Error in analyzeQueries:", error);
    res.status(500).json({ 
      error: "Failed to fetch suggestions", 
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
  analyzeQueries,
  generateSuggestions,
};
