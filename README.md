# Telegram + DeepSeek 对话机器人（Node.js）

一个可直接运行的 Telegram 机器人：接收用户文本消息，调用 DeepSeek Chat Completions 生成回复并回发。

默认使用 `long polling`（本地即可跑，不需要公网 HTTPS）。也支持切换到 `webhook` 模式。

## 功能

- 普通聊天：文本消息 -> DeepSeek -> 回发
- 会话记忆（按 `chatId`）：最多 21 条消息（含 system）
- 限流：每分钟最多 20 条、单条最多 4000 字符
- 个性化自动推送（多用户）
- 用户配置持久化到 SQLite（`./data/bot.db`）
- 定时调度器（默认每 60 秒 tick）
- `MODE=polling` / `MODE=webhook` 都支持
- `GET /health` 健康检查

## Personalized Automation

每个用户可以配置自己的：

- `goal`：想要的帮助目标（英语、写作、金融、健身等）
- `topics`：主题范围（逗号分隔）
- `style`：输出风格（简洁/详细/严格纠错/鼓励/商务等）
- `frequency`：`daily` / `weekdays` / `weekly`
- `timeOfDay`：推送时间（`HH:MM`，24 小时制）
- `timezone`：IANA 时区（默认 `America/Los_Angeles`）
- `language`：`auto` / `zh` / `en`
- `enabled`：是否开启自动推送

说明：

- 机器人只能给发送过 `/start` 的用户推送（需要先建立可用 `chatId` 配置记录）。
- 推送内容只使用用户自己配置的 `goal/topics/style/language` 来生成，不使用隐私信息。

## 命令列表

- `/start`：欢迎语 + 引导使用 `/setup`
- `/setup`：进入 5 步配置向导（可 `/cancel` 中途退出）
- `/me`：查看当前配置
- `/on`：开启自动推送
- `/off`：关闭自动推送
- `/set <field> <value>`：快速改单个字段
- `/reset`：清空配置并关闭推送（同时重置会话记忆）
- `/help`：查看帮助
- `/cancel`：退出 setup 向导

### /setup 分步设置

`/setup` 会依次提问：

1. 你想要什么帮助？（`goal`）
2. 主题/范围（`topics`，逗号分隔）
3. 风格（`style`）
4. 推送频率（`frequency`: `daily|weekdays|weekly`）
5. 推送时间（`timeOfDay`: `HH:MM`，默认 `09:00`）

完成后自动保存并开启推送，可用 `/me` 查看。

### /set 示例

```bash
/set goal 英语口语提升
/set topics 口语,发音,商务邮件
/set style 严格纠错
/set time 09:30
/set frequency weekdays
/set language en
/set timezone America/Los_Angeles
```

## Scheduler 工作原理

- 调度器模块：`src/scheduler.js`
- 默认每 60 秒扫描一次数据库中的 `enabled=true` 用户
- 按用户 `timezone + frequency + timeOfDay` 判断是否到点
- 防重复：
  - `daily` / `weekdays`: `lastSentKey = YYYY-MM-DD`
  - `weekly`: `lastSentKey = YYYY-WW`（ISO 周）
- 单用户推送失败只记录日志，不会导致整个 scheduler 崩溃

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
- `PORT=3000`
- `WEBHOOK_URL=`（仅 webhook 使用，如 `https://example.com/telegram`）

可选项：

- `DAILY_FREE_LIMIT=0`（0 表示不限制）
- `SCHEDULER_TICK_MS=60000`（调度器扫描间隔，最小 10000）

## HTTP 端点

- `GET /health` -> `ok`
- `GET /` -> 运行信息（含 `MODE`）
- `POST /telegram` -> 仅 `webhook` 模式启用

## 安装与运行（Polling）

```bash
cp .env.example .env
npm install
npm start
```

或显式：

```bash
npm run start:polling
```

## 切换到 Webhook 模式

1. 设置 `.env`：

```env
MODE=webhook
PORT=3000
WEBHOOK_URL=https://example.com/telegram
```

2. 启动：

```bash
npm run start:webhook
```

## Deploy to Render (Free)

`render.yaml` 已包含基础 Web Service 配置。设置以下环境变量：

- `TELEGRAM_BOT_TOKEN`
- `DEEPSEEK_API_KEY`

## Auto deploy to Render from GitHub

本项目已支持两种触发 Render 部署的方式：

- A. Auto-Deploy（默认）：Render 服务连接的 GitHub 分支（如 `main`）有新 commit 时自动部署。
- B. Deploy Hook（强制触发）：GitHub Actions 在每次 push 到 `main` 后调用 Deploy Hook URL，主动触发一次部署。

### 1) Render 侧准备

1. 打开 Render 控制台，进入你的 Web Service。
2. 确认服务已连接 GitHub 仓库 `judeelliott/telegram-deepseek-bot`，分支为 `main`。
3. 在 Render 服务中配置运行环境变量（至少）：
   - `TELEGRAM_BOT_TOKEN`
   - `DEEPSEEK_API_KEY`
4. （Deploy Hook 模式）进入 `Settings -> Deploy Hook`，复制 Deploy Hook URL。

### 2) GitHub 侧准备（Deploy Hook 模式）

1. 打开仓库 `Settings -> Secrets and variables -> Actions`。
2. 点击 `New repository secret`。
3. 填写：
   - `Name`: `RENDER_DEPLOY_HOOK_URL`
   - `Value`: 粘贴上一步复制的 Render Deploy Hook URL

仓库已包含 workflow：`.github/workflows/render-deploy.yml`，触发条件为 `push` 到 `main`。  
该 workflow 会读取 `RENDER_DEPLOY_HOOK_URL` 并用 `curl` 调用 Hook；调用失败时 workflow 会失败。日志只输出 `triggered`，不会打印完整 hook URL。

### 3) 本地一条命令 push

macOS / Linux：

```bash
chmod +x scripts/push.sh
./scripts/push.sh
```

Windows PowerShell：

```powershell
.\scripts\push.ps1
```

脚本行为：

- 确保在 Git 仓库根目录执行
- 若 `origin` 不存在，自动设置为 `https://github.com/judeelliott/telegram-deepseek-bot.git`
- 执行 `git add .` -> `git commit -m "update"` -> `git push origin main`
- 若没有变更，会提示并正常退出（不报错）

### 4) 验证是否生效

1. 本地运行 `scripts/push.sh`（或 `scripts/push.ps1`）并成功 push 到 `main`。
2. 打开 GitHub `Actions` 页面，确认 `Render Deploy` workflow 成功。
3. 打开 Render 的 `Deploys` 页面，确认出现新的 deploy 记录。

### 5) Deploy Hook 的 ref 用法（可选）

当前 workflow 默认在 hook URL 后追加 `?ref=${{ github.sha }}`（或 `&ref=...`）来部署当前 commit。  
如果你希望只使用原始 hook URL，也可以把 workflow 中的 `trigger_url` 改为 `hook_url` 后直接 `POST`。

### Render Free 限制（重要）

- Render Free 实例的本地磁盘可能在重启/迁移后丢失。
- 本项目当前用 SQLite（`./data/bot.db`）实现持久化，适合先跑通功能。
- 若需要真正持久化，建议升级到托管 Postgres，并把 `src/db.js` 的存储层替换为 Postgres 驱动与 SQL。

## 常见问题

1. 机器人不回复
- 确认程序正在运行
- 先发 `/start`
- 若使用 polling，先执行 `deleteWebhook`，避免 webhook 与 polling 冲突

2. DeepSeek API 报错
- 检查 `DEEPSEEK_API_KEY` 是否正确
- 检查模型名（默认 `deepseek-chat`）
- 检查网络连通性

3. 程序启动即退出
- 检查 `.env` 是否配置了 `TELEGRAM_BOT_TOKEN` 和 `DEEPSEEK_API_KEY`

## 项目结构

```text
.
├── data
│   └── bot.db
├── package.json
├── README.md
└── src
    ├── index.js
    ├── httpServer.js
    ├── deepseek.js
    ├── memory.js
    ├── rateLimit.js
    ├── db.js
    ├── commands.js
    ├── messageHandler.js
    ├── scheduler.js
    └── telegram
        ├── polling.js
        └── webhook.js
```

## 安全提醒

- 不要把 `.env`、token、API key 提交到公开仓库
- `.env` 已在 `.gitignore`
- 日志中不要打印密钥
