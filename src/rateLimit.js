const PER_MINUTE_LIMIT = 20;
const MAX_INPUT_LENGTH = 4000;

const minuteBuckets = new Map();
const dailyUsage = new Map();

function now() {
  return Date.now();
}

function minuteWindow(chatId) {
  const existing = minuteBuckets.get(chatId);
  const current = now();

  if (!existing || current - existing.windowStart >= 60_000) {
    const fresh = { windowStart: current, count: 0 };
    minuteBuckets.set(chatId, fresh);
    return fresh;
  }

  return existing;
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function incrementDailyUsage(chatId) {
  const key = dayKey();
  const usage = dailyUsage.get(chatId) || { date: key, count: 0 };

  if (usage.date !== key) {
    usage.date = key;
    usage.count = 0;
  }

  usage.count += 1;
  dailyUsage.set(chatId, usage);
  return usage.count;
}

function getDailyUsage(chatId) {
  const key = dayKey();
  const usage = dailyUsage.get(chatId);
  if (!usage || usage.date !== key) {
    return 0;
  }
  return usage.count;
}

function checkDailyQuota(chatId, dailyLimit) {
  if (!dailyLimit || dailyLimit <= 0) {
    return { ok: true };
  }

  const used = getDailyUsage(chatId);
  if (used >= dailyLimit) {
    return { ok: false, reason: "daily_quota" };
  }

  return { ok: true };
}

function checkAndConsume(chatId, text, options = {}) {
  const value = String(text || "");
  if (value.length === 0) {
    return { ok: false, reason: "empty" };
  }

  if (value.length > MAX_INPUT_LENGTH) {
    return { ok: false, reason: "too_long", limit: MAX_INPUT_LENGTH };
  }

  const bucket = minuteWindow(chatId);
  if (bucket.count >= PER_MINUTE_LIMIT) {
    return { ok: false, reason: "per_minute", limit: PER_MINUTE_LIMIT };
  }

  const quotaCheck = checkDailyQuota(chatId, options.dailyLimit);
  if (!quotaCheck.ok) {
    return quotaCheck;
  }

  bucket.count += 1;
  incrementDailyUsage(chatId);

  return { ok: true };
}

module.exports = {
  checkAndConsume,
  checkDailyQuota,
  getDailyUsage,
  MAX_INPUT_LENGTH,
  PER_MINUTE_LIMIT
};
