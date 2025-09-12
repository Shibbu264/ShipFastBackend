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
        SELECT query, calls, total_time, mean_time, rows
        FROM pg_stat_statements
        ORDER BY total_time DESC
        LIMIT 50;
      `);

      for (const row of rows) {
        await prisma.queryLog.create({
          data: {
            userDbId: db.id,
            query: row.query,
            calls: row.calls,
            totalTimeMs: row.total_time,
            meanTimeMs: row.mean_time,
            rowsReturned: row.rows
          }
        });
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

module.exports = startCron;