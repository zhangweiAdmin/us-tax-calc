import {
  buildEmptyStateTaxIndex,
  normalizeStateName,
  stateNameToCode,
  STATE_CODE_TO_NAME
} from "./stateCatalog.js";
import {
  extractTableByHeaders,
  htmlToText,
  parseDollarAmount,
  parsePercent,
  parseTableRows
} from "./parseHelpers.js";

const TAXFOUNDATION_BASE = "https://taxfoundation.org";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const FALLBACK_FEDERAL = {
  selfEmploymentTaxRate: 0.153,
  brackets: {
    single: [
      { min: 0, rate: 0.1 },
      { min: 12401, rate: 0.12 },
      { min: 50401, rate: 0.22 },
      { min: 105701, rate: 0.24 },
      { min: 201776, rate: 0.32 },
      { min: 256226, rate: 0.35 },
      { min: 640601, rate: 0.37 }
    ],
    married_filing_jointly: [
      { min: 0, rate: 0.1 },
      { min: 24801, rate: 0.12 },
      { min: 100801, rate: 0.22 },
      { min: 211401, rate: 0.24 },
      { min: 403551, rate: 0.32 },
      { min: 512451, rate: 0.35 },
      { min: 768701, rate: 0.37 }
    ],
    head_of_household: [
      { min: 0, rate: 0.1 },
      { min: 17701, rate: 0.12 },
      { min: 67451, rate: 0.22 },
      { min: 105701, rate: 0.24 },
      { min: 201776, rate: 0.32 },
      { min: 256201, rate: 0.35 },
      { min: 640601, rate: 0.37 }
    ]
  },
  standardDeduction: {
    single: 16100,
    married_filing_jointly: 32200,
    head_of_household: 24150
  },
  source: {
    provider: "fallback",
    url: null,
    year: 2026,
    note: "Fallback values approximate 2026 federal tables if source fetch fails."
  }
};

function makeStateFallback() {
  return buildEmptyStateTaxIndex();
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }

  return response.text();
}

function parseLowerBoundFromRange(text) {
  if (!text) return null;
  const clean = htmlToText(text);
  if (!clean) return null;

  const dollarMatches = clean.match(/\$\s*[\d,]+(?:\.\d+)?/g);
  if (!dollarMatches || dollarMatches.length === 0) return null;

  const first = parseDollarAmount(dollarMatches[0]);
  return first ?? null;
}

function normalizeBrackets(brackets) {
  const seen = new Set();
  const normalized = [];

  for (const bracket of brackets) {
    if (bracket.min == null || bracket.rate == null) continue;
    const key = `${bracket.min}:${bracket.rate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(bracket);
  }

  normalized.sort((a, b) => a.min - b.min);
  return normalized;
}

function cloneBrackets(brackets) {
  return brackets.map((item) => ({ ...item }));
}

function buildStateType(stateRecord) {
  const bracketCount = stateRecord.brackets.single.length;
  if (bracketCount === 0) return "none";
  if (bracketCount === 1 && stateRecord.brackets.single[0].min === 0) return "flat";
  return "progressive";
}

function parseFederalTables(html, sourceUrl, sourceYear) {
  const bracketTable = extractTableByHeaders(html, [
    "Tax Rate",
    "For Single",
    "For Married",
    "Heads of Households"
  ]);

  const standardDeductionTable = extractTableByHeaders(html, [
    "Filing Status",
    "Deduction Amount"
  ]);

  if (!bracketTable || !standardDeductionTable) {
    throw new Error("Federal tables were not found in source HTML.");
  }

  const bracketRows = parseTableRows(bracketTable);
  const standardDeductionRows = parseTableRows(standardDeductionTable);

  if (bracketRows.length < 2) {
    throw new Error("Federal bracket table appears empty.");
  }

  const federal = {
    selfEmploymentTaxRate: 0.153,
    brackets: {
      single: [],
      married_filing_jointly: [],
      head_of_household: []
    },
    standardDeduction: {
      single: 0,
      married_filing_jointly: 0,
      head_of_household: 0
    },
    source: {
      provider: "taxfoundation",
      url: sourceUrl,
      year: sourceYear,
      note: "Tax Foundation table sourced from IRS Revenue Procedure."
    }
  };

  for (let i = 1; i < bracketRows.length; i += 1) {
    const row = bracketRows[i];
    if (row.length < 4) continue;

    const rate = parsePercent(row[0]);
    if (rate == null) continue;

    const singleMin = parseLowerBoundFromRange(row[1]);
    const jointMin = parseLowerBoundFromRange(row[2]);
    const hohMin = parseLowerBoundFromRange(row[3]);

    if (singleMin != null) federal.brackets.single.push({ min: singleMin, rate });
    if (jointMin != null) {
      federal.brackets.married_filing_jointly.push({ min: jointMin, rate });
    }
    if (hohMin != null) federal.brackets.head_of_household.push({ min: hohMin, rate });
  }

  for (let i = 1; i < standardDeductionRows.length; i += 1) {
    const row = standardDeductionRows[i];
    if (row.length < 2) continue;
    const status = htmlToText(row[0]).toLowerCase();
    const deduction = parseDollarAmount(row[1]);
    if (deduction == null) continue;

    if (status.includes("single")) {
      federal.standardDeduction.single = deduction;
    } else if (status.includes("married filing jointly")) {
      federal.standardDeduction.married_filing_jointly = deduction;
    } else if (status.includes("head of household")) {
      federal.standardDeduction.head_of_household = deduction;
    }
  }

  federal.brackets.single = normalizeBrackets(federal.brackets.single);
  federal.brackets.married_filing_jointly = normalizeBrackets(
    federal.brackets.married_filing_jointly
  );
  federal.brackets.head_of_household = normalizeBrackets(
    federal.brackets.head_of_household
  );

  if (
    federal.brackets.single.length < 5 ||
    federal.brackets.married_filing_jointly.length < 5 ||
    federal.brackets.head_of_household.length < 5
  ) {
    throw new Error("Federal bracket parsing returned too few brackets.");
  }

  return federal;
}

function parseStateTables(html, sourceUrl, sourceYear) {
  const stateTable = extractTableByHeaders(html, [
    "State",
    "Single Filer",
    "Married Filing Jointly",
    "Standard Deduction"
  ]);

  if (!stateTable) {
    throw new Error("State table was not found in source HTML.");
  }

  const rows = parseTableRows(stateTable);
  if (rows.length < 10) {
    throw new Error("State tax table appears incomplete.");
  }

  const states = makeStateFallback();
  let currentStateCode = null;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.length < 7) continue;

    const stateCellText = htmlToText(row[0]);
    if (!stateCellText && !currentStateCode) continue;

    const isContinuation = /^[-•]/.test(stateCellText);

    if (!isContinuation) {
      const normalizedName = normalizeStateName(stateCellText);
      const stateCode = stateNameToCode(normalizedName);
      currentStateCode = stateCode;
    }

    if (!currentStateCode) continue;
    const record = states[currentStateCode];

    const rateSingle = parsePercent(row[1]);
    const thresholdSingle = parseDollarAmount(row[3]);
    const rateJoint = parsePercent(row[4]);
    const thresholdJoint = parseDollarAmount(row[6]);

    const singleText = htmlToText(row[1]).toLowerCase();
    const jointText = htmlToText(row[4]).toLowerCase();

    if ((singleText === "none" || jointText === "none") && record.brackets.single.length === 0) {
      record.incomeTaxType = "none";
    }

    if (rateSingle != null) {
      record.brackets.single.push({
        min: thresholdSingle ?? 0,
        rate: rateSingle
      });
    }

    if (rateJoint != null) {
      record.brackets.married_filing_jointly.push({
        min: thresholdJoint ?? 0,
        rate: rateJoint
      });
    }

    const sdSingle = parseDollarAmount(row[7]);
    if (sdSingle != null) {
      record.standardDeduction.single = sdSingle;
    }

    const sdJoint = parseDollarAmount(row[8]);
    if (sdJoint != null) {
      record.standardDeduction.married_filing_jointly = sdJoint;
    }

    record.source = {
      provider: "taxfoundation",
      url: sourceUrl,
      year: sourceYear
    };
  }

  for (const [code, record] of Object.entries(states)) {
    record.name = STATE_CODE_TO_NAME[code] || record.name;
    record.brackets.single = normalizeBrackets(record.brackets.single);
    record.brackets.married_filing_jointly = normalizeBrackets(
      record.brackets.married_filing_jointly
    );

    if (record.brackets.single.length > 0 && record.brackets.married_filing_jointly.length === 0) {
      record.brackets.married_filing_jointly = cloneBrackets(record.brackets.single);
    }

    if (record.brackets.single.length === 0 && record.brackets.married_filing_jointly.length > 0) {
      record.brackets.single = cloneBrackets(record.brackets.married_filing_jointly);
    }

    record.brackets.head_of_household = cloneBrackets(record.brackets.single);

    if (!record.standardDeduction.head_of_household) {
      record.standardDeduction.head_of_household = record.standardDeduction.single;
    }

    record.incomeTaxType = buildStateType(record);
  }

  const stateCount = Object.values(states).filter((state) => state.brackets.single.length > 0 || state.incomeTaxType === "none").length;
  if (stateCount < 45) {
    throw new Error(`Parsed only ${stateCount} states; expected at least 45.`);
  }

  return states;
}

async function fetchFederalForYear(year) {
  const url = `${TAXFOUNDATION_BASE}/data/all/federal/${year}-tax-brackets/`;
  const html = await fetchHtml(url);
  return parseFederalTables(html, url, year);
}

async function fetchStateForYear(year) {
  const url = `${TAXFOUNDATION_BASE}/data/all/state/state-income-tax-rates-${year}/`;
  const html = await fetchHtml(url);
  return parseStateTables(html, url, year);
}

export async function fetchLatestTaxData(targetYear = new Date().getFullYear()) {
  const triedYears = [targetYear, targetYear - 1, targetYear + 1];
  const errors = [];

  let federal = null;
  let stateRates = null;
  let federalYear = null;
  let stateYear = null;

  for (const year of triedYears) {
    try {
      federal = await fetchFederalForYear(year);
      federalYear = year;
      break;
    } catch (error) {
      errors.push(`federal:${year}:${error.message}`);
    }
  }

  for (const year of triedYears) {
    try {
      stateRates = await fetchStateForYear(year);
      stateYear = year;
      break;
    } catch (error) {
      errors.push(`state:${year}:${error.message}`);
    }
  }

  return {
    taxYear: Math.max(federalYear || 0, stateYear || 0) || targetYear,
    federal: federal || FALLBACK_FEDERAL,
    states: stateRates || makeStateFallback(),
    sourceStatus: {
      federal: federal ? "live" : "fallback",
      states: stateRates ? "live" : "fallback"
    },
    errors
  };
}

export { FALLBACK_FEDERAL, makeStateFallback };
