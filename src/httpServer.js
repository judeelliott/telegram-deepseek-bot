const http = require("http");
const { logError, logInfo } = require("./utils");

const MAX_BODY_BYTES = 1024 * 1024;

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function getPathname(rawUrl) {
  try {
    return new URL(rawUrl || "/", "http://127.0.0.1").pathname;
  } catch (error) {
    return "/";
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let totalSize = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request body too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        const parsed = JSON.parse(raw);
        resolve(parsed && typeof parsed === "object" ? parsed : {});
      } catch (error) {
        reject(Object.assign(new Error("Invalid JSON body"), { statusCode: 400 }));
      }
    });

    req.on("error", (error) => {
      reject(error);
    });
  });
}

function createHttpServer({ mode, port } = {}) {
  const listenPort = Number(process.env.PORT || port || 3000);

  if (!Number.isInteger(listenPort) || listenPort <= 0 || listenPort > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT || port || "undefined"}`);
  }

  let telegramHandler = null;

  const server = http.createServer(async (req, res) => {
    const method = req.method || "GET";
    const pathname = getPathname(req.url);

    if (method === "GET" && pathname === "/health") {
      sendText(res, 200, "ok");
      return;
    }

    if (method === "GET" && pathname === "/") {
      sendText(res, 200, `telegram-deepseek-bot running (mode=${mode})`);
      return;
    }

    if (method === "POST" && pathname === "/telegram") {
      if (mode !== "webhook") {
        sendText(res, 404, "not found");
        return;
      }

      if (typeof telegramHandler !== "function") {
        sendText(res, 503, "webhook handler not ready");
        return;
      }

      try {
        const update = await readJsonBody(req);
        await telegramHandler(update);
        sendText(res, 200, "ok");
      } catch (error) {
        const statusCode = Number(error?.statusCode) || 500;

        if (statusCode >= 500) {
          logError("Webhook request handling failed", {
            message: error?.message || "unknown_error"
          });
        }

        sendText(res, statusCode, statusCode === 400 ? "bad request" : "error");
      }
      return;
    }

    sendText(res, 404, "not found");
  });

  return {
    setTelegramHandler(handler) {
      telegramHandler = typeof handler === "function" ? handler : null;
    },
    start() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(listenPort, () => {
          server.removeListener("error", reject);
          logInfo(`HTTP server listening on :${listenPort}`);
          resolve();
        });
      });
    },
    stop() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}

module.exports = {
  createHttpServer
};
