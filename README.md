# US Calculator Hub (Freelance Tax + Refinance + Staking)

一个面向美国用户使用习惯的多计算器网站，包含：

- `Freelance Tax Calculator`（可切换州，估算联邦税 + 自雇税 + 州税）
- `Mortgage Refinance Calculator`（月供变化、利息变化、回本周期）
- `Crypto Multi-Chain Staking Calculator`（多链配置、复利收益）

## 1. 快速启动

```bash
npm run refresh:taxes
npm start
# 打开 http://localhost:3000
```

开发模式（自动重启）：

```bash
npm run dev
```

## 2. 税率数据更新机制

### 2.1 持久化路径（生产推荐）

默认数据文件路径：

```text
data/tax-rates.json
```

生产环境可通过环境变量指定路径（例如挂载到 EFS）：

```bash
TAX_DATA_PATH=/mnt/tax-data/tax-rates.json npm start
```

建议在容器平台（ECS/Fargate）挂载 EFS 到 `/mnt/tax-data`，确保每次服务发布/重启后数据仍保留。

项目内置两种更新方式：

1. 服务启动后自动检查
- 如果本地税率数据超过 24 小时未更新，则自动刷新。

2. 每日定时更新
- 服务内置定时器，每天在 `America/New_York` 时间约 `05:00` 自动抓取更新。

手动触发更新：

```bash
npm run refresh:taxes
```

或通过 API：

```bash
POST /api/admin/refresh-taxes
```

如需加 token 校验，可设置环境变量：

```bash
ADMIN_REFRESH_TOKEN=your_token npm start
```

然后调用：

```bash
POST /api/admin/refresh-taxes?token=your_token
```

## 3. 抓取来源（可扩展）

当前后端抓取：

- Federal Brackets:
  - `https://taxfoundation.org/data/all/federal/{year}-tax-brackets/`
- State Income Tax Rates:
  - `https://taxfoundation.org/data/all/state/state-income-tax-rates-{year}/`

后端会优先尝试当年数据，并自动回退到相邻年份。若抓取失败，保留历史已成功数据，避免线上服务中断。

## 4. API 概览

- `GET /api/health`
- `GET /api/public-config`
- `GET /api/tax-data/meta`
- `GET /api/states`
- `GET /api/tax-data?state=CA`
- `POST /api/calculate/freelance`
- `POST /api/calculate/refinance`
- `POST /api/calculate/staking`
- `POST /api/admin/refresh-taxes`
- `GET /robots.txt`
- `GET /sitemap.xml`

## 5. 接入 Google AdSense

项目已内置 AdSense 广告位（页面顶部 + 底部），通过环境变量开启：

```bash
ADSENSE_CLIENT_ID=ca-pub-1234567890123456 \
ADSENSE_SLOT_TOP=1234567890 \
ADSENSE_SLOT_BOTTOM=9876543210 \
npm start
```

说明：

- `ADSENSE_CLIENT_ID` 必须是 `ca-pub-` 开头的发布商 ID。
- `ADSENSE_SLOT_TOP` / `ADSENSE_SLOT_BOTTOM` 是对应广告单元 slot ID（数字）。
- 未配置或格式不合法时，前端会自动跳过广告渲染，不影响计算器功能。
- 本地 `localhost` 调试时可能不展示真实广告位，线上域名通过审核后会正常填充。

## 6. SEO 优化与配置

项目已内置以下 SEO 技术项：

- `canonical` / `Open Graph` / `Twitter Card` 元标签
- `JSON-LD` 结构化数据（`WebSite` + `WebPage`）
- 动态 `robots.txt`
- 动态 `sitemap.xml`

推荐在生产环境设置站点主域名（用于稳定输出 canonical 与 sitemap）：

```bash
SITE_URL=https://your-domain.com npm start
```

上线后建议：

1. 在 Google Search Console 提交 `https://your-domain.com/sitemap.xml`
2. 使用 Search Console 的 URL 检查工具请求首页重新抓取
3. 每次关键内容改动后复查 “已编入索引” 状态和抓取错误

## 7. 目录结构

```text
.
├── data/
│   └── tax-rates.json
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── server/
│   ├── index.js
│   ├── refresh-tax-data.js
│   └── lib/
│       ├── dataStore.js
│       ├── parseHelpers.js
│       ├── scheduler.js
│       ├── stateCatalog.js
│       ├── taxDataFetcher.js
│       ├── taxMath.js
│       └── taxUpdater.js
├── package.json
└── README.md
```

## 8. 合规提示

- 当前结果是估算器，不是报税申报结果。
- 未覆盖全部税务细节（例如地方税、全部抵免、AMT、特定 pass-through 规则）。
- 用于报税前请务必以 IRS / 州税务部门和注册税务师意见为准。

## 9. 一键登录与一键部署（VPS）

新增脚本：

- `scripts/vps-tool.sh`

支持模式：

- `login`：一键登录 VPS
- `deploy`：一键同步代码 + 安装依赖 + 重启服务 + 健康检查
- `deploy-login`：先部署再进入 VPS shell

### 9.1 准备配置

```bash
cp .vps.env.example .vps.env
```

按需修改 `.vps.env`：

```bash
VPS_HOST=97.64.82.143
VPS_PORT=22
VPS_USER=root
VPS_APP_DIR=/opt/us-tax-calc
VPS_PASSWORD=your_password
```

### 9.2 执行

```bash
chmod +x scripts/vps-tool.sh

# 一键登录
./scripts/vps-tool.sh login

# 一键部署
./scripts/vps-tool.sh deploy

# 先部署再登录
./scripts/vps-tool.sh deploy-login
```

脚本会自动排除 `.git/` 和 `EXECUTION_LOG.md`，并在部署后检查：

- `systemctl is-active us-tax-calc.service`
- `http://127.0.0.1:3000/api/health`
- `http://<VPS_HOST>/api/health`
