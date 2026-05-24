import { fetchLatestTaxData } from "./taxDataFetcher.js";
import { readTaxData, writeTaxData } from "./dataStore.js";

function getNowIso() {
  return new Date().toISOString();
}

function buildSources(federal, states) {
  const sources = [];

  if (federal?.source?.url) {
    sources.push({
      label: "Federal Brackets",
      provider: federal.source.provider,
      url: federal.source.url,
      year: federal.source.year
    });
  }

  const uniqueStateSources = new Map();
  for (const state of Object.values(states || {})) {
    const url = state?.source?.url;
    if (!url) continue;
    if (!uniqueStateSources.has(url)) {
      uniqueStateSources.set(url, {
        label: "State Income Tax Rates",
        provider: state.source.provider,
        url,
        year: state.source.year
      });
    }
  }

  sources.push(...uniqueStateSources.values());
  return sources;
}

function nextRefreshTimeIso() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(6, 0, 0, 0);
  return next.toISOString();
}

export async function refreshTaxData({ reason = "manual" } = {}) {
  let current = null;
  try {
    current = await readTaxData();
  } catch {
    current = null;
  }

  const fetched = await fetchLatestTaxData(new Date().getFullYear());

  const federal =
    fetched.sourceStatus.federal === "live"
      ? fetched.federal
      : current?.federal || fetched.federal;

  const states =
    fetched.sourceStatus.states === "live"
      ? fetched.states
      : current?.states || fetched.states;

  const updated = {
    metadata: {
      taxYear: fetched.taxYear,
      refreshedAt: getNowIso(),
      nextRefreshAt: nextRefreshTimeIso(),
      refreshReason: reason,
      sourceStatus: fetched.sourceStatus,
      errors: fetched.errors,
      sources: buildSources(federal, states)
    },
    federal,
    states
  };

  await writeTaxData(updated);
  return updated;
}

export async function loadOrRefreshTaxData() {
  const current = await readTaxData();
  const refreshedAt = new Date(current.metadata?.refreshedAt || 0).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (!Number.isFinite(refreshedAt) || Date.now() - refreshedAt > oneDayMs) {
    return refreshTaxData({ reason: "startup-stale-data" });
  }

  return current;
}
