import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FALLBACK_FEDERAL, makeStateFallback } from "./taxDataFetcher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DATA_PATH = path.resolve(__dirname, "../../data/tax-rates.json");
const DATA_PATH = resolveTaxDataPath(process.env.TAX_DATA_PATH);

function resolveTaxDataPath(customPath) {
  const raw = String(customPath || "").trim();
  if (!raw) return DEFAULT_DATA_PATH;
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

function defaultTaxData() {
  const nowIso = new Date().toISOString();
  return {
    metadata: {
      taxYear: new Date().getFullYear(),
      refreshedAt: nowIso,
      nextRefreshAt: null,
      sourceStatus: {
        federal: "fallback",
        states: "fallback"
      },
      errors: ["Initialized with fallback dataset."],
      sources: []
    },
    federal: FALLBACK_FEDERAL,
    states: makeStateFallback()
  };
}

async function ensureDataFile() {
  try {
    await fs.access(DATA_PATH);
  } catch {
    const initial = defaultTaxData();
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.writeFile(DATA_PATH, JSON.stringify(initial, null, 2), "utf8");
  }
}

export async function readTaxData() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_PATH, "utf8");
  return JSON.parse(raw);
}

export async function writeTaxData(data) {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  const tempPath = `${DATA_PATH}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tempPath, DATA_PATH);
}

export function getTaxDataFilePath() {
  return DATA_PATH;
}
