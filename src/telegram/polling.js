const TelegramBot = require("node-telegram-bot-api");
const { callDeepSeek } = require("../deepseek");
const memory = require("../memory");
const rateLimit = require("../rateLimit");
const { logError, logInfo, logWarn } = require("../utils");

const WELCOME_TEXT =
  "你好，我是基于 DeepSeek 的对话机器人。\n\n直接发文本消息给我即可开始聊天。\n可用命令：\n/start 查看说明\n/reset 清空当前会话记忆";

const FRIENDLY_ERROR = "AI service temporarily unavailable.";

function isTextMessage(msg) {
  return typeof msg?.text === "string";
}

async function handleTextMessage(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (text === "/start") {
    await bot.sendMessage(chatId, WELCOME_TEXT);
    return;
  }

  if (text === "/reset") {
    memory.reset(chatId);
    await bot.sendMessage(chatId, "已重置当前会话记忆。");
    return;
  }

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

function startPolling() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }

  const bot = new TelegramBot(token, { polling: true });

  bot.on("polling_error", (error) => {
    logError("Telegram polling error", {
      code: error?.code,
      message: error?.message
    });
  });

  bot.on("message", async (msg) => {
    if (msg?.from?.is_bot) {
      return;
    }

    if (!isTextMessage(msg)) {
      logWarn("Ignored non-text message", { chatId: msg?.chat?.id });
      return;
    }

    await handleTextMessage(bot, msg);
  });

  logInfo("Telegram bot started in polling mode");
  return bot;
}

module.exports = {
  startPolling
};
