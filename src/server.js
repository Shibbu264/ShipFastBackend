require("dotenv").config();
const app = require("./app");
const { startCron } = require("./jobs/queryCollector");
const { startSuggestionCron } = require("./jobs/suggestionAnalyzer");
const redisClient = require("./config/redis");

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startCron(); // Start query collection cron job
  startSuggestionCron(); // Start suggestion analysis cron job
});
