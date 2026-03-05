require("dotenv").config();

const { createHttpServer } = require("./httpServer");
const { startPolling } = require("./telegram/polling");
const { startWebhook } = require("./telegram/webhook");
const { logError, logInfo } = require("./utils");

const VALID_MODES = new Set(["polling", "webhook"]);
let httpServer = null;

async function main() {
  const mode = (process.env.MODE || "polling").toLowerCase();
  const port = Number(process.env.PORT || 3000);

  if (!VALID_MODES.has(mode)) {
    throw new Error(`Invalid MODE: ${mode}. Use polling or webhook.`);
  }

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT || "undefined"}`);
  }

  httpServer = createHttpServer({ mode, port });
  await httpServer.start();

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error("Missing DEEPSEEK_API_KEY");
  }

  if (mode === "polling") {
    startPolling();
    return;
  }

  await startWebhook({
    registerTelegramHandler: (handler) => {
      httpServer.setTelegramHandler(handler);
      logInfo("Webhook handler mounted", { endpoint: "/telegram" });
    }
  });
}

async function handleStartupError(error) {
  logError("Bot startup failed", { message: error?.message || "unknown_error" });

  if (httpServer) {
    try {
      await httpServer.stop();
    } catch (stopError) {
      logError("Failed to stop HTTP server after startup error", {
        message: stopError?.message || "unknown_error"
      });
    }
  }

  process.exitCode = 1;
}

main().catch((error) => {
  void handleStartupError(error);
});

process.on("unhandledRejection", (reason) => {
  logError("Unhandled rejection", {
    reason: reason instanceof Error ? reason.message : String(reason)
  });
});

process.on("uncaughtException", (error) => {
  logError("Uncaught exception", { message: error?.message || "unknown_error" });
});

logInfo("Bootstrapping Telegram + DeepSeek bot");
