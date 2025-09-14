const cron = require("node-cron");
const prisma = require("../config/db");
const { decrypt, hashQuery } = require("../utils/encryption");
const { Client } = require("pg");
const { sendQueryAlert } = require("../services/emailService");
const { collectTableData } = require("../controllers/collectTableDataController");
const cacheService = require("../services/cacheService");

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
function isCriticalQuery(query) {
  return query.meanTimeMs > CRITICAL_QUERY_THRESHOLD_MS;
}

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
      },
      include: {
        userDb: true // Include the related database info
      }
    });

    console.log(`Found ${alertQueries.length} alert-enabled queries`);

    // Group queries by database ID for efficiency
    const queriesByDb = {};

    // Organize queries by database
    alertQueries.forEach(query => {
      if (!queriesByDb[query.userDbId]) {
        queriesByDb[query.userDbId] = {
          queries: [],
          db: query.userDb
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

      try {
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
          console.log(`Connected to database ${db.dbName} for alert query checking`);

          // Get query performance data
          const { rows } = await client.query(`
            SELECT query, calls, total_exec_time, mean_exec_time, rows
            FROM pg_stat_statements
            WHERE dbid = (SELECT oid FROM pg_database WHERE datname = 'postgres')
            ORDER BY total_exec_time DESC
            LIMIT 100;
          `);

          console.log(`Retrieved ${rows.length} queries from database ${db.dbName}`);

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

            // Debug log the query performance
            console.log(`Checking alert query: ${queryText.substring(0, 50)}... Mean time: ${queryObj.meanTimeMs}ms`);

            // Check if this is a critical query (>500ms)
            if (isCriticalQuery(queryObj)) {
              console.log(`Critical query found: ${queryText.substring(0, 50)}... (${queryObj.meanTimeMs}ms)`);
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

              // Invalidate cache for this database
              await cacheService.invalidateDatabaseCache(db.id);

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
            console.log(`Preparing to send alert for ${criticalQueries.length} critical queries in database ${db.dbName}`);

            try {
              const dbInfo = {
                host: db.host,
                dbName: db.dbName,
                username: db.username
              };

              await sendQueryAlert(criticalQueries, dbInfo, HARDCODED_EMAIL);

              console.log(`✅ Alert email sent to ${HARDCODED_EMAIL} for ${criticalQueries.length} critical queries in database ${db.dbName}`);
            } catch (emailError) {
              console.error(`Failed to send alert email: ${emailError.message}`, emailError);
            }
          } else {
            console.log(`No critical queries found in database ${db.dbName}`);
          }
        } catch (dbError) {
          console.error(`Error querying database ${db.dbName}: ${dbError.message}`);
        } finally {
          await client.end();
        }
      } catch (decryptError) {
        console.error(`Error decrypting password for database ${dbId}: ${decryptError.message}`);
      }
    }
  } catch (error) {
    console.error("Error in collectAlertQueries:", error);
  }

  console.log("Alert query collection completed");
}

/**
 * Collects performance data for all queries
 */
async function collectLogs() {
  console.log("Starting regular query log collection...");

  try {
    const dbs = await prisma.userDB.findMany({ where: { monitoringEnabled: true } });

    for (const db of dbs) {
      try {
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
          const { rows } = await client.query(`SELECT
    query,
    calls,
    total_exec_time,
    mean_exec_time,
    min_exec_time,
    max_exec_time,
    rows,
    shared_blks_hit,
    shared_blks_read,
    shared_blks_written,
    local_blks_hit,
    local_blks_read,
    local_blks_written,
    temp_blks_read,
    temp_blks_written,
    -- Extract query type (SELECT/INSERT/UPDATE/DELETE)
    CASE
      WHEN query ILIKE 'select%' THEN 'SELECT'
      WHEN query ILIKE 'insert%' THEN 'INSERT'
      WHEN query ILIKE 'update%' THEN 'UPDATE'
      WHEN query ILIKE 'delete%' THEN 'DELETE'
      ELSE 'OTHER'
    END AS query_type,
    -- Extract first table name if present (basic regex parsing)
REGEXP_REPLACE(
        query,
        '(?is).*?\\bFROM\\s+([a-zA-Z0-9_\\."]+)',
        '\\1'
    ) AS first_table AS first_table
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  -- Exclude system/internal queries
  AND query NOT ILIKE 'SELECT * FROM pgbouncer%'
  AND query NOT ILIKE '%pg_catalog%'
  AND query NOT ILIKE '%information_schema%'
  AND query NOT ILIKE 'SET %'
  AND query NOT ILIKE 'CREATE %'
  AND query NOT ILIKE 'SHOW %'
  AND query NOT ILIKE 'BEGIN%'
  AND query NOT ILIKE 'COMMIT%'
  AND query NOT ILIKE 'ROLLBACK%'
  AND query NOT ILIKE 'DEALLOCATE%'
  AND query NOT ILIKE 'DISCARD%'
  AND query NOT ILIKE 'FETCH %'
  AND query NOT ILIKE 'CLOSE %'
  AND query NOT ILIKE 'ANALYZE%'
  AND query NOT ILIKE 'VACUUM%'
ORDER BY total_exec_time DESC
LIMIT 50;
`);

          for (const row of rows) {
            try {
              const data = {
                queryHash: hashQuery(row.query || ''),
                calls: parseInt(row.calls) || 0,
                totalTimeMs: parseFloat(row.total_exec_time) || 0,
                meanTimeMs: parseFloat(row.mean_exec_time) || 0,
                minTimeMs: parseFloat(row.min_exec_time) || 0,
                maxTimeMs: parseFloat(row.max_exec_time) || 0,
                rowsReturned: parseInt(row.rows) || 0,

                sharedBlksHit: parseInt(row.shared_blks_hit) || 0,
                sharedBlksRead: parseInt(row.shared_blks_read) || 0,
                sharedBlksWritten: parseInt(row.shared_blks_written) || 0,
                localBlksHit: parseInt(row.local_blks_hit) || 0,
                localBlksRead: parseInt(row.local_blks_read) || 0,
                localBlksWritten: parseInt(row.local_blks_written) || 0,
                tempBlksRead: parseInt(row.temp_blks_read) || 0,
                tempBlksWritten: parseInt(row.temp_blks_written) || 0,
                blkReadTime: parseFloat(row.blk_read_time) || 0,
                blkWriteTime: parseFloat(row.blk_write_time) || 0,

                queryType: row.query_type || 'OTHER',
                firstTable: row.first_table || null,
                collectedAt: new Date(),
                alertsEnabled: false
              };

              // Check if record exists
              const existingRecord = await prisma.queryLog.findFirst({
                where: { userDbId: db.id, queryHash: hashQuery(row.query || '') }
              });

              if (existingRecord) {
                await prisma.queryLog.update({
                  where: { id: existingRecord.id },
                  data
                });
              } else {
                await prisma.queryLog.create({
                  data: {
                    userDbId: db.id,
                    query: row.query || '',
                    ...data
                  }
                });
              }

              // Invalidate cache for this database when data changes
              await cacheService.invalidateDatabaseCache(db.id);
            } catch (logError) {
              console.error(`Failed to process query: ${row.query}`, logError.message);
            }
          }
        }
        catch (err) {
          console.error(`Failed to collect logs for DB ${db.dbName}:`, err.message);
        } finally {
          await client.end();
        }
      } catch (decryptError) {
        console.error(`Error decrypting password for database ${db.id}: ${decryptError.message}`);
      }
    }
    console.log("Regular query log collection completed");
  } catch (error) {
    console.error("Error in collectLogs:", error);
  }
}

/**
 * Test function to send a sample email alert
 */
async function testEmailAlert() {
  console.log("Testing email alert...");

  try {
    const testQueries = [
      {
        query: "SELECT * FROM users WHERE id = 1",
        calls: 500,
        totalTimeMs: 300000,
        meanTimeMs: 600, // Over the critical threshold
        rowsReturned: 1,
        collectedAt: new Date()
      },
      {
        query: "UPDATE products SET price = price * 1.1 WHERE category = 'electronics'",
        calls: 10,
        totalTimeMs: 12000,
        meanTimeMs: 1200, // Well over the critical threshold
        rowsReturned: 250,
        collectedAt: new Date()
      }
    ];

    const dbInfo = {
      host: "test-database.example.com",
      dbName: "test_db",
      username: "test_user"
    };

    await sendQueryAlert(testQueries, dbInfo, HARDCODED_EMAIL);
    console.log(`✅ Test email alert sent to ${HARDCODED_EMAIL}`);
  } catch (error) {
    console.error("Failed to send test email alert:", error);
  }
}

/**
 * Run all jobs manually for testing
 */
async function runAllCronJobs() {
  console.log("Running all jobs manually...");
  await collectLogs();
  await collectAlertQueries();
  await collectTableData();
  return { message: "All jobs completed" };
}

/**
 * Start the cron jobs
 */
function startCron() {
  console.log("⏰ Starting all cron jobs...");

  // Regular collection for all queries
  cron.schedule("*/5 * * * *", collectLogs);

  // Alert-specific collection (run more frequently)
  cron.schedule("*/2 * * * *", collectAlertQueries);
  console.log("✅ Alert query collection cron started (every 2 minutes)");

  // Table data collection (run every 10 minutes)
  cron.schedule("*/10 * * * *", collectTableData);
  console.log("✅ Table data collection cron started (every 10 minutes)");

  // Run table data collection immediately on startup
  console.log("🚀 Running table data collection immediately...");
  collectTableData().catch((error) => {
    console.error("❌ Initial table data collection failed:", error);
  });
}

// Export functions
module.exports = {
  startCron,
  collectLogs,
  collectAlertQueries,
  testEmailAlert,
  runAllCronJobs
};