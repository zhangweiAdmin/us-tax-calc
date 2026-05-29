import http from "node:http";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateFreelanceTaxes,
  calculateMortgageRefinance,
  calculateStakingYield
} from "./lib/taxMath.js";
import { loadOrRefreshTaxData, refreshTaxData } from "./lib/taxUpdater.js";
import { startDailyTaxRefresh } from "./lib/scheduler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, "../public");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_REFRESH_TOKEN = process.env.ADMIN_REFRESH_TOKEN || null;
const ADSENSE_CLIENT_ID = normalizeAdSenseClientId(process.env.ADSENSE_CLIENT_ID);
const SITE_URL = normalizeSiteUrl(process.env.SITE_URL);
const SITE_TITLE = "US Calculator Hub | Freelance Tax, Refinance, Staking";
const SITE_DESCRIPTION =
  "State-aware freelance tax estimator with mortgage refinance and multi-chain staking calculators.";
const PAGE_CATALOG = [
  {
    path: "/",
    templatePath: "index.html",
    initialTab: "freelance",
    title: "Freelance Tax Calculator by State | US Calculator Hub",
    description:
      "Estimate federal income tax, self-employment tax, and state income tax for U.S. freelancers by filing status and state.",
    heading: "Freelance Tax Calculator",
    subhead:
      "Estimate federal + self-employment + state taxes for U.S. freelance income using state-specific assumptions.",
    about: [{ "@type": "Thing", name: "Freelance Tax Calculator" }],
    faqs: [
      {
        question: "Should I include non-freelance W-2 income in this tool?",
        answer:
          "No. This page is meant for freelance business income planning. If you also have W-2 wages, use this as a partial estimate and combine it with a full tax projection before filing."
      },
      {
        question: "Why does self-employment tax look high?",
        answer:
          "Self-employment tax covers both the employee and employer portions of Social Security and Medicare, so it is usually higher than first-time freelancers expect."
      },
      {
        question: "Can I rely on this for quarterly estimates?",
        answer:
          "Yes, for rough planning. The quarterly figure is useful for budgeting, but final payments should account for credits, prior-year safe harbor rules, and any other household income."
      },
      {
        question: "How often are tax assumptions refreshed?",
        answer:
          "The backend refreshes source tax tables regularly and stores update metadata. If live fetching fails, the app falls back to the last successful dataset to avoid downtime."
      },
      {
        question: "Which filing statuses are supported?",
        answer:
          "Single, Married Filing Jointly, and Head of Household. Choose the one that matches your actual filing plan to keep bracket assumptions aligned."
      }
    ]
  },
  {
    path: "/mortgage-refinance-calculator",
    templatePath: "mortgage-refinance-calculator/index.html",
    initialTab: "mortgage",
    title: "Mortgage Refinance Calculator | US Calculator Hub",
    description:
      "Compare mortgage refinance scenarios with monthly payment changes, total interest impact, and breakeven timing.",
    heading: "Mortgage Refinance Calculator",
    subhead:
      "Compare current and new loan terms to evaluate monthly savings, lifetime interest, and breakeven timing.",
    about: [{ "@type": "Thing", name: "Mortgage Refinance Calculator" }],
    faqs: [
      {
        question: "What does breakeven month actually represent?",
        answer:
          "It is the number of months needed for monthly savings to recover the upfront closing cost. If you sell before that point, the refinance usually does not pay for itself."
      },
      {
        question: "Why can my monthly payment drop but lifetime interest still rise?",
        answer:
          "Extending the loan term can lower monthly payment while increasing total interest paid over time. Always evaluate payment comfort and lifetime cost together."
      },
      {
        question: "Should I refinance if rates are only slightly lower?",
        answer:
          "Sometimes yes, sometimes no. Small rate improvements can still work if balance is large and fees are controlled, but you should test realistic closing-cost assumptions."
      },
      {
        question: "Does the calculator include points and prepaid items?",
        answer:
          "Only if you include them in the closing-cost input. The tool treats closing costs as an upfront cash amount for breakeven and lifetime comparison."
      },
      {
        question: "Can I use this for adjustable-rate mortgages?",
        answer:
          "Not directly. The model assumes fixed rates for both current and new loans, so ARM scenarios need a more detailed projection with future rate paths."
      }
    ]
  },
  {
    path: "/crypto-staking-calculator",
    templatePath: "crypto-staking-calculator/index.html",
    initialTab: "staking",
    title: "Crypto Multi-Chain Staking Calculator | US Calculator Hub",
    description:
      "Estimate annual compounded staking yield across multiple crypto chains using weighted allocations and APY assumptions.",
    heading: "Crypto Multi-Chain Staking Calculator",
    subhead:
      "Model portfolio-level staking performance by splitting principal across chains with customizable APY and allocations.",
    about: [{ "@type": "Thing", name: "Crypto Staking Calculator" }],
    faqs: [
      {
        question: "What if my allocations do not add up to 100%?",
        answer:
          "The calculator normalizes the weights internally. That means each chain still receives a proportional share of capital even when your raw percentages are under or over 100."
      },
      {
        question: "Is APY treated as guaranteed?",
        answer:
          "No. APY is an input assumption. Real outcomes can deviate because validator performance, protocol policy, and network conditions change over time."
      },
      {
        question: "Does this include token price movement?",
        answer:
          "No. Results are reward-side estimates in token terms. USD performance can be very different depending on market price changes."
      },
      {
        question: "How should I choose compounding frequency?",
        answer:
          "Match it to your likely claim-and-restake behavior. Using a very high compounding frequency can overstate outcomes if you cannot execute that frequently in practice."
      },
      {
        question: "Can this model slashing risk?",
        answer:
          "Not directly. Slashing is a downside risk outside this formula, so apply a conservative haircut to APY assumptions when planning higher-risk validator sets."
      }
    ]
  }
];
const PAGE_BY_PATH = new Map(PAGE_CATALOG.map((page) => [page.path, page]));
const DEFAULT_PAGE = PAGE_BY_PATH.get("/");
const REDIRECT_PATHS = new Map([["/freelance-tax-calculator", "/"]]);
const ARTICLE_MANIFEST = loadArticleManifest();
const ARTICLE_HUB_LASTMOD = resolveLatestArticleDate(ARTICLE_MANIFEST);
const ARTICLE_SITEMAP_PAGES = ARTICLE_MANIFEST.map((item) => ({
  path: `/articles/${item.slug}`,
  lastmod: item.publishedAt || null,
  changefreq: "monthly",
  priority: "0.7"
}));
const STATIC_SITEMAP_PAGES = [
  { path: "/articles", lastmod: ARTICLE_HUB_LASTMOD, changefreq: "daily", priority: "0.8" },
  { path: "/authors", changefreq: "monthly", priority: "0.5" },
  { path: "/editorial-policy", changefreq: "monthly", priority: "0.5" },
  { path: "/about", changefreq: "monthly", priority: "0.5" },
  { path: "/contact", changefreq: "monthly", priority: "0.5" },
  { path: "/privacy-policy", changefreq: "yearly", priority: "0.4" },
  { path: "/terms", changefreq: "yearly", priority: "0.4" },
  ...ARTICLE_SITEMAP_PAGES
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon"
};

let taxData = null;

function normalizeRequestPath(pathname) {
  const raw = String(pathname || "/").trim() || "/";
  if (raw === "/") return raw;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function resolvePage(pathname) {
  return PAGE_BY_PATH.get(normalizeRequestPath(pathname)) || null;
}

function buildPageUrl(baseUrl, pagePath) {
  const normalizedPath = pagePath === "/" ? "/" : `${normalizeRequestPath(pagePath)}/`;
  return new URL(normalizedPath, `${baseUrl}/`).toString();
}

function sendRedirect(res, statusCode, location) {
  res.writeHead(statusCode, {
    Location: location
  });
  res.end();
}

function normalizeAdSenseClientId(value) {
  const raw = String(value || "").trim();
  if (!/^ca-pub-\d{16}$/.test(raw)) return null;
  return raw;
}

function normalizeSiteUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function loadArticleManifest() {
  const manifestPath = path.join(PUBLIC_DIR, "articles", "manifest.json");
  try {
    const raw = fsSync.readFileSync(manifestPath, "utf8");
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) return [];
    return rows
      .map((item) => ({
        slug: String(item?.slug || "").trim(),
        publishedAt: normalizeIsoDate(item?.publishedAt)
      }))
      .filter((item) => item.slug && !item.slug.includes("/"));
  } catch {
    return [];
  }
}

function normalizeIsoDate(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const timestamp = Date.parse(`${raw}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function resolveLatestArticleDate(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let latest = null;
  for (const row of rows) {
    const date = normalizeIsoDate(row?.publishedAt);
    if (!date) continue;
    if (!latest || date > latest) {
      latest = date;
    }
  }
  return latest;
}

function resolveBaseUrl(req) {
  if (SITE_URL) return SITE_URL;

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const protocol = forwardedProto === "https" ? "https" : "http";
  const forwardedHost = String(req.headers["x-forwarded-host"] || "")
    .split(",")[0]
    .trim();
  const host = forwardedHost || req.headers.host || `localhost:${PORT}`;
  return `${protocol}://${host}`;
}

function buildAdSenseHeadSnippet() {
  if (!ADSENSE_CLIENT_ID) return "";

  return [
    '<meta name="google-adsense-account" content="' + ADSENSE_CLIENT_ID + '" />',
    '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' +
      ADSENSE_CLIENT_ID +
      '" crossorigin="anonymous"></script>'
  ].join("\n    ");
}

function injectAdSenseHead(html) {
  const snippet = buildAdSenseHeadSnippet();
  if (!snippet) return html;
  if (html.includes('name="google-adsense-account"')) return html;
  return html.replace("</head>", `    ${snippet}\n  </head>`);
}

function buildAdsTxt() {
  if (!ADSENSE_CLIENT_ID) {
    return "# ads.txt not configured\n";
  }
  const publisherId = ADSENSE_CLIENT_ID.replace(/^ca-/, "");
  return `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`;
}

function buildSeoStructuredData(baseUrl, page) {
  const homeUrl = `${baseUrl}/`;
  const pageUrl = buildPageUrl(baseUrl, page.path);
  const pageAbout =
    Array.isArray(page.about) && page.about.length > 0
      ? page.about
      : [
          { "@type": "Thing", name: "Freelance Tax Calculator" },
          { "@type": "Thing", name: "Mortgage Refinance Calculator" },
          { "@type": "Thing", name: "Crypto Staking Calculator" }
        ];
  const graph = [
    {
      "@type": "WebSite",
      name: "US Calculator Hub",
      url: homeUrl,
      inLanguage: "en-US",
      description: SITE_DESCRIPTION
    },
    {
      "@type": "WebPage",
      name: page.title,
      description: page.description,
      url: pageUrl,
      isPartOf: {
        "@type": "WebSite",
        name: "US Calculator Hub",
        url: homeUrl
      },
      about: pageAbout
    }
  ];

  if (Array.isArray(page.faqs) && page.faqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: page.faqs.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer
        }
      }))
    });
  }

  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": graph
    },
    null,
    2
  );
}

function buildSitemapXml(req) {
  const baseUrl = resolveBaseUrl(req);
  const fallbackDate = new Date().toISOString().slice(0, 10);
  const refreshedAt = String(taxData?.metadata?.refreshedAt || "");
  const refreshedAtTime = Date.parse(refreshedAt);
  const lastmodDate = Number.isFinite(refreshedAtTime)
    ? new Date(refreshedAtTime).toISOString().slice(0, 10)
    : fallbackDate;
  const dynamicEntries = PAGE_CATALOG.map(
    (page) => `  <url>
    <loc>${buildPageUrl(baseUrl, page.path)}</loc>
    <lastmod>${lastmodDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${page.path === "/" ? "1.0" : "0.8"}</priority>
  </url>`
  ).join("\n");
  const staticEntries = STATIC_SITEMAP_PAGES.map(
    (page) => `  <url>
    <loc>${buildPageUrl(baseUrl, page.path)}</loc>
    <lastmod>${page.lastmod || fallbackDate}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${dynamicEntries}
${staticEntries}
</urlset>
`;
}

function buildRobotsTxt(req) {
  const baseUrl = resolveBaseUrl(req);
  return `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(text);
}

async function parseJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      throw new Error("Payload too large");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text);
}

async function renderPageHtml(req, page = DEFAULT_PAGE) {
  const templateRelPath = String(page.templatePath || "index.html");
  const templatePath = path.join(PUBLIC_DIR, templateRelPath);
  const template = await fs.readFile(templatePath, "utf8");
  const baseUrl = resolveBaseUrl(req);
  const canonicalUrl = buildPageUrl(baseUrl, page.path);
  const structuredData = buildSeoStructuredData(baseUrl, page).replace(/<\//g, "<\\/");

  return template
    .replaceAll("__SEO_TITLE__", page.title)
    .replaceAll("__SEO_DESCRIPTION__", page.description)
    .replaceAll("__SEO_CANONICAL_URL__", canonicalUrl)
    .replace("__SEO_STRUCTURED_DATA__", structuredData)
    .replaceAll("__INITIAL_TAB__", page.initialTab)
    .replaceAll("__PAGE_H1__", page.heading)
    .replaceAll("__PAGE_SUBHEAD__", page.subhead);
}

async function serveStaticFile(req, res, pathname) {
  if (pathname === "/ads.txt") {
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    });
    res.end(buildAdsTxt());
    return;
  }

  if (pathname === "/robots.txt") {
    sendText(res, 200, buildRobotsTxt(req));
    return;
  }

  if (pathname === "/sitemap.xml") {
    const xml = buildSitemapXml(req);
    res.writeHead(200, {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    });
    res.end(xml);
    return;
  }

  const normalizedPath = normalizeRequestPath(pathname);
  const redirectTarget = REDIRECT_PATHS.get(normalizedPath);
  if (redirectTarget) {
    sendRedirect(res, 301, redirectTarget);
    return;
  }

  const page = resolvePage(normalizedPath);
  if (page) {
    const html = await renderPageHtml(req, page);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(injectAdSenseHead(html));
    return;
  }

  let requestPath = pathname;

  const safePath = path.normalize(requestPath).replace(/^\.\.(\/|\\|$)/, "");
  const absolutePath = path.join(PUBLIC_DIR, safePath);
  const rootIndexPath = path.join(PUBLIC_DIR, "index.html");

  if (!absolutePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const stats = await fs.stat(absolutePath);
    if (stats.isDirectory()) {
      const htmlPath = path.join(absolutePath, "index.html");
      const htmlData = await fs.readFile(htmlPath, "utf8");
      const payload = htmlPath === rootIndexPath ? await renderPageHtml(req) : htmlData;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(injectAdSenseHead(payload));
      return;
    }

    if (absolutePath === rootIndexPath) {
      const html = await renderPageHtml(req);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(injectAdSenseHead(html));
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    const fileData = await fs.readFile(absolutePath);
    res.writeHead(200, { "Content-Type": mime });
    res.end(fileData);
  } catch {
    sendText(res, 404, "Not Found");
  }
}

function buildStateList() {
  return Object.values(taxData.states)
    .map((state) => ({
      code: state.code,
      name: state.name,
      incomeTaxType: state.incomeTaxType,
      sourceYear: state.source?.year || null
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function maybeAuthorizedRefresh(urlObj) {
  if (!ADMIN_REFRESH_TOKEN) return true;
  const token = urlObj.searchParams.get("token") || "";
  return token === ADMIN_REFRESH_TOKEN;
}

async function handleApi(req, res, urlObj) {
  const { pathname } = urlObj;

  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      now: new Date().toISOString(),
      taxYear: taxData.metadata?.taxYear,
      refreshedAt: taxData.metadata?.refreshedAt
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/tax-data/meta") {
    sendJson(res, 200, taxData.metadata || {});
    return;
  }

  if (req.method === "GET" && pathname === "/api/states") {
    sendJson(res, 200, {
      states: buildStateList()
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/tax-data") {
    const stateCode = String(urlObj.searchParams.get("state") || "CA").toUpperCase();
    sendJson(res, 200, {
      metadata: taxData.metadata,
      federal: taxData.federal,
      state: taxData.states[stateCode] || null
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/calculate/freelance") {
    const input = await parseJsonBody(req);
    const result = calculateFreelanceTaxes({ taxData, input });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && pathname === "/api/calculate/refinance") {
    const input = await parseJsonBody(req);
    const result = calculateMortgageRefinance(input);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && pathname === "/api/calculate/staking") {
    const input = await parseJsonBody(req);
    const result = calculateStakingYield(input);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/refresh-taxes") {
    if (!maybeAuthorizedRefresh(urlObj)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    taxData = await refreshTaxData({ reason: "manual-api-refresh" });
    sendJson(res, 200, {
      ok: true,
      metadata: taxData.metadata
    });
    return;
  }

  sendJson(res, 404, { error: "API route not found" });
}

async function bootstrap() {
  taxData = await loadOrRefreshTaxData();

  startDailyTaxRefresh({
    onSuccess: (updatedData) => {
      taxData = updatedData;
      console.log("[scheduler] tax data refreshed:", updatedData.metadata?.refreshedAt);
    },
    onError: (error) => {
      console.error("[scheduler] refresh failed:", error.message);
    }
  });

  const server = http.createServer(async (req, res) => {
    try {
      const rawHost = String(req.headers.host || `localhost:${PORT}`).trim();
      const host = /^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(rawHost)
        ? rawHost
        : `localhost:${PORT}`;
      const urlObj = new URL(req.url || "/", `http://${host}`);

      if (urlObj.pathname.startsWith("/api/")) {
        await handleApi(req, res, urlObj);
        return;
      }

      await serveStaticFile(req, res, urlObj.pathname);
    } catch (error) {
      if (/JSON/.test(error.message || "")) {
        sendJson(res, 400, { error: "Invalid JSON request body" });
        return;
      }

      if (/Payload too large/.test(error.message || "")) {
        sendJson(res, 413, { error: "Payload too large" });
        return;
      }

      console.error("[server] request error:", error);
      sendJson(res, 500, { error: "Internal server error" });
    }
  });

  server.listen(PORT, () => {
    console.log(`US Tax Calculator running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
