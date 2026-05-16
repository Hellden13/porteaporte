// api/logger.js
// Logs structurés pour audit + monitoring

function log(level, action, userId, details = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,      // 'INFO', 'WARN', 'ERROR', 'AUDIT'
    action,     // 'accept_delivery', 'create_mission', etc
    userId,     // auth.uid()
    details,    // metadata
  };
  
  // Console log (visible en dev + Vercel logs)
  console.log(`[${level}] ${action}`, logEntry);
  
  // TODO: Envoyer à Sentry/DataDog pour production
  // sendToMonitoring(logEntry);
  
  return logEntry;
}

module.exports = { log };
