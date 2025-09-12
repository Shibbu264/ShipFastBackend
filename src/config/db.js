const { PrismaClient } = require("@prisma/client");

// Add error handling for Prisma client initialization
let prisma;

try {
  prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });
  
  // Test the connection
  prisma.$connect().then(() => {
    console.log('✅ Database connected successfully');
  }).catch((err) => {
    console.error('❌ Database connection failed:', err.message);
  });
} catch (error) {
  console.error('❌ Failed to initialize Prisma client:', error.message);
  console.error('Make sure DATABASE_URL is set in your .env file');
  process.exit(1);
}

module.exports = prisma;