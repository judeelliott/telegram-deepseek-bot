const { DateTime } = require("luxon");
const memory = require("./memory");
const {
  DEFAULT_FREQUENCY,
  DEFAULT_LANGUAGE,
  DEFAULT_STYLE,
  DEFAULT_TIME_OF_DAY,
  DEFAULT_TIMEZONE,
  getOrCreateUserConfig,
  getUserConfig,
  markUserStarted,
  resetUserConfig,
  saveSetup,
  updateUserConfig
} = require("./db");
const { logInfo } = require("./utils");

const wizardStates = new Map();

const WELCOME_TEXT = [
  "你好，我是基于 DeepSeek 的对话机器人。",
  "",
  "直接发文本消息给我即可开始聊天。",
  "想要定时推送：发 /setup",
  "",
  "个性化自动推送：",
  "1) 发送 /setup 按步骤配置目标/主题/风格/频率/时间",
  "2) 用 /on 开启推送、/off 关闭推送",
  "3) 用 /me 查看当前配置",
  "",
  "常用命令：",
  "/start /setup /me /on /off /set /reset /help /cancel"
].join("\n");

const HELP_TEXT = [
  "可用命令：",
  "/start - 开始使用并注册推送能力",
  "/setup - 分步设置个性化推送",
  "/me - 查看当前配置",
  "/on - 开启自动推送",
  "/off - 关闭自动推送",
  "/set <field> <value> - 快速修改配置",
  "/reset - 清空配置并关闭推送（同时清空会话记忆）",
  "/cancel - 退出 setup 向导",
  "/help - 查看帮助",
  "",
  "自动化快速测试：",
  "1 /setup",
  "2 /set time 设为下一分钟",
  "3 /on",
  "",
  "字段：goal | topics | style | time | frequency | language | timezone",
  "frequency: daily | weekdays | weekly",
  "language: auto | zh | en",
  "timezone 示例: America/Los_Angeles",
  "",
  "示例：",
  "/set goal 英语口语提升",
  "/set topics 口语,发音,商务邮件",
  "/set style 严格纠错",
  "/set time 09:30",
  "/set frequency weekdays",
  "/set language en",
  "/set timezone Asia/Shanghai"
].join("\n");

const WIZARD_STEPS = [
  {
    field: "goal",
    question: "Q1/5 你想要什么帮助？\n例如：英语学习、写作、金融、学习计划、健身等。"
  },
  {
    field: "topics",
    question: "Q2/5 主题/范围（逗号分隔）？\n例如：词汇,听力,商务邮件"
  },
  {
    field: "style",
    question: "Q3/5 风格？\n例如：简洁、详细、严格纠错、鼓励、商务"
  },
  {
    field: "frequency",
    question: "Q4/5 推送频率？\n可选：daily / weekdays / weekly"
  },
  {
    field: "timeOfDay",
    question: "Q5/5 推送时间（24小时制 HH:MM）？默认 09:00"
  }
];

function isCommand(text) {
  return typeof text === "string" && text.trim().startsWith("/");
}

function parseCommand(text) {
  const value = String(text || "").trim();
  if (!value.startsWith("/")) {
    return null;
  }

  const [rawCommand, ...rest] = value.split(/\s+/);
  const commandPart = rawCommand.split("@")[0].toLowerCase();
  const args = rest.join(" ").trim();
  return { command: commandPart, args };
}

function normalizeFrequency(input) {
  const value = String(input || "").trim().toLowerCase();
  if (value === "daily" || value === "weekdays" || value === "weekly") {
    return value;
  }
  return null;
}

function normalizeLanguage(input) {
  const value = String(input || "").trim().toLowerCase();
  if (value === "auto" || value === "zh" || value === "en") {
    return value;
  }
  return null;
}

function normalizeTime(input) {
  const value = String(input || "").trim();
  if (value === "") {
    return DEFAULT_TIME_OF_DAY;
  }

  if (value === "默认" || value.toLowerCase() === "default") {
    return DEFAULT_TIME_OF_DAY;
  }

  const matched = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return matched ? value : null;
}

function normalizeTimezone(input) {
  const value = String(input || "").trim();
  if (!value) {
    return null;
  }
  const now = DateTime.utc().setZone(value);
  return now.isValid ? value : null;
}

function formatConfig(profile) {
  return [
    "当前配置：",
    `goal: ${profile.goal || "(未设置)"}`,
    `topics: ${profile.topics || "(未设置)"}`,
    `style: ${profile.style || DEFAULT_STYLE}`,
    `frequency: ${profile.frequency || DEFAULT_FREQUENCY}`,
    `time: ${profile.timeOfDay || DEFAULT_TIME_OF_DAY}`,
    `timezone: ${profile.timezone || DEFAULT_TIMEZONE}`,
    `language: ${profile.language || DEFAULT_LANGUAGE}`,
    `enabled: ${profile.enabled ? "true" : "false"}`
  ].join("\n");
}

function cancelWizard(chatId) {
  wizardStates.delete(chatId);
}

function hasActiveWizard(chatId) {
  return wizardStates.has(chatId);
}

async function startWizard(bot, chatId) {
  const profile = getUserConfig(chatId);
  if (!profile?.hasStarted) {
    await bot.sendMessage(chatId, "请先发送 /start，然后再使用 /setup。");
    return;
  }

  wizardStates.set(chatId, {
    step: 0,
    draft: {
      frequency: profile.frequency || DEFAULT_FREQUENCY,
      goal: profile.goal || "",
      style: profile.style || DEFAULT_STYLE,
      timeOfDay: profile.timeOfDay || DEFAULT_TIME_OF_DAY,
      topics: profile.topics || ""
    }
  });

  await bot.sendMessage(chatId, "开始分步设置，发送 /cancel 可退出。");
  await bot.sendMessage(chatId, WIZARD_STEPS[0].question);
}

function buildSetUsage() {
  return [
    "用法：/set <field> <value>",
    "可选字段：goal | topics | style | time | frequency | language | timezone",
    "示例：/set frequency weekdays"
  ].join("\n");
}

function parseSetArgs(args) {
  const [rawField, ...rest] = String(args || "").split(/\s+/);
  const field = String(rawField || "").trim().toLowerCase();
  const value = rest.join(" ").trim();
  return { field, value };
}

function validateSetField(field, value) {
  if (field === "goal" || field === "topics" || field === "style") {
    if (!value) {
      return { ok: false, error: `${field} 不能为空。` };
    }
    return { ok: true, update: { [field]: value } };
  }

  if (field === "time") {
    const normalized = normalizeTime(value);
    if (!normalized) {
      return { ok: false, error: "time 格式错误，必须是 HH:MM（24小时制）。" };
    }
    return {
      ok: true,
      update: {
        lastSentAt: null,
        lastSentKey: null,
        timeOfDay: normalized
      }
    };
  }

  if (field === "frequency") {
    const normalized = normalizeFrequency(value);
    if (!normalized) {
      return { ok: false, error: "frequency 必须是 daily 或 weekdays 或 weekly。" };
    }
    return {
      ok: true,
      update: {
        frequency: normalized,
        lastSentAt: null,
        lastSentKey: null
      }
    };
  }

  if (field === "language") {
    const normalized = normalizeLanguage(value);
    if (!normalized) {
      return { ok: false, error: "language 必须是 auto 或 zh 或 en。" };
    }
    return { ok: true, update: { language: normalized } };
  }

  if (field === "timezone") {
    const normalized = normalizeTimezone(value);
    if (!normalized) {
      return {
        ok: false,
        error: "timezone 无效，请使用 IANA 时区，例如 America/Los_Angeles。"
      };
    }
    return {
      ok: true,
      update: {
        lastSentAt: null,
        lastSentKey: null,
        timezone: normalized
      }
    };
  }

  return { ok: false, error: "未知字段。支持：goal/topics/style/time/frequency/language/timezone。" };
}

async function handleSetupStep(bot, msg) {
  const chatId = msg.chat.id;
  const text = String(msg.text || "").trim();
  const wizard = wizardStates.get(chatId);
  if (!wizard) {
    return false;
  }

  const currentStep = WIZARD_STEPS[wizard.step];
  if (!currentStep) {
    cancelWizard(chatId);
    return false;
  }

  if (currentStep.field === "goal") {
    if (!text) {
      await bot.sendMessage(chatId, "goal 不能为空，请重新输入。");
      return true;
    }
    wizard.draft.goal = text;
  } else if (currentStep.field === "topics") {
    if (!text) {
      await bot.sendMessage(chatId, "topics 不能为空，请重新输入（逗号分隔）。");
      return true;
    }
    wizard.draft.topics = text;
  } else if (currentStep.field === "style") {
    if (!text) {
      await bot.sendMessage(chatId, "style 不能为空，请重新输入。");
      return true;
    }
    wizard.draft.style = text;
  } else if (currentStep.field === "frequency") {
    const frequency = normalizeFrequency(text);
    if (!frequency) {
      await bot.sendMessage(chatId, "frequency 仅支持 daily / weekdays / weekly，请重试。");
      return true;
    }
    wizard.draft.frequency = frequency;
  } else if (currentStep.field === "timeOfDay") {
    const timeOfDay = normalizeTime(text);
    if (!timeOfDay) {
      await bot.sendMessage(chatId, "time 格式错误，必须是 HH:MM（24小时制），例如 09:00。");
      return true;
    }
    wizard.draft.timeOfDay = timeOfDay;
  }

  const nextStep = wizard.step + 1;
  if (nextStep >= WIZARD_STEPS.length) {
    saveSetup(chatId, wizard.draft);
    cancelWizard(chatId);
    await bot.sendMessage(chatId, "配置完成，已开启自动推送。可用 /me 查看当前配置。");
    logInfo("Setup wizard completed", { chatId });
    return true;
  }

  wizard.step = nextStep;
  wizardStates.set(chatId, wizard);
  await bot.sendMessage(chatId, WIZARD_STEPS[nextStep].question);
  return true;
}

async function handleCommand(bot, msg) {
  const chatId = msg.chat.id;
  const text = String(msg.text || "").trim();
  const parsed = parseCommand(text);
  if (!parsed) {
    return false;
  }

  const { command, args } = parsed;

  if (command === "/start") {
    markUserStarted(chatId);
    getOrCreateUserConfig(chatId);
    await bot.sendMessage(chatId, WELCOME_TEXT);
    return true;
  }

  if (command === "/help") {
    await bot.sendMessage(chatId, HELP_TEXT);
    return true;
  }

  if (command === "/cancel") {
    if (hasActiveWizard(chatId)) {
      cancelWizard(chatId);
      await bot.sendMessage(chatId, "已退出 setup。");
      return true;
    }
    await bot.sendMessage(chatId, "当前没有进行中的 setup。");
    return true;
  }

  if (command === "/setup") {
    await startWizard(bot, chatId);
    return true;
  }

  if (command === "/me") {
    const profile = getUserConfig(chatId);
    if (!profile?.hasStarted) {
      await bot.sendMessage(chatId, "你还未初始化，请先发送 /start。");
      return true;
    }
    await bot.sendMessage(chatId, formatConfig(profile));
    return true;
  }

  if (command === "/on") {
    const profile = getUserConfig(chatId);
    if (!profile?.hasStarted) {
      await bot.sendMessage(chatId, "请先发送 /start。");
      return true;
    }
    if (!profile.goal || !profile.topics) {
      await bot.sendMessage(chatId, "请先发送 /setup 完成配置后再开启推送。");
      return true;
    }
    updateUserConfig(chatId, { enabled: true });
    await bot.sendMessage(chatId, "自动推送已开启。");
    return true;
  }

  if (command === "/off") {
    const profile = getUserConfig(chatId);
    if (!profile?.hasStarted) {
      await bot.sendMessage(chatId, "请先发送 /start。");
      return true;
    }
    updateUserConfig(chatId, { enabled: false });
    await bot.sendMessage(chatId, "自动推送已关闭。");
    return true;
  }

  if (command === "/set") {
    const profile = getUserConfig(chatId);
    if (!profile?.hasStarted) {
      await bot.sendMessage(chatId, "请先发送 /start。");
      return true;
    }

    if (!args) {
      await bot.sendMessage(chatId, buildSetUsage());
      return true;
    }

    const { field, value } = parseSetArgs(args);
    if (!field || !value) {
      await bot.sendMessage(chatId, buildSetUsage());
      return true;
    }

    const validation = validateSetField(field, value);
    if (!validation.ok) {
      await bot.sendMessage(chatId, validation.error);
      return true;
    }

    updateUserConfig(chatId, validation.update);
    const updated = getUserConfig(chatId);
    await bot.sendMessage(chatId, `已更新 ${field}。\n\n${formatConfig(updated)}`);
    return true;
  }

  if (command === "/reset") {
    resetUserConfig(chatId);
    memory.reset(chatId);
    cancelWizard(chatId);
    await bot.sendMessage(chatId, "已清空个性化配置并关闭自动推送，会话记忆也已重置。");
    return true;
  }

  await bot.sendMessage(chatId, "未知命令。发送 /help 查看可用命令。");
  return true;
}

module.exports = {
  handleCommand,
  handleSetupStep,
  hasActiveWizard,
  isCommand
};
