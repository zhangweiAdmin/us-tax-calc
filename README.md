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
- `GET /api/tax-data/meta`
- `GET /api/states`
- `GET /api/tax-data?state=CA`
- `POST /api/calculate/freelance`
- `POST /api/calculate/refinance`
- `POST /api/calculate/staking`
- `POST /api/admin/refresh-taxes`
- `GET /robots.txt`
- `GET /sitemap.xml`
- `GET /ads.txt`

## 5. SEO 优化与配置

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

## 5.1 长文内容库

项目已内置可重复生成的长文页面脚本（每篇自动校验不少于 800 词）：

```bash
node scripts/generate-articles.mjs
```

执行后会生成：

- `public/articles/index.html`（文章列表页）
- `public/articles/<slug>/index.html`（20 篇文章页）
- `public/articles/manifest.json`（标题、slug、字数清单）

## 5.2 AdSense 审核代码（仅站点验证）

如需向 AdSense 提交站点审核，可在生产环境配置：

```bash
ADSENSE_CLIENT_ID=ca-pub-1234567890123456 npm start
```

说明：

- 仅在配置合法 `ca-pub-` ID 时，服务端会向 HTML `<head>` 注入审核脚本。
- 同时会输出 `GET /ads.txt`（未配置时返回占位提示）。
- 当前不自动渲染页面广告位，仅用于站点审核与所有权验证。

## 6. 目录结构

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

## 7. 合规提示

- 当前结果是估算器，不是报税申报结果。
- 未覆盖全部税务细节（例如地方税、全部抵免、AMT、特定 pass-through 规则）。
- 用于报税前请务必以 IRS / 州税务部门和注册税务师意见为准。

## 8. 一键登录与一键部署（VPS）

新增脚本：

- `scripts/vps-tool.sh`

支持模式：

- `login`：一键登录 VPS
- `deploy`：一键同步代码 + 安装依赖 + 重启服务 + 健康检查
- `deploy-login`：先部署再进入 VPS shell

### 8.1 准备配置

```bash
cp .vps.env.example .vps.env
```

按需修改 `.vps.env`：

```bash
VPS_HOST=your_server_ip_or_domain
VPS_PORT=22
VPS_USER=root
VPS_APP_DIR=/opt/us-tax-calc
VPS_PASSWORD=your_password
```

### 8.2 执行

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

## 9. 域名邮箱转发（`coco@zlxjy.com -> 785432128@qq.com`）

新增脚本：

- `scripts/email-forwarding-improvmx.sh`

支持模式：

- `template`：输出 DNS 记录模板
- `check-dns`：检查域名 MX/SPF 是否生效
- `setup`：调用 ImprovMX API 创建/更新邮箱转发
- `verify-api`：调用 ImprovMX API 验证域名状态

### 9.1 DNS 记录模板

```bash
./scripts/email-forwarding-improvmx.sh template zlxjy.com
```

输出的核心记录如下（在域名 DNS 控制台填写）：

- `MX @ mx1.improvmx.com`（优先级 `10`）
- `MX @ mx2.improvmx.com`（优先级 `20`）
- `TXT @ v=spf1 include:spf.improvmx.com ~all`

### 9.2 一键配置转发

先准备 API Key（ImprovMX 控制台获取）：

```bash
export IMPROVMX_API_KEY='your_api_key'
```

然后执行：

```bash
./scripts/email-forwarding-improvmx.sh setup zlxjy.com coco 785432128@qq.com
```

### 9.3 配置核验

```bash
./scripts/email-forwarding-improvmx.sh check-dns zlxjy.com
./scripts/email-forwarding-improvmx.sh verify-api zlxjy.com
```
