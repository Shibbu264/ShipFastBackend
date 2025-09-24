const { Redis } = require('@upstash/redis');

// Upstash Redis client configuration
const redisClient = Redis.fromEnv();
// Test connection
redisClient.ping()
  .then(() => {
    console.log('✅ Upstash Redis client connected');
  })
  .catch((err) => {
    console.error('❌ Upstash Redis client error:', err);
  });

module.exports = redisClient;
