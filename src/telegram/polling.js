const TelegramBot = require("node-telegram-bot-api");
const { createMessageHandler } = require("../messageHandler");
const { logError, logInfo } = require("../utils");

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

  bot.on("message", createMessageHandler(bot));

  logInfo("Telegram bot started in polling mode");
  return bot;
}

module.exports = {
  startPolling
};
