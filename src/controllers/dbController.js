const prisma = require("../config/db");
const { encrypt } = require("../utils/encryption");
const { generateToken } = require("../utils/jwt");
const { Client } = require("pg");
const { parse } = require('pg-connection-string');


async function testDBConnection({ host, port, dbName, username, password }) {
  const client = new Client({ host, port, database: dbName, user: username, password });
  try {
    await client.connect();
    const res = await client.query("SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements';");
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
  const { url, database_url, host, port, dbType, username, password, dbName } = req.body;

  let dbConfig = {};
  try {
    if (url) {
      // Parse database_url if provided
      if (!database_url) {
        return res.status(400).json({ error: "database_url is required when url = true" });
      }
      const parsed = parse(database_url); // { host, port, database, user, password }
      dbConfig = {
        host: parsed.host,
        port: parsed.port,
        dbType: "postgresql", // infer type from url
        dbName: parsed.database,
        username: parsed.user,
        password: parsed.password
      };
    } else {
      // Use standard format
      if (!host || !port || !dbType || !username || !password || !dbName) {
        return res.status(400).json({ error: "Missing required database credentials" });
      }
      dbConfig = { host, port, dbType, dbName, username, password };
    }

    // Create user if first-time
    const user = await prisma.user.create({ data: {} });

    // Test DB connection
    const hasAccess = await testDBConnection(dbConfig);

    // Encrypt password
    const encryptedPass = encrypt(dbConfig.password);

    // Save DB info
    const dbEntry = await prisma.userDB.create({
      data: {
        userId: user.id,
        host: dbConfig.host,
        port: dbConfig.port,
        dbType: dbConfig.dbType,
        dbName: dbConfig.dbName,
        username: dbConfig.username,
        passwordEncrypted: encryptedPass,
        monitoringEnabled: hasAccess
      }
    });

    // Generate JWT
    const token = generateToken({ userId: user.id, dbId: dbEntry.id });

    res.json({ token, monitoringEnabled: hasAccess });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to connect database" });
  }
}


async function getQueryLogs(req, res) {
  const logs = await prisma.queryLog.findMany({
    where: { userDbId: req.user.dbId },
    orderBy: { collectedAt: "desc" },
    take: 100
  });
  res.json(logs);
}

module.exports = { connectDatabase, getQueryLogs };
