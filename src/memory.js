const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGES = MAX_HISTORY_MESSAGES + 1;
const SYSTEM_PROMPT = [
  "You are a Telegram bot assistant.",
  "Reply concisely, clearly, and in the user's language.",
  "Never claim this bot cannot do scheduled reminders or proactive pushes.",
  "If user asks about reminders/scheduling/automation/daily push, state it is supported after setup and show steps exactly: /setup -> /me -> /set timezone -> /set time -> /on.",
  "Add one short reminder: scheduled pushes only work for users who already used /start and have push enabled.",
  "If user is just casual chatting, do not force automation instructions.",
  "If user only sends a greeting like hello/hi/你好/在吗/?, reply with one short question asking what they want (chat/translation/English correction/scheduled push) and mention /help.",
  "Do not give long irrelevant advice."
].join(" ");

const chatMemory = new Map();

function createInitialMessages() {
  return [{ role: "system", content: SYSTEM_PROMPT }];
}

function trimMessages(messages) {
  if (messages.length <= MAX_MESSAGES) {
    return messages;
  }

  const system = messages[0];
  const recent = messages.slice(-MAX_HISTORY_MESSAGES);
  return [system, ...recent];
}

function ensureChat(chatId) {
  if (!chatMemory.has(chatId)) {
    chatMemory.set(chatId, createInitialMessages());
  }
  return chatMemory.get(chatId);
}

function getMessages(chatId) {
  const messages = ensureChat(chatId);
  return [...messages];
}

function addUserMessage(chatId, text) {
  const messages = ensureChat(chatId);
  messages.push({ role: "user", content: text });
  chatMemory.set(chatId, trimMessages(messages));
}

function addAssistantMessage(chatId, text) {
  const messages = ensureChat(chatId);
  messages.push({ role: "assistant", content: text });
  chatMemory.set(chatId, trimMessages(messages));
}

function reset(chatId) {
  chatMemory.set(chatId, createInitialMessages());
}

module.exports = {
  addAssistantMessage,
  addUserMessage,
  appendAssistant: addAssistantMessage,
  appendUser: addUserMessage,
  getMessages,
  reset
};
