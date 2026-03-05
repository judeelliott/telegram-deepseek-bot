const { callDeepSeek } = require("./deepseek");
const memory = require("./memory");
const rateLimit = require("./rateLimit");
const { handleCommand, handleSetupStep, hasActiveWizard, isCommand } = require("./commands");
const { getUserConfig } = require("./db");
const { logError, logWarn } = require("./utils");

const FRIENDLY_ERROR = "AI service temporarily unavailable.";
const AUTOMATION_GUIDE_TEXT =
  "我可以做定时推送。先发 /setup 配置（5步），然后用 /set time HH:MM 测试，再用 /on 开启。发送 /help 查看命令。";
const AUTOMATION_KEYWORDS = [
  "定时",
  "提醒",
  "闹钟",
  "推送",
  "自动化",
  "每天发",
  "每天推",
  "schedule",
  "remind",
  "automation",
  "daily push"
];

function isTextMessage(msg) {
  return typeof msg?.text === "string";
}

function containsAutomationKeyword(text) {
  const normalized = String(text || "").toLowerCase();
  return AUTOMATION_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function needsAutomationSetup(profile) {
  const hasCompletedSetup = Boolean(profile?.hasStarted && profile?.goal && profile?.topics);
  return !hasCompletedSetup || profile?.enabled !== true;
}

async function handleNormalChat(bot, msg, text) {
  const chatId = msg.chat.id;
  const dailyLimit = Number(process.env.DAILY_FREE_LIMIT || 0);
  const rateCheck = rateLimit.checkAndConsume(chatId, text, { dailyLimit });

  if (!rateCheck.ok) {
    if (rateCheck.reason === "too_long") {
      await bot.sendMessage(chatId, "Message too long");
      return;
    }

    if (rateCheck.reason === "per_minute") {
      await bot.sendMessage(chatId, "Rate limit exceeded. Please wait.");
      return;
    }

    if (rateCheck.reason === "daily_quota") {
      await bot.sendMessage(chatId, "今日免费额度已用完，请明天再试。");
      return;
    }

    return;
  }

  try {
    await bot.sendChatAction(chatId, "typing");

    memory.addUserMessage(chatId, text);
    const messages = memory.getMessages(chatId);
    const reply = await callDeepSeek(messages);

    memory.addAssistantMessage(chatId, reply);
    await bot.sendMessage(chatId, reply || "（空回复）");
  } catch (error) {
    logError("Message processing failed", {
      chatId,
      message: error?.message || "unknown_error"
    });
    await bot.sendMessage(chatId, FRIENDLY_ERROR);
  }
}

function createMessageHandler(bot) {
  return async (msg) => {
    if (msg?.from?.is_bot) {
      return;
    }

    if (!isTextMessage(msg)) {
      logWarn("Ignored non-text message", { chatId: msg?.chat?.id });
      return;
    }

    const text = msg.text.trim();

    if (isCommand(text)) {
      await handleCommand(bot, msg);
      return;
    }

    if (hasActiveWizard(msg.chat.id)) {
      await handleSetupStep(bot, msg);
      return;
    }

    if (containsAutomationKeyword(text)) {
      const profile = getUserConfig(msg.chat.id);
      if (needsAutomationSetup(profile)) {
        await bot.sendMessage(msg.chat.id, AUTOMATION_GUIDE_TEXT);
        return;
      }
    }

    await handleNormalChat(bot, msg, text);
  };
}

module.exports = {
  createMessageHandler
};
