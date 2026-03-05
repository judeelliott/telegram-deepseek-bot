const { DateTime } = require("luxon");
const { callDeepSeek } = require("./deepseek");
const {
  DEFAULT_FREQUENCY,
  DEFAULT_STYLE,
  DEFAULT_TIME_OF_DAY,
  DEFAULT_TIMEZONE,
  listEnabledUsers,
  updateUserConfig
} = require("./db");
const { clipText, logError, logInfo, logWarn } = require("./utils");

const DEFAULT_TICK_MS = 60_000;
const MAX_PUSH_LENGTH = 1200;

function parseTimeOfDay(value) {
  const parsed = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || "").trim());
  if (!parsed) {
    return null;
  }

  return { hour: Number(parsed[1]), minute: Number(parsed[2]) };
}

function getScheduleKey(frequency, localNow) {
  if (frequency === "weekly") {
    const week = String(localNow.weekNumber).padStart(2, "0");
    return `${localNow.weekYear}-${week}`;
  }

  return localNow.toISODate();
}

function shouldTrigger(user, localNow) {
  const frequency = user.frequency || DEFAULT_FREQUENCY;
  const timeOfDay = parseTimeOfDay(user.timeOfDay || DEFAULT_TIME_OF_DAY);
  if (!timeOfDay) {
    return { due: false, reason: "invalid_time" };
  }

  if (frequency === "weekdays" && localNow.weekday > 5) {
    return { due: false, reason: "not_weekday" };
  }

  if (localNow.hour !== timeOfDay.hour || localNow.minute !== timeOfDay.minute) {
    return { due: false, reason: "not_time" };
  }

  const key = getScheduleKey(frequency, localNow);
  if (user.lastSentKey === key) {
    return { due: false, reason: "already_sent" };
  }

  return { due: true, key };
}

function languageInstruction(language) {
  if (language === "zh") {
    return "Reply in Simplified Chinese.";
  }
  if (language === "en") {
    return "Reply in English.";
  }
  return "Reply in the user's likely language based on goal/topics; default to Simplified Chinese.";
}

function buildPushMessages(user) {
  const goal = user.goal || "学习提升";
  const topics = user.topics || "通用成长";
  const style = user.style || DEFAULT_STYLE;

  const system = [
    "You are a personalized daily coach.",
    languageInstruction(user.language),
    `Writing style: ${style}.`,
    "Keep output practical and concise.",
    `Maximum length: ${MAX_PUSH_LENGTH} characters.`
  ].join(" ");

  const userPrompt = [
    `Goal: ${goal}`,
    `Topics: ${topics}`,
    "Please generate today's personalized content.",
    "Include: 1) key insight, 2) short action list, 3) one reflection question."
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: userPrompt }
  ];
}

async function pushForUser(bot, user, nowUtc) {
  const timezone = user.timezone || DEFAULT_TIMEZONE;
  const localNow = nowUtc.setZone(timezone);
  if (!localNow.isValid) {
    logWarn("Skip user due to invalid timezone", { chatId: user.chatId, timezone });
    return;
  }

  const trigger = shouldTrigger(user, localNow);
  if (!trigger.due) {
    return;
  }

  try {
    await bot.sendChatAction(user.chatId, "typing");
    const reply = await callDeepSeek(buildPushMessages(user));
    const content = clipText(reply || "（空回复）", MAX_PUSH_LENGTH);
    await bot.sendMessage(user.chatId, content);

    updateUserConfig(user.chatId, {
      lastSentAt: nowUtc.toISO(),
      lastSentKey: trigger.key
    });

    logInfo("Scheduler push sent", {
      chatId: user.chatId,
      key: trigger.key,
      timezone
    });
  } catch (error) {
    logError("Scheduler push failed", {
      chatId: user.chatId,
      message: error?.message || "unknown_error"
    });
  }
}

function startScheduler(bot, options = {}) {
  if (!bot || typeof bot.sendMessage !== "function") {
    throw new Error("Scheduler requires a Telegram bot instance.");
  }

  const tickMs = Number(options.tickMs || process.env.SCHEDULER_TICK_MS || DEFAULT_TICK_MS);
  if (!Number.isFinite(tickMs) || tickMs < 10_000) {
    throw new Error("Invalid scheduler tick interval.");
  }

  let running = false;
  const runTick = async () => {
    if (running) {
      logWarn("Scheduler tick skipped because previous tick is still running");
      return;
    }

    running = true;

    try {
      const users = listEnabledUsers();
      if (users.length === 0) {
        return;
      }

      const nowUtc = DateTime.utc();
      for (const user of users) {
        await pushForUser(bot, user, nowUtc);
      }
    } catch (error) {
      logError("Scheduler tick failed", {
        message: error?.message || "unknown_error"
      });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void runTick();
  }, tickMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  void runTick();
  logInfo("Scheduler started", { tickMs });

  return {
    stop() {
      clearInterval(timer);
      logInfo("Scheduler stopped");
    }
  };
}

module.exports = {
  startScheduler
};
