const { clipText, logError } = require("./utils");

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

function normalizeReply(content) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

async function callDeepSeek(messages) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY");
  }

  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  let response;
  try {
    response = await fetch(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7
      })
    });
  } catch (error) {
    logError("DeepSeek request network failure", {
      message: error?.message || "unknown_error"
    });
    throw new Error("DeepSeek API request failed");
  }

  if (!response.ok) {
    const errorText = await response.text();
    logError("DeepSeek API returned non-2xx", {
      status: response.status,
      responseSnippet: clipText(errorText, 300)
    });
    throw new Error("DeepSeek API request failed");
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    logError("DeepSeek response JSON parse failed", {
      message: error?.message || "unknown_error"
    });
    throw new Error("DeepSeek API response parse failed");
  }

  const reply = normalizeReply(data?.choices?.[0]?.message?.content);

  if (!reply) {
    logError("DeepSeek response missing assistant content");
    throw new Error("DeepSeek API response format invalid");
  }

  return reply;
}

module.exports = {
  callDeepSeek,
  chatCompletion: callDeepSeek
};
