# Telegram + DeepSeek 对话机器人（Node.js）

一个可直接运行的 Telegram 机器人：接收用户文本消息，调用 DeepSeek Chat Completions 生成回复并回发。

默认使用 `long polling`（本地即可跑，不需要公网 HTTPS）。也支持切换到 `webhook` 模式。

## 功能

- `/start` 欢迎语与使用说明
- `/reset` 清空当前会话记忆
- 仅处理文本消息（图片/文件/语音会忽略）
- 调用 DeepSeek 前先发送 `typing` 状态
- 会话记忆（按 chatId）：最多 21 条消息（含 system）
- 限流：每分钟最多 20 条、单条最多 4000 字符
- 预留每日免费额度（内存计数，非持久化）
- 错误处理与简洁日志（不泄露 key/堆栈）
- 无论 `MODE=polling` 还是 `MODE=webhook`，都会监听 `PORT` 并提供健康检查

## 前置条件

- Node.js 18+
- 已通过 BotFather 创建 Telegram 机器人并拿到 `TELEGRAM_BOT_TOKEN`
- 已准备 DeepSeek API Key

## 环境变量

复制并编辑配置：

```bash
cp .env.example .env
```

`.env` 关键项：

- `TELEGRAM_BOT_TOKEN=`
- `DEEPSEEK_API_KEY=`
- `DEEPSEEK_MODEL=deepseek-chat`
- `MODE=polling`（默认）或 `webhook`
- `PORT=3000`（所有模式都会监听）
- `WEBHOOK_URL=`（仅 webhook 使用，如 `https://example.com/telegram`）

可选项：

- `DAILY_FREE_LIMIT=0`（0 表示不限制；>0 表示每日免费请求上限）

## HTTP 端点（两种模式都可用）

- `GET /health` -> `200 OK`，返回 `ok`
- `GET /` -> `200 OK`，返回简短运行信息（包含当前 `MODE`）
- `POST /telegram` -> 仅 `webhook` 模式启用

## 安装与运行（Polling）

```bash
cp .env.example .env
npm install
npm start
```

或显式指定：

```bash
npm run start:polling
```

说明：

- 确保 `MODE=polling`
- `polling` 与 `webhook` 不要同时启用
- 若你之前用过 webhook，先执行 `deleteWebhook`（见下文，建议 `drop_pending_updates=true`）

## 切换到 Webhook 模式

Webhook 需要公网可访问的 HTTPS URL。

1. 设置 `.env`：

```env
MODE=webhook
PORT=3000
WEBHOOK_URL=https://example.com/telegram
```

2. 启动服务：

```bash
npm run start:webhook
```

服务会监听 `POST /telegram`，并在启动时尝试调用 Telegram `setWebhook`。

### 手动设置 webhook（推荐）

请把 `<BOT_TOKEN>` 与 `<WEBHOOK_URL>` 替换为实际值：

```bash
curl -sS "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"<WEBHOOK_URL>","drop_pending_updates":true}'
```

### 删除 webhook（切回 polling 前建议执行）

```bash
curl -sS "https://api.telegram.org/bot<BOT_TOKEN>/deleteWebhook" \
  -H "Content-Type: application/json" \
  -d '{"drop_pending_updates":true}'
```

你也可以先查看当前 webhook 状态：

```bash
curl -sS "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

## Deploy to Render (Free)

1. 创建 GitHub 仓库。

2. 上传代码：

```bash
git init
git add .
git commit -m "deploy bot"
```

3. 推送到 GitHub：

```bash
git remote add origin YOUR_REPO
git push -u origin main
```

4. 打开 [Render](https://render.com)。

5. 点击 `New -> Web Service`。

6. 选择你的 GitHub 仓库。

7. Render 会自动识别项目根目录的 `render.yaml`。

8. 在 Render 设置环境变量：

- `TELEGRAM_BOT_TOKEN`
- `DEEPSEEK_API_KEY`

9. 点击 `Deploy`。

### Polling 模式先清理 webhook

如果你要以 `MODE=polling` 部署，先删除 webhook，避免 webhook 与 polling 冲突：

```bash
curl -sS "https://api.telegram.org/bot<BOT_TOKEN>/deleteWebhook?drop_pending_updates=true"
```

### 部署成功验证

部署完成后访问：

`https://your-app.onrender.com/health`

应返回：

`ok`

## 常见问题

1. 机器人不回复

- 确认程序正在运行
- 先发 `/start`
- 若使用 polling，先执行 `deleteWebhook`，避免 webhook 与 polling 冲突

2. DeepSeek API 报错

- 检查 `Authorization: Bearer <DEEPSEEK_API_KEY>` 是否正确
- 检查模型名（默认 `deepseek-chat`）
- 检查网络连通性

3. 程序启动即退出

- 检查 `.env` 是否配置了 `TELEGRAM_BOT_TOKEN` 和 `DEEPSEEK_API_KEY`

## 项目结构

```text
.
├── package.json
├── .env.example
├── README.md
└── src
    ├── index.js
    ├── httpServer.js
    ├── deepseek.js
    ├── memory.js
    ├── rateLimit.js
    ├── utils.js
    └── telegram
        ├── polling.js
        └── webhook.js
```

## 安全提醒

- 不要把 `.env`、token、API key 提交到公开仓库
- 已在 `.gitignore` 中忽略 `.env`
- 日志中不要打印密钥
