require("dotenv").config();
const app = require("./app");
const { startCron } = require("./jobs/queryCollector");

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startCron(); // Start cron job when server starts
});
