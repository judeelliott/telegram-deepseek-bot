const TelegramBot = require("node-telegram-bot-api");
const { createMessageHandler } = require("../messageHandler");
const { logInfo, logWarn } = require("../utils");

async function maybeSetWebhook(bot, webhookUrl) {
  if (!webhookUrl) {
    logWarn("WEBHOOK_URL is empty. Set it before calling Telegram setWebhook.");
    return;
  }

  const ok = await bot.setWebHook(webhookUrl);
  if (ok) {
    logInfo("Telegram webhook set", { webhookUrl });
  } else {
    logWarn("Telegram setWebHook returned false", { webhookUrl });
  }
}

async function startWebhook(options = {}) {
  const { registerTelegramHandler } = options;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }

  const webhookUrl = process.env.WEBHOOK_URL;
  const bot = new TelegramBot(token);

  bot.on("message", createMessageHandler(bot));

  const telegramHandler = async (update) => {
    await bot.processUpdate(update);
  };

  if (typeof registerTelegramHandler === "function") {
    registerTelegramHandler(telegramHandler);
  }

  await maybeSetWebhook(bot, webhookUrl);

  logInfo("Telegram bot started in webhook mode", {
    endpoint: "/telegram"
  });

  return { bot, telegramHandler };
}

module.exports = {
  startWebhook
};
