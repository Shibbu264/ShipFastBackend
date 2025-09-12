const cron = require("node-cron");
const prisma = require("../config/db");
const { decrypt } = require("../utils/encryption");
const { Client } = require("pg");

async function collectLogs() {
  const dbs = await prisma.userDB.findMany({ where: { monitoringEnabled: true } });

  for (const db of dbs) {
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
      const { rows } = await client.query(`
        SELECT query, calls, total_exec_time, mean_exec_time, rows
        FROM pg_stat_statements
        ORDER BY total_exec_time DESC
        LIMIT 50;
      `);

      for (const row of rows) {
        try {
          await prisma.queryLog.create({
            data: {
              userDbId: db.id,
              query: row.query || '',
              calls: parseInt(row.calls) || 0,
              totalTimeMs: parseFloat(row.total_exec_time) || 0,
              meanTimeMs: parseFloat(row.mean_exec_time) || 0,
              rowsReturned: parseInt(row.rows) || 0
            }
          });
        } catch (logError) {
          console.error(`Failed to create log entry for query: ${row.query}`, logError.message);
        }
      }
    } catch (err) {
      console.error(`Failed to collect logs for DB ${db.dbName}:`, err.message);
    } finally {
      await client.end();
    }
  }
}

function startCron() {
  cron.schedule("*/5 * * * *", collectLogs);
}

module.exports = { startCron, collectLogs };