import http from "node:http";
import fs from "node:fs/promises";
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
const ADSENSE_SLOT_TOP = normalizeAdSenseSlot(process.env.ADSENSE_SLOT_TOP);
const ADSENSE_SLOT_BOTTOM = normalizeAdSenseSlot(process.env.ADSENSE_SLOT_BOTTOM);
const SITE_URL = normalizeSiteUrl(process.env.SITE_URL);
const SITE_TITLE = "US Calculator Hub | Freelance Tax, Refinance, Staking";
const SITE_DESCRIPTION =
  "State-aware freelance tax estimator with mortgage refinance and multi-chain staking calculators.";

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

function normalizeAdSenseClientId(value) {
  const raw = String(value || "").trim();
  if (!/^ca-pub-\d{16}$/.test(raw)) return null;
  return raw;
}

function normalizeAdSenseSlot(value) {
  const raw = String(value || "").trim();
  if (!/^\d{6,}$/.test(raw)) return null;
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

function buildSeoStructuredData(baseUrl) {
  const homeUrl = `${baseUrl}/`;

  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          name: "US Calculator Hub",
          url: homeUrl,
          inLanguage: "en-US",
          description: SITE_DESCRIPTION
        },
        {
          "@type": "WebPage",
          name: SITE_TITLE,
          url: homeUrl,
          isPartOf: {
            "@type": "WebSite",
            name: "US Calculator Hub",
            url: homeUrl
          },
          about: [
            { "@type": "Thing", name: "Freelance Tax Calculator" },
            { "@type": "Thing", name: "Mortgage Refinance Calculator" },
            { "@type": "Thing", name: "Crypto Staking Calculator" }
          ]
        }
      ]
    },
    null,
    2
  );
}

function buildSitemapXml(req) {
  const baseUrl = resolveBaseUrl(req);
  const homeUrl = `${baseUrl}/`;
  const fallbackDate = new Date().toISOString().slice(0, 10);
  const refreshedAt = String(taxData?.metadata?.refreshedAt || "");
  const refreshedAtTime = Date.parse(refreshedAt);
  const lastmodDate = Number.isFinite(refreshedAtTime)
    ? new Date(refreshedAtTime).toISOString().slice(0, 10)
    : fallbackDate;

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${homeUrl}</loc>
    <lastmod>${lastmodDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
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

function buildPublicConfig() {
  const slots = {
    top: ADSENSE_SLOT_TOP,
    bottom: ADSENSE_SLOT_BOTTOM
  };
  const hasSlot = Boolean(slots.top || slots.bottom);

  return {
    adsense: {
      enabled: Boolean(ADSENSE_CLIENT_ID && hasSlot),
      clientId: ADSENSE_CLIENT_ID,
      slots
    }
  };
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

async function renderIndexHtml(req) {
  const templatePath = path.join(PUBLIC_DIR, "index.html");
  const template = await fs.readFile(templatePath, "utf8");
  const baseUrl = resolveBaseUrl(req);
  const canonicalUrl = `${baseUrl}/`;
  const structuredData = buildSeoStructuredData(baseUrl).replace(/<\//g, "<\\/");

  return template
    .replaceAll("__SEO_CANONICAL_URL__", canonicalUrl)
    .replace("__SEO_STRUCTURED_DATA__", structuredData);
}

async function serveStaticFile(req, res, pathname) {
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

  let requestPath = pathname;
  if (requestPath === "/") {
    requestPath = "/index.html";
  }

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
      const payload = htmlPath === rootIndexPath ? await renderIndexHtml(req) : htmlData;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(payload);
      return;
    }

    if (absolutePath === rootIndexPath) {
      const html = await renderIndexHtml(req);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    const fileData = await fs.readFile(absolutePath);
    res.writeHead(200, { "Content-Type": mime });
    res.end(fileData);
  } catch {
    try {
      const html = await renderIndexHtml(req);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      sendText(res, 404, "Not Found");
    }
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

  if (req.method === "GET" && pathname === "/api/public-config") {
    sendJson(res, 200, buildPublicConfig());
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
      const host = req.headers.host || `localhost:${PORT}`;
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
