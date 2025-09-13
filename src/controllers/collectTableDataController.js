const cron = require("node-cron");
const prisma = require("../config/db");
const { decrypt } = require("../utils/encryption");
const { Client } = require("pg");
const { v4: uuidv4 } = require("uuid");

/**
 * Collects table structure data for all connected databases (LOGGING ONLY)
 */
async function collectTableData() {
  console.log("Starting table data collection...");

  try {
    // Get all databases with monitoring enabled
    const databases = await prisma.userDB.findMany({
      where: {
        monitoringEnabled: true,
      },
    });

    console.log(
      `Found ${databases.length} databases to collect table data from`
    );

    for (const db of databases) {
      try {
        await collectTableDataForDatabase(db);
      } catch (error) {
        console.error(
          `Failed to collect table data for database ${db.id}:`,
          error.message
        );
      }
    }

    console.log("Table data collection completed");
  } catch (error) {
    console.error("Error in table data collection:", error);
  }
}

/**
 * Collects table structure data for a specific database (STORES IN DATABASE)
 */
async function collectTableDataForDatabase(userDb) {
  console.log(
    `\n=== Collecting table data for database: ${userDb.dbName} (${userDb.host}) ===`
  );

  const client = new Client({
    host: userDb.host,
    port: userDb.port,
    database: userDb.dbName,
    user: userDb.username,
    password: decrypt(userDb.passwordEncrypted),
  });

  let tablesProcessed = 0;
  let errors = [];

  try {
    await client.connect();
    console.log(`✅ Connected to database: ${userDb.dbName}`);

    // Get all tables in the public schema
    const tables = await getTables(client);
    console.log(
      `📊 Found ${tables.length} tables in database ${userDb.dbName}`
    );

    for (const table of tables) {
      try {
        const tableData = await getTableStructure(client, table.table_name);

        // Store table structure data in database
        await prisma.tableStructure.upsert({
          where: {
            userDbId_schemaName_tableName: {
              userDbId: userDb.id,
              schemaName: "public",
              tableName: table.table_name,
            },
          },
          update: {
            columns: tableData.columns,
            primaryKeys: tableData.primaryKeys,
            foreignKeys: tableData.foreignKeys,
            indexes: tableData.indexes,
            rowCount: tableData.rowCount,
            updatedAt: new Date(),
          },
          create: {
            id: uuidv4(),
            userDbId: userDb.id,
            tableName: table.table_name,
            schemaName: "public",
            columns: tableData.columns,
            primaryKeys: tableData.primaryKeys,
            foreignKeys: tableData.foreignKeys,
            indexes: tableData.indexes,
            rowCount: tableData.rowCount,
            updatedAt: new Date(),
          },
        });

        tablesProcessed++;
        console.log(`✅ Stored data for table: ${table.table_name}`);
      } catch (error) {
        const errorMsg = `Failed to store data for table ${table.table_name}: ${error.message}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }
  } catch (error) {
    const errorMsg = `Database connection failed for ${userDb.dbName}: ${error.message}`;
    console.error(`❌ ${errorMsg}`);
    errors.push(errorMsg);
  } finally {
    await client.end();
    console.log(`🔌 Disconnected from database: ${userDb.dbName}`);
  }

  return {
    database: userDb.dbName,
    tablesProcessed,
    errors,
  };
}

/**
 * Gets list of tables in the database
 */
async function getTables(client) {
  const query = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;

  const result = await client.query(query);
  return result.rows;
}

/**
 * Gets complete table structure including columns, keys, and indexes
 */
async function getTableStructure(client, tableName) {
  const [columns, primaryKeys, foreignKeys, indexes, rowCount] =
    await Promise.all([
      getColumns(client, tableName),
      getPrimaryKeys(client, tableName),
      getForeignKeys(client, tableName),
      getIndexes(client, tableName),
      getRowCount(client, tableName),
    ]);

  return {
    columns,
    primaryKeys,
    foreignKeys,
    indexes,
    rowCount,
  };
}

/**
 * Gets column information for a table
 */
async function getColumns(client, tableName) {
  const query = `
    SELECT 
      column_name,
      data_type,
      is_nullable,
      column_default,
      character_maximum_length,
      numeric_precision,
      numeric_scale
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = $1
    ORDER BY ordinal_position;
  `;

  const result = await client.query(query, [tableName]);
  return result.rows;
}

/**
 * Gets primary key information for a table
 */
async function getPrimaryKeys(client, tableName) {
  const query = `
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public'
    AND tc.table_name = $1
    AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position;
  `;

  const result = await client.query(query, [tableName]);
  return result.rows.map((row) => row.column_name);
}

/**
 * Gets foreign key information for a table
 */
async function getForeignKeys(client, tableName) {
  const query = `
    SELECT 
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu 
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
    AND tc.table_name = $1
    AND tc.constraint_type = 'FOREIGN KEY';
  `;

  const result = await client.query(query, [tableName]);
  return result.rows;
}

/**
 * Gets index information for a table
 */
async function getIndexes(client, tableName) {
  const query = `
    SELECT 
      indexname,
      indexdef
    FROM pg_indexes 
    WHERE schemaname = 'public'
    AND tablename = $1
    ORDER BY indexname;
  `;

  const result = await client.query(query, [tableName]);
  return result.rows;
}

/**
 * Gets approximate row count for a table
 */
async function getRowCount(client, tableName) {
  try {
    const query = `SELECT COUNT(*) as count FROM "${tableName}";`;
    const result = await client.query(query);
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.warn(
      `⚠️  Could not get row count for table ${tableName}:`,
      error.message
    );
    return null;
  }
}

/**
 * Test function to collect table data for a specific database
 */
async function testTableDataCollection() {
  console.log("🧪 Testing table data collection...");

  try {
    // Get the first database for testing
    const testDb = await prisma.userDB.findFirst({
      where: {
        monitoringEnabled: true,
      },
    });

    if (!testDb) {
      console.log("❌ No databases found for testing");
      return {
        success: false,
        message: "No databases found for testing",
        data: null,
      };
    }

    console.log(`🎯 Testing with database: ${testDb.dbName} (${testDb.host})`);
    const result = await collectTableDataForDatabase(testDb);
    console.log("✅ Test completed successfully");

    // Get the stored data from database to return
    const storedTables = await prisma.tableStructure.findMany({
      where: { userDbId: testDb.id },
      select: {
        tableName: true,
        columns: true,
        primaryKeys: true,
        foreignKeys: true,
        indexes: true,
        rowCount: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      message: `Table data collection completed successfully. Processed ${result.tablesProcessed} tables.`,
      data: {
        database: result.database,
        tablesProcessed: result.tablesProcessed,
        errors: result.errors,
        storedTables: storedTables,
      },
    };
  } catch (error) {
    console.error("❌ Test failed:", error);
    return {
      success: false,
      message: `Test failed: ${error.message}`,
      data: null,
      error: error.message,
    };
  }
}

/**
 * Start the cron job for table data collection
 */
function startTableDataCron() {
  // Run every 30 minutes
  cron.schedule("*/30 * * * *", collectTableData);
  console.log("⏰ Table data collection cron job started (every 30 minutes)");
}

// Export functions
module.exports = {
  collectTableData,
  collectTableDataForDatabase,
  testTableDataCollection,
  startTableDataCron,
};
