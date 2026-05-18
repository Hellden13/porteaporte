// lib/logger.js
// Structured logs for audit and Vercel monitoring.

function log(level, action, userId, details = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    action,
    userId,
    details,
  };

  console.log(`[${level}] ${action}`, logEntry);
  return logEntry;
}

module.exports = { log };
