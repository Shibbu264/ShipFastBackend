const prisma = require("../config/db");
const { hashQuery } = require("../utils/encryption");
const { categorizeQueryPerformance, getSeverityLevel } = require("../utils/queryCategorizer");

/**
 * POST /alert-query
 * Enables alerts for a specific query by setting alertsEnabled=true
 * If query doesn't exist, creates it with alertsEnabled=true
 * 
 * Request body: {
 *   queryId: string,  // ID of the existing query to enable alerts for
 *   query: string     // Optional: Full query text (required if creating new)
 * }
 * 
 * Note: Uses authenticated user's username to find their database connection
 */
async function enableQueryAlert(req, res) {
  try {
    const {username} = req.user;
    const { queryId, query } = req.body;
    
    if (!queryId && !query) {
      return res.status(400).json({ error: "Either queryId or query text is required" });
    }
    
    // Use the username from the authenticated user to find the database connection
    const userDb = await prisma.userDB.findUnique({
      where: { username: username },
    });

    if (!userDb) {
      return res.status(404).json({ error: "Database connection not found" });
    }
    
    let updatedQuery;
    
    // If queryId is provided, try to find existing query
    if (queryId) {
      // Find the query to make sure it exists and belongs to this user
      const existingQuery = await prisma.queryLog.findUnique({
        where: { id: queryId },
      });
      
      if (existingQuery) {
        // Verify the query belongs to this user's database
        if (existingQuery.userDbId !== userDb.id) {
          return res.status(403).json({ error: "You don't have permission to modify this query" });
        }
        
        // Update the query to enable alerts
        updatedQuery = await prisma.queryLog.update({
          where: { id: queryId },
          data: { alertsEnabled: true }
        });
      } else if (query) {
        // Query not found by ID but query text is provided - create new
        console.log("Query not found by ID. Creating new query with alertsEnabled=true");
        
        // Create a new query with alertsEnabled=true
        updatedQuery = await prisma.queryLog.create({
          data: {
            userDbId: userDb.id,
            query: query,
            queryHash: hashQuery(query),
            calls: 0,
            totalTimeMs: 0,
            meanTimeMs: 0,
            rowsReturned: 0,
            alertsEnabled: true,
            collectedAt: new Date()
          }
        });
      } else {
        return res.status(404).json({ error: "Query not found and no query text provided for creation" });
      }
    } else {
      // No queryId provided, create new query from query text
      if (!query) {
        return res.status(400).json({ error: "Query text is required when not providing queryId" });
      }
      
      // Create a new query with alertsEnabled=true
      updatedQuery = await prisma.queryLog.create({
        data: {
          userDbId: userDb.id,
          query: query,
          queryHash: hashQuery(query),
          calls: 0,
          totalTimeMs: 0,
          meanTimeMs: 0,
          rowsReturned: 0,
          alertsEnabled: true,
          collectedAt: new Date()
        }
      });
    }
    
    // Return success with updated query data
    res.json({
      success: true,
      message: queryId ? "Alert enabled for query successfully" : "New query created with alerts enabled",
      query: {
        id: updatedQuery.id,
        query: updatedQuery.query.substring(0, 100) + (updatedQuery.query.length > 100 ? '...' : ''),
        alertsEnabled: updatedQuery.alertsEnabled,
        meanTimeMs: updatedQuery.meanTimeMs,
        isNewlyCreated: !queryId || (queryId && !await prisma.queryLog.findUnique({ where: { id: queryId } }))
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