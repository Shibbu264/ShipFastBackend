const cron = require("node-cron");
const prisma = require("../config/db");
const { decrypt } = require("../utils/encryption");
const { Client } = require("pg");
const { sendQueryAlert } = require("../services/emailService");

// Configuration for critical query detection
const CRITICAL_QUERY_THRESHOLD_MS = 500; // Critical if mean execution time > 500ms
const EMAIL_COOLDOWN_MINUTES = 60; // Don't send more than one email per hour per database
const HARDCODED_EMAIL = "nischaysinha261@gmail.com"; // Hardcoded email address

// Keep track of when we last sent an email for each database
const lastEmailSent = new Map();

/**
 * Determines if a query is critical based on the 500ms threshold
 * @param {Object} query - The query log object
 * @returns {boolean} - True if query is critical
 */
/**
 * Collects and sends alerts for queries that have alertsEnabled=true
 * This function starts from QueryLog instead of the database
 */
async function collectAlertQueries() {
  console.log("Starting alert query collection...");
  
  try {
    // Get all queries with alertsEnabled=true from the QueryLog table
    const alertQueries = await prisma.queryLog.findMany({
      where: {
        alertsEnabled: true
      }
    });

    // Group queries by database ID for efficiency
    const queriesByDb = {};
    
    // Organize queries by database
    alertQueries.forEach(query => {
      if (!queriesByDb[query.userDbId]) {
        queriesByDb[query.userDbId] = {
          queries: [],
          db: query.userDB
        };
      }
      queriesByDb[query.userDbId].queries.push(query);
    });

    // Process each database that has alert-enabled queries
    for (const dbId in queriesByDb) {
      const { db, queries } = queriesByDb[dbId];
      
      // Skip if database info is missing
      if (!db) {
        console.error(`Missing database info for dbId: ${dbId}`);
        continue;
      }
      
      const password = decrypt(db.passwordEncrypted);
      const client = new Client({
        host: db.host,
        port: db.port,
        database: db.dbName,
        user: db.username,
        password
      });

      try {
        await client.connect();
        
        // Get query performance data
        const { rows } = await client.query(`
          SELECT query, calls, total_exec_time, mean_exec_time, rows
          FROM pg_stat_statements
          WHERE dbid = (SELECT oid FROM pg_database WHERE datname = 'postgres')
          ORDER BY total_exec_time DESC
          LIMIT 100;
        `);

        const criticalQueries = [];
        
        // Create a Map of queries by text for faster lookup
        const queryMap = new Map();
        queries.forEach(q => {
          queryMap.set(q.query, q);
        });
        
        // Check each database query
        for (const row of rows) {
          const queryText = row.query || '';
          
          // Skip if this query is not in our alert-enabled list
          if (!queryMap.has(queryText)) continue;
          
          // Get the related alert query from our list
          const alertQuery = queryMap.get(queryText);
          
          // Create query object with performance data
          const queryObj = {
            query: queryText,
            calls: parseInt(row.calls) || 0,
            totalTimeMs: parseFloat(row.total_exec_time) || 0,
            meanTimeMs: parseFloat(row.mean_exec_time) || 0,
            rowsReturned: parseInt(row.rows) || 0,
            collectedAt: new Date()
          };
          
          // Check if this is a critical query (>500ms)
          if (isCriticalQuery(queryObj)) {
            criticalQueries.push(queryObj);
            
            // Update the performance metrics for this alert query
            await prisma.queryLog.update({
              where: { id: alertQuery.id },
              data: {
                calls: queryObj.calls,
                totalTimeMs: queryObj.totalTimeMs,
                meanTimeMs: queryObj.meanTimeMs,
                rowsReturned: queryObj.rowsReturned,
                collectedAt: new Date()
              }
            });
            
            // Record in TopSlowQuery table
            await prisma.topSlowQuery.create({
              data: {
                id: `alert-${db.id}-${Date.now()}-${criticalQueries.length}`,
                userDbId: db.id,
                userId: "user-0001", // Use a hardcoded userId
                query: queryObj.query,
                calls: queryObj.calls,
                totalTimeMs: queryObj.totalTimeMs,
                meanTimeMs: queryObj.meanTimeMs,
                rowsReturned: queryObj.rowsReturned,
                rank: criticalQueries.length
              }
            });
          }
        }
        
        // Send email alert for critical queries (no cooldown)
        if (criticalQueries.length > 0) {
          try {
            const dbInfo = {
              host: db.host,
              dbName: db.dbName,
              username: db.username
            };
            
            await sendQueryAlert(criticalQueries, dbInfo, HARDCODED_EMAIL);
            
            console.log(`Alert email sent for ${criticalQueries.length} critical queries in database ${db.dbName}`);
          } catch (emailError) {
            console.error(`Failed to send alert email: ${emailError.message}`);
          }
        }
      } catch (dbError) {
        console.error(`Error querying database ${db.dbName}: ${dbError.message}`);
      } finally {
        await client.end();
      }
    }
  } catch (error) {
    console.error("Error in collectAlertQueries:", error);
  }
  
  console.log("Alert query collection completed");
}

// Update the startCron function to include the new alert function
function startCron() {
  // Alert-specific collection (run more frequently)
  cron.schedule("*/5 * * * *", collectAlertQueries);
}

// Update exports
module.exports = { 
  startCron, 
  collectAlertQueries,
};