const prisma = require("../config/db");
const { encrypt } = require("../utils/encryption");
const { generateToken } = require("../utils/jwt");
const { Client } = require("pg");

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

async function connectDatabase(req, res) {
  const { host, port, dbType, username, password, dbName } = req.body;

  // Create user if first-time
  const user = await prisma.user.create({ data: {} });

  // Test DB connection
  const hasAccess = await testDBConnection({ host, port, dbName, username, password });

  // Encrypt password
  const encryptedPass = encrypt(password);

  // Save DB info
  const dbEntry = await prisma.userDB.create({
    data: {
      userId: user.id,
      host,
      port,
      dbType,
      dbName,
      username,
      passwordEncrypted: encryptedPass,
      monitoringEnabled: hasAccess
    }
  });

  // Generate JWT
  const token = generateToken({ userId: user.id, dbId: dbEntry.id });

  res.json({ token, monitoringEnabled: hasAccess });
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
