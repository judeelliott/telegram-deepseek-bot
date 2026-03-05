const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGES = MAX_HISTORY_MESSAGES + 1;
const SYSTEM_PROMPT =
  "You are a helpful assistant. Reply concisely, clearly, and in the user's language.";

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
