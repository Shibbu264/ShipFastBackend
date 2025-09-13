const nodemailer = require('nodemailer');

// Hardcoded recipient email
const HARDCODED_EMAIL = "nischaysinha261@gmail.com";
// Use a verified sender email (your actual email that's verified in Brevo)
const SENDER_EMAIL = "nischaysinha261@gmail.com"; // Replace with your verified email

// Configure the transporter with improved delivery options
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: "96efe2001@smtp-brevo.com", // This is just your SMTP username
    pass: "UkchqaTWzrvbyPZp"
  },
  // Add these options for better delivery
  tls: {
    rejectUnauthorized: false // Helps with certain SMTP servers
  },
  pool: true, // Use connection pooling
  maxConnections: 5,
  maxMessages: 100
});

/**
 * Sends an email notification with delivery verification
 * 
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address (will be overridden)
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text email content
 * @param {string} options.html - HTML email content
 * @returns {Promise} - Promise that resolves when email is sent
 */
async function sendEmail({ to, subject, text, html }) {
  try {
    const info = await transporter.sendMail({
      from: `"ShipFast DB Monitor" <${SENDER_EMAIL}>`,
      to: HARDCODED_EMAIL,
      subject,
      text,
      html,
      // Add these for better delivery tracking
      headers: {
        'X-Priority': '1', // High priority
        'Importance': 'high'
      },
      priority: 'high'
    });
    
    console.log(`Email sent to ${HARDCODED_EMAIL}: ${info.messageId}`);
    console.log(`Delivery info: ${JSON.stringify(info.envelope)}`);
    
    // Try to verify delivery if the method exists
    if (info.messageId && transporter.verify) {
      try {
        const verifyResult = await transporter.verify();
        console.log(`SMTP connection verification: ${verifyResult}`);
      } catch (verifyError) {
        console.log(`SMTP verification failed: ${verifyError.message}`);
      }
    }
    
    return info;
  } catch (error) {
    console.error(`Error sending email to ${HARDCODED_EMAIL}:`, error);
    throw error;
  }
}

/**
 * Formats critical queries into readable HTML for emails
 * 
 * @param {Array} queries - Array of query objects
 * @param {Object} dbInfo - Database information
 * @returns {string} - HTML formatted email body
 */
function formatCriticalQueriesHtml(queries, dbInfo) {
  // Calculate severity for each query
  const queriesWithSeverity = queries.map(q => {
    let severity = 'Medium';
    if (q.meanTimeMs > 1000) severity = 'High';
    if (q.meanTimeMs > 5000) severity = 'Critical';
    return {...q, severity};
  });
  
  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          .container { padding: 20px; }
          h2 { color: #d9534f; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f2f2f2; }
          .alert { color: #d9534f; font-weight: bold; }
          .query-text { font-family: monospace; background-color: #f9f9f9; padding: 10px; border-radius: 4px; overflow-x: auto; }
          .severity-Medium { background-color: #fff3cd; }
          .severity-High { background-color: #f8d7da; }
          .severity-Critical { background-color: #dc3545; color: white; font-weight: bold; }
          .meta-info { background-color: #e9ecef; padding: 10px; margin-bottom: 20px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>⚠️ Critical Database Query Alert</h2>
          
          <div class="meta-info">
            <p><strong>Database:</strong> ${dbInfo.dbName} at ${dbInfo.host}</p>
            <p><strong>Alert time:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Recipient:</strong> ${HARDCODED_EMAIL}</p>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Query</th>
                <th>Execution Time (ms)</th>
                <th>Severity</th>
                <th>Calls</th>
                <th>Rows</th>
                <th>Detected At</th>
              </tr>
            </thead>
            <tbody>
              ${queriesWithSeverity.map(q => `
                <tr class="severity-${q.severity}">
                  <td><div class="query-text">${q.query.substring(0, 200)}${q.query.length > 200 ? '...' : ''}</div></td>
                  <td class="alert">${q.meanTimeMs.toFixed(2)}</td>
                  <td>${q.severity}</td>
                  <td>${q.calls}</td>
                  <td>${q.rowsReturned}</td>
                  <td>${new Date(q.collectedAt).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <h3>Recommendations:</h3>
          <ul>
            <li>Review the execution plan using EXPLAIN ANALYZE</li>
            <li>Check for missing indexes</li>
            <li>Consider query optimization or refactoring</li>
            <li>Add appropriate indexes for frequently queried columns</li>
          </ul>
          
          <p>This is an automated message from ShipFast DB Monitor.</p>
        </div>
      </body>
    </html>
  `;
}

/**
 * Formats critical queries into plain text for emails
 * 
 * @param {Array} queries - Array of query objects
 * @param {Object} dbInfo - Database information
 * @returns {string} - Plain text formatted email body
 */
function formatCriticalQueriesText(queries, dbInfo) {
  // Calculate severity for each query
  const queriesWithSeverity = queries.map(q => {
    let severity = 'Medium';
    if (q.meanTimeMs > 1000) severity = 'High';
    if (q.meanTimeMs > 5000) severity = 'Critical';
    return {...q, severity};
  });
  
  let text = `CRITICAL DATABASE QUERY ALERT\n\n`;
  text += `Database: ${dbInfo.dbName} at ${dbInfo.host}\n`;
  text += `Alert time: ${new Date().toLocaleString()}\n`;
  text += `Recipient: ${HARDCODED_EMAIL}\n\n`;
  text += `The following queries require attention:\n\n`;
  
  queriesWithSeverity.forEach((q, i) => {
    text += `${i+1}. Query: ${q.query.substring(0, 100)}${q.query.length > 100 ? '...' : ''}\n`;
    text += `   Execution Time: ${q.meanTimeMs.toFixed(2)} ms\n`;
    text += `   Severity: ${q.severity}\n`;
    text += `   Calls: ${q.calls}\n`;
    text += `   Rows: ${q.rowsReturned}\n`;
    text += `   Detected At: ${new Date(q.collectedAt).toLocaleString()}\n\n`;
  });
  
  text += `Recommendations:\n`;
  text += `- Review the execution plan using EXPLAIN ANALYZE\n`;
  text += `- Check for missing indexes\n`;
  text += `- Consider query optimization or refactoring\n`;
  text += `- Add appropriate indexes for frequently queried columns\n\n`;
  
  text += `This is an automated message from ShipFast DB Monitor.`;
  
  return text;
}

/**
 * Sends email notification about critical/slow queries
 * 
 * @param {Array} criticalQueries - Array of critical query objects
 * @param {Object} dbInfo - Database connection information
 * @param {string} userEmail - Email address to send notification to (will be ignored)
 * @returns {Promise}
 */
async function sendQueryAlert(criticalQueries, dbInfo, userEmail) {
  if (!criticalQueries || criticalQueries.length === 0) return;
  
  // No need to use userEmail parameter anymore
  const subject = `⚠️ Critical Query Alert: ${dbInfo.dbName} at ${dbInfo.host}`;
  const html = formatCriticalQueriesHtml(criticalQueries, dbInfo);
  const text = formatCriticalQueriesText(criticalQueries, dbInfo);
  
  return sendEmail({
    to: HARDCODED_EMAIL, // This will be overridden in sendEmail anyway
    subject,
    text,
    html
  });
}

module.exports = {
  sendEmail,
  sendQueryAlert
};