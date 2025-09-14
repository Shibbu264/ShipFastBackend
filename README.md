# AI-Powered Database Observability Platform

A comprehensive backend system that provides real-time database monitoring, performance analysis, and AI-driven optimization recommendations for PostgreSQL databases.

## Overview

This platform combines traditional database monitoring with advanced AI capabilities to deliver actionable insights for database performance optimization. It automatically collects query performance data, analyzes database schemas, and provides intelligent recommendations through an AI-powered chatbot interface.

## Key Features

### Real-Time Monitoring
- Continuous query performance tracking via `pg_stat_statements`
- Automated collection of database metrics every 5 minutes
- Real-time dashboard with total queries, average latency, and slow query counts
- Top K slowest queries analysis with configurable parameters

### AI-Powered Analysis
- Individual query analysis with optimization recommendations
- AI chatbot with database context awareness
- Automated suggestion generation every 20 minutes
- Performance improvement multipliers and specific optimization strategies

### Schema Intelligence
- Comprehensive table structure collection (columns, indexes, keys, row counts)
- Automated schema metadata updates every 10 minutes
- Database relationship mapping and constraint analysis

### Alert System
- Configurable query performance alerts
- Email notifications for critical queries (>500ms threshold)
- Real-time monitoring with 2-minute alert check intervals

## Architecture

### Core Components

**API Layer**
- Express.js server with JWT authentication
- RESTful endpoints for database operations and AI interactions
- CORS-enabled for frontend integration

**Data Collection Engine**
- Automated cron jobs for query log collection
- Table structure metadata extraction
- Performance metrics aggregation

**AI Integration**
- Google Gemini 2.5 Pro for query analysis
- Context-aware chatbot with database knowledge
- Streaming responses for real-time interactions

**Caching System**
- Redis-based query context caching
- Performance optimization for repeated requests
- Automatic cache invalidation on data updates

### Database Schema

**Core Models**
- `User` - User management and authentication
- `UserDB` - Database connection configurations
- `QueryLog` - Query performance metrics and statistics
- `TableStructure` - Database schema metadata
- `TopSlowQuery` - Slow query tracking and ranking
- `Top3Suggestions` - AI-generated optimization recommendations

## API Endpoints

### Database Operations (`/db`)
- `POST /connect-db` - Establish database connection
- `GET /query-logs` - Retrieve query performance data
- `GET /metric-data` - Dashboard metrics (total queries, avg latency, slow queries)
- `POST /top-k-slow-queries` - Get top K slowest queries
- `GET /get-all-queries` - Complete query dataset
- `GET /get-insights` - AI-generated performance insights
- `GET /query-log/:queryId` - Individual query details

### AI Services (`/ai`)
- `POST /stream` - Real-time AI chatbot with database context
- `POST /analyze-query` - Individual query analysis and optimization
- `POST /cache/invalidate` - Cache management
- `GET /cache/stats` - Cache performance statistics

### Alert Management (`/alerts`)
- `POST /enable` - Enable alerts for specific queries
- `GET /query-with-alerts` - Retrieve alert-enabled queries

## Installation & Setup

### Prerequisites
- Node.js 16+
- PostgreSQL 12+
- Redis 6+
- Google Gemini API key

### Environment Variables
```bash
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
DIRECT_URL=postgresql://user:password@localhost:5432/dbname
GEMINI_API_KEY=your_gemini_api_key
JWT_SECRET=your_jwt_secret
ENCRYPTION_SECRET=your_32_character_encryption_key
REDIS_HOST=localhost
REDIS_PORT=6379
FRONTEND_URL=http://localhost:3000
```

### Installation Steps
```bash
# Clone repository
git clone <repository-url>
cd ShipFastBackend-1

# Install dependencies
npm install

# Setup database
npx prisma migrate dev
npx prisma generate

# Start development server
npm run dev
```

## Configuration

### Database Monitoring Setup
1. Enable `pg_stat_statements` extension in target PostgreSQL databases
2. Configure database connections via `/db/connect-db` endpoint
3. Monitor setup status through dashboard metrics

### AI Configuration
- Configure Gemini API key in environment variables
- Adjust AI model parameters in `src/config/gemini.js`
- Customize system prompts for query analysis and chatbot responses

### Alert Configuration
- Set performance thresholds in `src/jobs/queryCollector.js`
- Configure email settings in `src/services/emailService.js`
- Enable alerts for specific queries via API endpoints

## Data Collection Schedule

- **Query Logs**: Every 5 minutes
- **Alert Monitoring**: Every 2 minutes  
- **Table Structure**: Every 10 minutes
- **AI Suggestions**: Every 20 minutes

## Security Features

- JWT-based authentication for all protected endpoints
- AES-256-CTR encryption for database passwords
- Rate limiting and CORS protection
- Secure API key management

## Performance Optimizations

- Redis caching for query context and performance data
- Efficient database queries with proper indexing
- Streaming AI responses for real-time user experience
- Automated cache invalidation on data updates

## Monitoring & Maintenance

### Health Checks
- Database connection monitoring
- Redis connectivity status
- AI service availability
- Cron job execution tracking

### Logging
- Comprehensive error logging
- Performance metrics tracking
- AI interaction logging
- Database operation monitoring

## Development

### Project Structure
```
src/
├── controllers/     # Business logic handlers
├── services/        # External service integrations
├── jobs/           # Automated background tasks
├── routes/         # API endpoint definitions
├── middlewares/    # Authentication and security
├── config/         # Configuration files
└── utils/          # Utility functions
```

### Key Technologies
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **AI**: Google Gemini 2.5 Pro
- **Authentication**: JWT
- **Scheduling**: node-cron
- **Email**: Nodemailer with Brevo SMTP

## Contributing

1. Follow existing code structure and patterns
2. Ensure proper error handling and logging
3. Add appropriate tests for new features
4. Update documentation for API changes
5. Follow security best practices

## License

This project is proprietary software. All rights reserved.

---

For technical support or feature requests, please contact the development team.
