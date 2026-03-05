const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { logInfo } = require("./utils");

const DEFAULT_LANGUAGE = "auto";
const DEFAULT_STYLE = "简洁";
const DEFAULT_FREQUENCY = "daily";
const DEFAULT_TIME_OF_DAY = "09:00";
const DEFAULT_TIMEZONE = "America/Los_Angeles";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "bot.db");

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS user_configs (
    chat_id INTEGER PRIMARY KEY,
    has_started INTEGER NOT NULL DEFAULT 0,
    language TEXT NOT NULL DEFAULT '${DEFAULT_LANGUAGE}',
    goal TEXT NOT NULL DEFAULT '',
    topics TEXT NOT NULL DEFAULT '',
    style TEXT NOT NULL DEFAULT '${DEFAULT_STYLE}',
    frequency TEXT NOT NULL DEFAULT '${DEFAULT_FREQUENCY}',
    time_of_day TEXT NOT NULL DEFAULT '${DEFAULT_TIME_OF_DAY}',
    timezone TEXT NOT NULL DEFAULT '${DEFAULT_TIMEZONE}',
    enabled INTEGER NOT NULL DEFAULT 0,
    last_sent_at TEXT,
    last_sent_key TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_user_configs_enabled
  ON user_configs (enabled, has_started);
`);

const insertUserStmt = db.prepare(`
  INSERT INTO user_configs (chat_id, created_at, updated_at)
  VALUES (@chatId, @now, @now)
  ON CONFLICT(chat_id) DO NOTHING
`);

const getUserStmt = db.prepare(`
  SELECT
    chat_id,
    has_started,
    language,
    goal,
    topics,
    style,
    frequency,
    time_of_day,
    timezone,
    enabled,
    last_sent_at,
    last_sent_key,
    created_at,
    updated_at
  FROM user_configs
  WHERE chat_id = ?
`);

const listEnabledStmt = db.prepare(`
  SELECT
    chat_id,
    has_started,
    language,
    goal,
    topics,
    style,
    frequency,
    time_of_day,
    timezone,
    enabled,
    last_sent_at,
    last_sent_key,
    created_at,
    updated_at
  FROM user_configs
  WHERE enabled = 1 AND has_started = 1
`);

const COLUMN_MAP = {
  enabled: "enabled",
  frequency: "frequency",
  goal: "goal",
  hasStarted: "has_started",
  language: "language",
  lastSentAt: "last_sent_at",
  lastSentKey: "last_sent_key",
  style: "style",
  timeOfDay: "time_of_day",
  timezone: "timezone",
  topics: "topics"
};

function nowIso() {
  return new Date().toISOString();
}

function toDbBoolean(value) {
  return value ? 1 : 0;
}

function ensureUser(chatId) {
  insertUserStmt.run({
    chatId: Number(chatId),
    now: nowIso()
  });
}

function normalizeRow(row) {
  if (!row) {
    return null;
  }

  return {
    chatId: row.chat_id,
    createdAt: row.created_at,
    enabled: row.enabled === 1,
    frequency: row.frequency || DEFAULT_FREQUENCY,
    goal: row.goal || "",
    hasStarted: row.has_started === 1,
    language: row.language || DEFAULT_LANGUAGE,
    lastSentAt: row.last_sent_at || null,
    lastSentKey: row.last_sent_key || null,
    style: row.style || DEFAULT_STYLE,
    timeOfDay: row.time_of_day || DEFAULT_TIME_OF_DAY,
    timezone: row.timezone || DEFAULT_TIMEZONE,
    topics: row.topics || "",
    updatedAt: row.updated_at
  };
}

function getUserConfig(chatId) {
  const row = getUserStmt.get(Number(chatId));
  return normalizeRow(row);
}

function getOrCreateUserConfig(chatId) {
  ensureUser(chatId);
  return getUserConfig(chatId);
}

function updateUserConfig(chatId, fields = {}) {
  ensureUser(chatId);

  const updates = [];
  const params = { chatId: Number(chatId), updatedAt: nowIso() };

  for (const [key, value] of Object.entries(fields)) {
    const column = COLUMN_MAP[key];
    if (!column) {
      continue;
    }

    const paramName = `field_${key}`;
    updates.push(`${column} = @${paramName}`);

    if (key === "enabled" || key === "hasStarted") {
      params[paramName] = toDbBoolean(value);
      continue;
    }

    params[paramName] = value;
  }

  if (updates.length === 0) {
    return getUserConfig(chatId);
  }

  updates.push("updated_at = @updatedAt");
  const stmt = db.prepare(`
    UPDATE user_configs
    SET ${updates.join(", ")}
    WHERE chat_id = @chatId
  `);

  stmt.run(params);
  return getUserConfig(chatId);
}

function saveSetup(chatId, setup = {}) {
  return updateUserConfig(chatId, {
    goal: setup.goal || "",
    topics: setup.topics || "",
    style: setup.style || DEFAULT_STYLE,
    frequency: setup.frequency || DEFAULT_FREQUENCY,
    timeOfDay: setup.timeOfDay || DEFAULT_TIME_OF_DAY,
    enabled: true,
    lastSentAt: null,
    lastSentKey: null
  });
}

function markUserStarted(chatId) {
  return updateUserConfig(chatId, { hasStarted: true });
}

function resetUserConfig(chatId) {
  ensureUser(chatId);

  const stmt = db.prepare(`
    UPDATE user_configs
    SET
      language = @language,
      goal = '',
      topics = '',
      style = @style,
      frequency = @frequency,
      time_of_day = @timeOfDay,
      timezone = @timezone,
      enabled = 0,
      last_sent_at = NULL,
      last_sent_key = NULL,
      updated_at = @updatedAt
    WHERE chat_id = @chatId
  `);

  stmt.run({
    chatId: Number(chatId),
    frequency: DEFAULT_FREQUENCY,
    language: DEFAULT_LANGUAGE,
    style: DEFAULT_STYLE,
    timeOfDay: DEFAULT_TIME_OF_DAY,
    timezone: DEFAULT_TIMEZONE,
    updatedAt: nowIso()
  });

  return getUserConfig(chatId);
}

function listEnabledUsers() {
  return listEnabledStmt.all().map(normalizeRow);
}

logInfo("SQLite initialized", { dbPath: DB_PATH });

module.exports = {
  DB_PATH,
  DEFAULT_FREQUENCY,
  DEFAULT_LANGUAGE,
  DEFAULT_STYLE,
  DEFAULT_TIME_OF_DAY,
  DEFAULT_TIMEZONE,
  getOrCreateUserConfig,
  getUserConfig,
  listEnabledUsers,
  markUserStarted,
  resetUserConfig,
  saveSetup,
  updateUserConfig
};
