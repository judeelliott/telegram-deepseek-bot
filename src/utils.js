function timestamp() {
  return new Date().toISOString();
}

function logInfo(message, meta) {
  if (meta) {
    console.log(`[${timestamp()}] INFO ${message}`, meta);
    return;
  }
  console.log(`[${timestamp()}] INFO ${message}`);
}

function logWarn(message, meta) {
  if (meta) {
    console.warn(`[${timestamp()}] WARN ${message}`, meta);
    return;
  }
  console.warn(`[${timestamp()}] WARN ${message}`);
}

function logError(message, meta) {
  if (meta) {
    console.error(`[${timestamp()}] ERROR ${message}`, meta);
    return;
  }
  console.error(`[${timestamp()}] ERROR ${message}`);
}

function clipText(text, max = 300) {
  const value = String(text || "");
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}...`;
}

module.exports = {
  clipText,
  logError,
  logInfo,
  logWarn,
  timestamp
};
