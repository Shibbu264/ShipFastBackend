const prisma = require("../config/db");
const { hashQuery } = require("../utils/encryption");
const { categorizeQueryPerformance, getSeverityLevel } = require("../utils/queryCategorizer");

/**
 * POST /alert-query
 * Enables alerts for a specific query by setting alertsEnabled=true
 * If query doesn't exist, creates it with alertsEnabled=true
 * 
 * Request body: {
 *   query: string     // Full query text (required)
 * }
 * 
 * Note: Uses authenticated user's username to find their database connection
 */
async function enableQueryAlert(req, res) {
  try {
    const {username} = req.user;
    const { query } = req.body;
    console.log("query", query);
    
    if (!query) {
      return res.status(400).json({ error: "Query text is required" });
    }
    
    // Use the username from the authenticated user to find the database connection
    const userDb = await prisma.userDB.findUnique({
      where: { username: username },
    });

    if (!userDb) {
      return res.status(404).json({ error: "Database connection not found" });
    }
    
    // Generate query hash for the provided query
    const queryHash = hashQuery(query, userDb.id);
    
    // Search for existing query by queryHash
    const existingQuery = await prisma.queryLog.findFirst({
      where: { 
        queryHash: queryHash,
        userDbId: userDb.id
      },
    });
    
    let updatedQuery;
    let isNewlyCreated = false;
    
    if (existingQuery) {
      // Query exists, update it to enable alerts
      console.log("Existing query found by queryHash. Updating alertsEnabled=true");
      updatedQuery = await prisma.queryLog.update({
        where: { id: existingQuery.id },
        data: { alertsEnabled: true }
      });
    } else {
      // Query doesn't exist, create new one with alertsEnabled=true
      console.log("Query not found by queryHash. Creating new query with alertsEnabled=true");
      updatedQuery = await prisma.queryLog.create({
        data: {
          userDbId: userDb.id,
          query: query,
          queryHash: queryHash,
          calls: 0,
          totalTimeMs: 0,
          meanTimeMs: 0,
          rowsReturned: 0,
          alertsEnabled: true,
          collectedAt: new Date()
        }
      });
      isNewlyCreated = true;
    }
    
    // Return success with updated query data
    res.json({
      success: true,
      message: isNewlyCreated ? "New query created with alerts enabled" : "Alert enabled for query successfully",
      query: {
        id: updatedQuery.id,
        query: updatedQuery.query.substring(0, 100) + (updatedQuery.query.length > 100 ? '...' : ''),
        alertsEnabled: updatedQuery.alertsEnabled,
        meanTimeMs: updatedQuery.meanTimeMs,
        isNewlyCreated: isNewlyCreated
      }
    });
    
  } catch (error) {
    console.error("Error enabling query alert:", error);
    res.status(500).json({ 
      error: "Failed to enable query alert", 
      details: error.message 
    });
  }
}

/**
 * GET /query-with-alerts
 * Returns all queries with alerts enabled for the authenticated user
 * 
 * Returns: Array of query objects with alert information
 */
async function getQueriesWithAlerts(req, res) {
  try {
    const {username} = req.user;
    
    // Find the user's database connection
    const userDb = await prisma.userDB.findUnique({
      where: { username: username },
    });

    if (!userDb) {
      return res.status(404).json({ error: "Database connection not found" });
    }
    
    // Get all queries with alerts enabled for this user
    const queriesWithAlerts = await prisma.queryLog.findMany({
      where: {
        userDbId: userDb.id,
        alertsEnabled: true
      },
      select: {
        id: true,
        query: true,
        meanTimeMs: true
      },
      orderBy: {
        meanTimeMs: 'desc' // Order by slowest queries first
      }
    });
    
    // Transform the data to the required format
    const formattedQueries = queriesWithAlerts.map(query => {
      // Use the centralized query categorization function
      const queryType = categorizeQueryPerformance(query.meanTimeMs);
      const severity = getSeverityLevel(query.meanTimeMs);
      
      return {
        id: query.id,
        type: queryType,
        query: query.query,
        severity: severity,
        threshold: query.meanTimeMs > 500 ? "> 500ms" : 
                  query.meanTimeMs > 300 ? "> 300ms" : "≤ 300ms"
      };
    });
    
    res.json({
      success: true,
      queries: formattedQueries,
      count: formattedQueries.length
    });
    
  } catch (error) {
    console.error("Error fetching queries with alerts:", error);
    res.status(500).json({ 
      error: "Failed to fetch queries with alerts", 
      details: error.message 
    });
  }
}

module.exports = {
  enableQueryAlert,
  getQueriesWithAlerts
};