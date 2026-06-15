import http from "node:http";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateFreelanceTaxes,
  calculateHomeOfficeDeduction,
  calculateQuarterlySafeHarbor,
  calculateMortgageRefinance,
  calculateStakingYield
} from "./lib/taxMath.js";
import { loadOrRefreshTaxData, refreshTaxData } from "./lib/taxUpdater.js";
import { startDailyTaxRefresh } from "./lib/scheduler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const BING_SITE_AUTH_PATH = path.join(ROOT_DIR, "BingSiteAuth.xml");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_REFRESH_TOKEN = process.env.ADMIN_REFRESH_TOKEN || null;
const ADSENSE_CLIENT_ID = normalizeAdSenseClientId(process.env.ADSENSE_CLIENT_ID);
const SITE_URL = normalizeSiteUrl(process.env.SITE_URL);
const SITE_TITLE =
  "US Calculator Hub | Freelance Tax, Home Office, Safe Harbor, Refinance, Staking";
const SITE_DESCRIPTION =
  "Practical calculators and plain-English guides for freelance tax, home office, safe harbor, mortgage refinance, and multi-chain staking planning.";
const PAGE_CATALOG = [
  {
    path: "/",
    templatePath: "index.html",
    initialTab: "freelance",
    title: "Freelance Tax Calculator by State | US Calculator Hub",
    description:
      "Estimate federal income tax, self-employment tax, and state income tax for U.S. freelance income, then carry the result into home-office and safe-harbor planning.",
    heading: "Freelance Tax Calculator",
    subhead:
      "Estimate a freelance tax baseline with state-aware assumptions, then use the result for home-office and quarterly payment planning.",
    about: [{ "@type": "Thing", name: "Freelance Tax Calculator" }],
    faqs: [
      {
        question: "Should I include W-2 wages in this tool?",
        answer:
          "No. Treat this as the freelance side of the return. If you also have W-2 wages, combine this estimate with a fuller return view before you decide on quarterly payments."
      },
      {
        question: "Why does self-employment tax move the result so much?",
        answer:
          "Because it covers both the employer and employee side of Social Security and Medicare. That is why the first rough guess often feels too low."
      },
      {
        question: "Can I rely on this for quarterly planning?",
        answer:
          "Yes, as a planning baseline. I would still check credits, household withholding, and safe-harbor rules before sending money."
      },
      {
        question: "What should I do after a large client payment?",
        answer:
          "Re-run the calculator. One large invoice can move the reserve target enough that last month's number is no longer the one to trust."
      },
      {
        question: "Which filing statuses are supported?",
        answer:
          "Single, Married Filing Jointly, and Head of Household. Pick the one you actually expect to file, not the one that looks convenient in the moment."
      }
    ]
  },
  {
    path: "/safe-harbor-calculator",
    templatePath: "safe-harbor-calculator/index.html",
    initialTab: "freelance",
    title: "Quarterly Safe Harbor Calculator | Estimated Tax Planning",
    description:
      "Estimate the smaller of the current-year 90% rule and the prior-year 100% or 110% rule, then pace the remaining quarterly payments.",
    heading: "Quarterly Safe Harbor Calculator",
    subhead:
      "Use prior-year tax, current-year projections, and payments already made to see how much is left before the next deadline.",
    about: [{ "@type": "Thing", name: "Quarterly Safe Harbor Calculator" }],
    faqs: [
      {
        question: "What does the calculator actually target?",
        answer:
          "It compares 90% of the current-year estimate with the prior-year floor and uses the smaller requirement."
      },
      {
        question: "Does withholding count the same as estimated payments?",
        answer:
          "Yes. Both move you toward the target, which is why W-2 withholding can change the answer more than people expect."
      },
      {
        question: "When does the 110% prior-year rule matter?",
        answer:
          "It matters when prior-year AGI crossed the IRS threshold. In that case the prior-year floor is higher than the ordinary 100% version."
      },
      {
        question: "Can I use this if my income swings a lot?",
        answer:
          "Yes, but treat it as a floor. If the year is lumpy, I would still sanity-check the result with a current-year forecast."
      },
      {
        question: "Does this replace Form 2210?",
        answer:
          "No. It is a planning tool. Annualized-income methods, filing details, and state rules can change the final answer."
      },
      {
        question: "What if I already paid through withholding?",
        answer:
          "Include it. Household withholding often gets overlooked and can materially reduce the remaining gap."
      }
    ]
  },
  {
    path: "/home-office-deduction-calculator",
    templatePath: "home-office-deduction-calculator/index.html",
    initialTab: "freelance",
    title: "Home Office Deduction Calculator | US Calculator Hub",
    description:
      "Compare the simplified home-office method with an actual-expense estimate for a dedicated workspace used regularly and exclusively for business.",
    heading: "Home Office Deduction Calculator",
    subhead:
      "See whether the simplified rule or a real-expense allocation gives you the cleaner planning answer for your workspace.",
    about: [{ "@type": "Thing", name: "Home Office Deduction Calculator" }],
    faqs: [
      {
        question: "When does the simplified method make the most sense?",
        answer:
          "When you want a fast planning number and the office is clearly a separate space. It is simple, readable, and easy to defend."
      },
      {
        question: "Can a kitchen table or spare bedroom corner qualify?",
        answer:
          "Usually not if the space is also used for personal purposes. Exclusive use is the part people most often gloss over."
      },
      {
        question: "What records matter for the actual-expense method?",
        answer:
          "Keep the home-expense totals, a square-foot allocation, and direct office expenses. The cleaner the records, the easier the calculation is to trust."
      },
      {
        question: "Can renters use this calculator?",
        answer:
          "Yes. The housing type does not change the planning logic; the real question is whether the workspace meets the home-office tests."
      },
      {
        question: "What if the deduction is bigger than my business income?",
        answer:
          "Do not assume the larger number will survive filing unchanged. The calculator caps the result at the income you entered so the output stays realistic."
      }
    ]
  },
  {
    path: "/mortgage-refinance-calculator",
    templatePath: "mortgage-refinance-calculator/index.html",
    initialTab: "mortgage",
    title: "Mortgage Refinance Calculator | US Calculator Hub",
    description:
      "Compare refinance payment savings, closing-cost payback, and lifetime interest impact before you lock a new loan.",
    heading: "Mortgage Refinance Calculator",
    subhead:
      "Run a rate-first and a fee-first scenario side by side so the refinance decision lines up with your actual holding period.",
    about: [{ "@type": "Thing", name: "Mortgage Refinance Calculator" }],
    faqs: [
      {
        question: "Why can my monthly payment fall while total interest rises?",
        answer:
          "Because a longer term can spread the debt out even when the rate improves. Lower monthly pressure does not always mean lower lifetime cost."
      },
      {
        question: "What is the point of breakeven month?",
        answer:
          "It tells you how long it takes for monthly savings to recover closing costs. If you expect to move sooner than that, the refinance gets harder to justify."
      },
      {
        question: "Do points count in this calculator?",
        answer:
          "Yes, if you include them in the upfront cost input. That is the cleanest way to compare a points-heavy offer with a no-points offer."
      },
      {
        question: "Should I compare more than one lender?",
        answer:
          "Yes. A single quote can hide fees or tradeoffs that show up only after you line it up against another Loan Estimate."
      },
      {
        question: "Can I use this for an ARM?",
        answer:
          "Not directly. The current model assumes fixed-rate inputs on both sides, so an ARM needs a more detailed path."
      },
      {
        question: "What if I plan to sell within a few years?",
        answer:
          "Then the breakeven date matters even more. A slightly better rate can be the wrong move if you will not stay long enough to earn it back."
      }
    ]
  },
  {
    path: "/crypto-staking-calculator",
    templatePath: "crypto-staking-calculator/index.html",
    initialTab: "staking",
    title: "Crypto Multi-Chain Staking Calculator | US Calculator Hub",
    description:
      "Estimate portfolio staking rewards across multiple chains with APY, compounding frequency, and allocation weights while keeping price risk separate.",
    heading: "Crypto Multi-Chain Staking Calculator",
    subhead:
      "Model reward-side return scenarios by chain so APY assumptions, lockups, and validator risk stay visible.",
    about: [{ "@type": "Thing", name: "Crypto Staking Calculator" }],
    faqs: [
      {
        question: "Is APY guaranteed?",
        answer:
          "No. It is an assumption, not a promise. Real staking outcomes can change with validator performance, network conditions, and protocol rules."
      },
      {
        question: "Why does compounding frequency matter?",
        answer:
          "Because compounding changes the shape of the return. If you cannot restake as often as the model assumes, the real result will be lower."
      },
      {
        question: "Does the calculator include token price movement?",
        answer:
          "No. It keeps reward math separate from market risk, which is usually the cleaner way to think about staking."
      },
      {
        question: "What risk does the math miss?",
        answer:
          "Slashing, custody risk, unbonding delays, validator commission changes, and other operational issues that do not show up in a simple APY formula."
      },
      {
        question: "How should I use this result?",
        answer:
          "Use it as a reward-side planning number. Before deploying capital, check the validator and the liquidity constraints separately."
      },
      {
        question: "What if my allocation percentages do not add to 100?",
        answer:
          "The calculator normalizes them, but I would still fix the numbers so your written plan matches your intent."
      }
    ]
  }
];
const PAGE_BY_PATH = new Map(PAGE_CATALOG.map((page) => [page.path, page]));
const DEFAULT_PAGE = PAGE_BY_PATH.get("/");
const REDIRECT_PATHS = new Map([
  ["/freelance-tax-calculator", "/"],
  ["/quarterly-safe-harbor-calculator", "/safe-harbor-calculator"],
  ["/safe-harbor-tax-calculator", "/safe-harbor-calculator"],
  ["/home-office-calculator", "/home-office-deduction-calculator"],
  ["/home-office-tax-calculator", "/home-office-deduction-calculator"]
]);
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
const FAVICON_VERSION = "20260602";

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
  if (!html.includes("</head>")) return html;

  let result = html;

  if (!/rel=["'](?:shortcut\s+)?icon["']/i.test(result)) {
    const iconHref = `/favicon.ico?v=${FAVICON_VERSION}`;
    const faviconSnippets = [
      `<link rel="icon" type="image/x-icon" href="${iconHref}" />`,
      `<link rel="shortcut icon" href="${iconHref}" />`
    ].join("\n    ");
    result = result.replace("</head>", `    ${faviconSnippets}\n  </head>`);
  }

  const snippet = buildAdSenseHeadSnippet();
  if (!snippet) return result;
  if (result.includes('name="google-adsense-account"')) return result;
  return result.replace("</head>", `    ${snippet}\n  </head>`);
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
  if (pathname === "/BingSiteAuth.xml") {
    try {
      const xml = await fs.readFile(BING_SITE_AUTH_PATH);
      res.writeHead(200, {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300"
      });
      res.end(xml);
    } catch {
      sendText(res, 404, "Not Found");
    }
    return;
  }

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
    const headers = { "Content-Type": mime };
    if (ext === ".ico") {
      headers["Cache-Control"] = "public, max-age=300";
    }
    res.writeHead(200, headers);
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

  if (req.method === "POST" && pathname === "/api/calculate/safe-harbor") {
    const input = await parseJsonBody(req);
    const result = calculateQuarterlySafeHarbor(input);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && pathname === "/api/calculate/home-office") {
    const input = await parseJsonBody(req);
    const result = calculateHomeOfficeDeduction(input);
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
