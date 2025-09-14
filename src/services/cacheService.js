const redisClient = require('../config/redis');
const prisma = require('../config/db');

/**
 * Cache service for query context data
 */
class CacheService {
  constructor() {
    this.CACHE_PREFIX = 'query_context:';
    this.CACHE_TTL = 3600; // 1 hour in seconds
  }

  /**
   * Generate cache key for query context
   * @param {string} username - User's username
   * @returns {string} Cache key
   */
  getCacheKey(username) {
    return `${this.CACHE_PREFIX}${username}`;
  }

  /**
   * Get cached query context for a user
   * @param {string} username - User's username
   * @returns {Promise<Object|null>} Cached context or null
   */
  async getQueryContext(username) {
    try {
      // Check if Redis is connected
      if (!redisClient.isOpen) {
        console.log(`⚠️ Redis not connected, skipping cache for user: ${username}`);
        return null;
      }

      const key = this.getCacheKey(username);
      const cached = await redisClient.get(key);
      
      if (cached) {
        console.log(`📦 Cache hit for user: ${username}`);
        return JSON.parse(cached);
      }
      
      console.log(`❌ Cache miss for user: ${username}`);
      return null;
    } catch (error) {
      console.error('Error getting cached query context:', error);
      return null;
    }
  }

  /**
   * Cache query context for a user
   * @param {string} username - User's username
   * @param {Object} context - Context data to cache
   * @returns {Promise<boolean>} Success status
   */
  async setQueryContext(username, context) {
    try {
      // Check if Redis is connected
      if (!redisClient.isOpen) {
        console.log(`⚠️ Redis not connected, skipping cache storage for user: ${username}`);
        return false;
      }

      const key = this.getCacheKey(username);
      const serialized = JSON.stringify(context);
      
      await redisClient.setEx(key, this.CACHE_TTL, serialized);
      console.log(`💾 Cached query context for user: ${username}`);
      return true;
    } catch (error) {
      console.error('Error caching query context:', error);
      return false;
    }
  }

  /**
   * Build and cache query context for a user
   * @param {string} username - User's username
   * @returns {Promise<Object>} Query context data
   */
  async buildAndCacheQueryContext(username) {
    try {
      // Find the UserDB by username
      const userDb = await prisma.userDB.findUnique({
        where: { username },
      });

      if (!userDb) {
        return { databaseContext: "", queryLogs: [], tableStructures: [] };
      }

      // Get query logs
      const queryLogs = await prisma.queryLog.findMany({
        where: { userDbId: userDb.id },
        orderBy: { meanTimeMs: "desc" },
        take: 20 // Get top 20 slowest queries
      });

      // Get table structures
      const tableStructures = await prisma.tableStructure.findMany({
        where: { userDbId: userDb.id }
      });

      // Build context object
      const context = {
        userDbId: userDb.id,
        queryLogs,
        tableStructures,
        databaseContext: this.buildDatabaseContextString(queryLogs, tableStructures),
        cachedAt: new Date().toISOString()
      };

      // Cache the context
      await this.setQueryContext(username, context);

      return context;
    } catch (error) {
      console.error('Error building query context:', error);
      return { databaseContext: "", queryLogs: [], tableStructures: [] };
    }
  }

  /**
   * Build database context string from query logs and table structures
   * @param {Array} queryLogs - Array of query log objects
   * @param {Array} tableStructures - Array of table structure objects
   * @returns {string} Formatted database context string
   */
  buildDatabaseContextString(queryLogs, tableStructures) {
    if (queryLogs.length === 0 && tableStructures.length === 0) {
      return "";
    }

    let databaseContext = "\n\n=== DATABASE CONTEXT ===\n";
    
    if (queryLogs.length > 0) {
      databaseContext += "\n**Recent Query Performance:**\n";
      queryLogs.forEach((log, index) => {
        databaseContext += `${index + 1}. Query: ${log.query.substring(0, 100)}${log.query.length > 100 ? '...' : ''}\n`;
        databaseContext += `   - Calls: ${log.calls}, Mean Time: ${Math.round(log.meanTimeMs)}ms, Total Time: ${Math.round(log.totalTimeMs)}ms\n`;
      });
    }

    if (tableStructures.length > 0) {
      databaseContext += "\n**Table Structures:**\n";
      tableStructures.forEach(table => {
        databaseContext += `\nTable: ${table.tableName} (${table.rowCount} rows)\n`;
        databaseContext += `Columns: ${table.columns.map(col => `${col.column_name} (${col.data_type})`).join(', ')}\n`;
        if (table.primaryKeys && table.primaryKeys.length > 0) {
          databaseContext += `Primary Keys: ${table.primaryKeys.join(', ')}\n`;
        }
        if (table.indexes && table.indexes.length > 0) {
          databaseContext += `Indexes: ${table.indexes.map(idx => idx.indexname).join(', ')}\n`;
        }
      });
    }
    
    databaseContext += "\n=== END DATABASE CONTEXT ===\n\n";
    return databaseContext;
  }

  /**
   * Invalidate cache for a specific user
   * @param {string} username - User's username
   * @returns {Promise<boolean>} Success status
   */
  async invalidateUserCache(username) {
    try {
      // Check if Redis is connected
      if (!redisClient.isOpen) {
        console.log(`⚠️ Redis not connected, skipping cache invalidation for user: ${username}`);
        return false;
      }

      const key = this.getCacheKey(username);
      await redisClient.del(key);
      console.log(`🗑️ Invalidated cache for user: ${username}`);
      return true;
    } catch (error) {
      console.error('Error invalidating user cache:', error);
      return false;
    }
  }

  /**
   * Invalidate cache for all users of a specific database
   * @param {string} userDbId - Database ID
   * @returns {Promise<boolean>} Success status
   */
  async invalidateDatabaseCache(userDbId) {
    try {
      // Get all usernames for this database
      const userDb = await prisma.userDB.findUnique({
        where: { id: userDbId },
        select: { username: true }
      });

      if (userDb) {
        await this.invalidateUserCache(userDb.username);
      }

      return true;
    } catch (error) {
      console.error('Error invalidating database cache:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} Cache statistics
   */
  async getCacheStats() {
    try {
      const info = await redisClient.info('memory');
      const keyspace = await redisClient.info('keyspace');
      
      return {
        memory: info,
        keyspace: keyspace,
        connected: redisClient.isOpen
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return { error: error.message };
    }
  }

  /**
   * Clear all query context cache
   * @returns {Promise<boolean>} Success status
   */
  async clearAllCache() {
    try {
      const keys = await redisClient.keys(`${this.CACHE_PREFIX}*`);
      if (keys.length > 0) {
        await redisClient.del(keys);
        console.log(`🗑️ Cleared ${keys.length} cache entries`);
      }
      return true;
    } catch (error) {
      console.error('Error clearing all cache:', error);
      return false;
    }
  }
}

module.exports = new CacheService();
