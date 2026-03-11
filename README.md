# AnyRouter Panel

AnyRouter 签到面板 —— 自动签到、余额查询、Telegram 通知，支持多账号独立代理。

## 功能

- 多账号管理（添加、编辑、启停、删除）
- 自动定时签到（Cron 表达式，默认每天 9:00）
- 手动签到（单个 / 全部）
- 余额查询（签到后自动查询）
- Telegram 通知
- 每个账号可单独配置代理，实现不同 IP 签到
- 面板密码保护

## 快速开始

### Docker 部署（推荐）

```bash
git clone <repo-url> && cd anyrouter
docker compose up -d
```

面板运行在 `http://你的IP:3000`。

数据持久化在 Docker volume `data` 中（SQLite 数据库 `/data/anyrouter.db`）。

### 手动运行

需要 Node.js >= 20。

```bash
npm install
node server.js
```

## 使用教程

### 1. 首次登录

打开 `http://你的IP:3000`，首次无密码直接进入。建议在「系统设置」中设置面板密码。

### 2. 添加账号

1. 点击「+ 添加」展开表单
2. 填写以下字段：

| 字段 | 说明 |
|------|------|
| 备注名称 | 账号备注，方便识别 |
| Session | **必填**，AnyRouter 的 session cookie 值 |
| 账号 / 密码 | 选填备忘，仅面板内展示 |
| API Key | 选填备忘 |
| 备注 | 其他备注信息 |
| 代理地址 | 选填，格式 `http://IP:3001`，留空则直连 |

3. 点击「保存」

### 3. 签到

- **手动签到**：点击账号操作栏的「签到」按钮，或点击页头「全部签到」
- **自动签到**：在「系统设置」中配置 Cron 表达式，默认 `0 9 * * *`（每天 9:00 北京时间）

签到后会自动查询余额并更新。

### 4. 编辑账号

1. 点击账号的「详情」按钮
2. 点击「编辑」
3. 修改需要的字段（Session 字段留空则不修改，填入新值则更新）
4. 点击「保存」

### 5. 系统设置

| 设置项 | 说明 |
|--------|------|
| 上游地址 | AnyRouter 上游 URL，默认 `https://anyrouter.top` |
| Cron | 定时签到表达式，如 `0 9 * * *`、`0 8,20 * * *` |
| TG Token | Telegram Bot Token，用于签到结果推送 |
| TG Chat ID | Telegram 接收通知的 Chat ID |
| 面板密码 | 设置后访问面板需输入密码，留空则无需密码 |

## 代理服务

当所有账号从同一台服务器签到时，AnyRouter 可能检测到同 IP 多账号。代理服务解决这个问题：每个账号通过不同代理服务器发出请求，实现不同 IP 签到。

### 架构

```
无代理：面板机 ──────────────────────→ anyrouter.top
有代理：面板机 → 代理服务器:3001/proxy → anyrouter.top
```

### 部署代理服务

将 `anyrouter-proxy/` 目录上传到**另一台服务器**：

```bash
cd anyrouter-proxy
docker compose up -d
```

代理服务运行在该服务器的 **3001** 端口。

> 代理服务无鉴权，建议通过防火墙限制仅面板机 IP 可访问 3001 端口。

### 配置账号代理

在面板中添加或编辑账号时，填写「代理地址」字段：

```
http://代理服务器IP:3001
```

### 多 IP 示例

| 账号 | 代理地址 | 出口 IP |
|------|----------|---------|
| 账号 A | 留空 | 面板机 IP（直连） |
| 账号 B | `http://1.2.3.4:3001` | 1.2.3.4 |
| 账号 C | `http://5.6.7.8:3001` | 5.6.7.8 |

可在任意数量的服务器上部署代理服务，每台服务器一个实例。

## 项目结构

```
anyrouter/
├── server.js              # Express 服务端
├── checkin.js             # 签到 / 余额查询核心逻辑
├── db.js                  # SQLite 数据库初始化
├── package.json
├── Dockerfile
├── docker-compose.yml
├── public/
│   ├── index.html         # 前端页面
│   └── js/
│       ├── app.js         # 入口：认证、初始化
│       ├── utils.js       # 工具函数、API 封装
│       ├── accounts.js    # 账号管理逻辑
│       ├── logs.js        # 日志展示
│       └── settings.js    # 设置管理
└── anyrouter-proxy/
    ├── index.js           # 代理转发服务
    ├── package.json
    ├── Dockerfile
    └── docker-compose.yml
```

## 技术栈

- **后端**：Node.js + Express + better-sqlite3 + node-cron
- **前端**：Tailwind CSS（自然有机风）+ ES Modules
- **代理**：Node.js + Express（轻量 HTTP 转发）
- **部署**：Docker / Docker Compose
