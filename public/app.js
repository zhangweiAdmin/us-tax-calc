const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

const percent2 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const PLANNER_MEMORY_KEY = "us-tax-calc.planner-memory.v1";

function formatCurrency(value) {
  return currency.format(Number(value || 0));
}

function formatPercent(value) {
  return `${percent2.format(Number(value || 0))}%`;
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function readPlannerMemory() {
  try {
    const raw = window.localStorage.getItem(PLANNER_MEMORY_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writePlannerMemory(patch) {
  try {
    const current = readPlannerMemory();
    const next = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    window.localStorage.setItem(PLANNER_MEMORY_KEY, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

function canAdoptRememberedInput(input) {
  if (!input) return false;

  const currentValue = String(input.value || "").trim();
  const defaultValue = String(input.defaultValue || "").trim();

  if (!currentValue) return true;
  if (currentValue === defaultValue) return true;

  if (/^0+(?:\.0+)?$/.test(currentValue) && /^0+(?:\.0+)?$/.test(defaultValue || "0")) {
    return true;
  }

  return false;
}

function maybeApplyRememberedNumber(input, value) {
  if (!input || !Number.isFinite(Number(value))) return false;
  if (!canAdoptRememberedInput(input)) return false;

  input.value = String(Math.round(Number(value) * 100) / 100);
  return true;
}

function maybeApplyRememberedChoice(select, value) {
  if (!select || !value) return false;

  const currentValue = String(select.value || "").trim();
  const defaultValue = String(select.options?.[0]?.value || "").trim();
  if (currentValue && currentValue !== defaultValue) return false;

  select.value = value;
  return true;
}

function setMemoryHint(elementId, text) {
  const el = document.getElementById(elementId);
  if (!el || !text) return;
  el.textContent = text;
}

function rememberFreelanceResult(payload, result) {
  const breakdown = result?.breakdown || {};
  if (!Number.isFinite(Number(breakdown.totalEstimatedTax))) return false;

  const saved = writePlannerMemory({
    freelance: {
      input: {
        stateCode: String(payload?.stateCode || "").toUpperCase(),
        filingStatus: String(payload?.filingStatus || "single"),
        grossIncome: asNumber(payload?.grossIncome),
        businessExpenses: asNumber(payload?.businessExpenses),
        otherDeductions: asNumber(payload?.otherDeductions)
      },
      result: {
        stateCode: String(payload?.stateCode || "").toUpperCase(),
        filingStatus: String(payload?.filingStatus || "single"),
        netBusinessIncome: asNumber(breakdown.netBusinessIncome),
        totalEstimatedTax: asNumber(breakdown.totalEstimatedTax),
        quarterlyEstimatedPayment: asNumber(breakdown.quarterlyEstimatedPayment)
      }
    }
  });

  return Boolean(saved);
}

function applyPlannerMemoryToForms() {
  const memory = readPlannerMemory();
  const freelance = memory?.freelance?.result || null;
  if (!freelance) return;

  const safeHarborCurrentTax = $("#currentYearTotalTax");
  if (safeHarborCurrentTax && maybeApplyRememberedNumber(safeHarborCurrentTax, freelance.totalEstimatedTax)) {
    setMemoryHint(
      "safeHarborMemoryHint",
      `Loaded from your last freelance estimate: ${formatCurrency(freelance.totalEstimatedTax)} total tax.`
    );
  }

  const safeHarborStatus = $("#safeHarborFilingStatus");
  if (safeHarborStatus) {
    maybeApplyRememberedChoice(safeHarborStatus, freelance.filingStatus);
  }

  const homeOfficeIncome = $("#businessIncomeBeforeHomeOffice");
  if (homeOfficeIncome && maybeApplyRememberedNumber(homeOfficeIncome, freelance.netBusinessIncome)) {
    setMemoryHint(
      "homeOfficeMemoryHint",
      `Loaded from your last freelance estimate: ${formatCurrency(
        freelance.netBusinessIncome
      )} net business income.`
    );
  }
}

const FALLBACK_STATES = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
  ["DC", "District of Columbia"]
];

function setMeta(meta) {
  const status = meta?.sourceStatus || {};
  const statusText = `Federal: ${status.federal || "unknown"} | States: ${status.states || "unknown"}`;

  $("#metaStatus").textContent = statusText;

  if (meta?.refreshedAt) {
    const local = new Date(meta.refreshedAt).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/New_York"
    });
    $("#metaUpdatedAt").textContent = `Last refreshed: ${local} (ET)`;
  } else {
    $("#metaUpdatedAt").textContent = "Refresh time unavailable";
  }
}

function normalizePathname(pathname) {
  const raw = String(pathname || "/").trim() || "/";
  if (raw === "/") return "/";
  return raw.replace(/\/+$/, "") || "/";
}

function linkPathname(link) {
  const href = link.getAttribute("href");
  if (!href || !href.startsWith("/")) return null;
  try {
    const url = new URL(href, window.location.origin);
    return normalizePathname(url.pathname);
  } catch {
    return null;
  }
}

function isPathMatch(currentPath, candidatePath) {
  if (!candidatePath) return false;
  if (candidatePath === currentPath) return true;
  if (candidatePath === "/articles" && currentPath.startsWith("/articles/")) return true;
  return false;
}

function activateTab(tab) {
  const targetTab = ["freelance", "mortgage", "staking"].includes(tab)
    ? tab
    : "freelance";
  const navLinks = $$(".site-nav-link");
  const panels = $$(".tab-panel");
  const currentPath = normalizePathname(window.location.pathname);

  for (const link of navLinks) {
    const fallbackPath = linkPathname(link);
    const isActive = link.dataset.tab
      ? link.dataset.tab === targetTab
      : isPathMatch(currentPath, fallbackPath);
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }

  for (const panel of panels) {
    panel.classList.toggle("is-active", panel.id === `tab-${targetTab}`);
  }
}

function setSubmitLoading(formId, loading, loadingLabel) {
  const form = document.getElementById(formId);
  if (!form) return;
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;

  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent || "";
  }

  button.disabled = loading;
  button.setAttribute("aria-busy", loading ? "true" : "false");
  button.textContent = loading ? loadingLabel : button.dataset.defaultLabel;
}

function renderLoading(cardId, title, message) {
  const card = document.getElementById(cardId);
  if (!card) return;

  card.innerHTML = `
    <h2>${title}</h2>
    <div class="loading-wrap" role="status" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true"></span>
      <p class="loading-text">${message}</p>
    </div>
  `;
}

function tabFromPath(pathname) {
  const normalized = normalizePathname(pathname);
  if (normalized === "/mortgage-refinance-calculator") return "mortgage";
  if (normalized === "/crypto-staking-calculator") return "staking";
  return "freelance";
}

function bindTabNavigation() {
  const links = $$(".site-nav-link[data-tab][href]");

  for (const link of links) {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href) return;
      if (!href.startsWith("/")) return;

      event.preventDefault();
      const tab = link.dataset.tab || tabFromPath(href);
      activateTab(tab);

      const currentPath = window.location.pathname + window.location.search + window.location.hash;
      if (href !== currentPath) {
        window.history.pushState({ tab }, "", href);
      }
    });
  }

  window.addEventListener("popstate", () => {
    activateTab(tabFromPath(window.location.pathname));
  });
}

function renderFreelanceResult(result) {
  const el = $("#freelanceResult");
  const breakdown = result.breakdown;

  const stateNote = result.details?.stateNote
    ? `<p class="result-note"><strong>State note:</strong> ${result.details.stateNote}</p>`
    : "";

  const assumptions = (result.assumptions || [])
    .map((item) => `<li>${item}</li>`)
    .join("");

  el.innerHTML = `
    <h2>Estimated Result</h2>
    <div class="kpi-grid">
      <div class="kpi">
        <p class="kpi-label">Total Estimated Tax</p>
        <p class="kpi-value">${formatCurrency(breakdown.totalEstimatedTax)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Effective Tax Rate</p>
        <p class="kpi-value">${formatPercent(breakdown.effectiveTaxRate)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Quarterly Estimated Payment</p>
        <p class="kpi-value">${formatCurrency(breakdown.quarterlyEstimatedPayment)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Net Business Income</p>
        <p class="kpi-value">${formatCurrency(breakdown.netBusinessIncome)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Federal Income Tax</p>
        <p class="kpi-value">${formatCurrency(breakdown.federalIncomeTax)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Self-Employment Tax</p>
        <p class="kpi-value">${formatCurrency(breakdown.selfEmploymentTax)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">State Income Tax</p>
        <p class="kpi-value">${formatCurrency(breakdown.stateIncomeTax)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Federal Taxable Income</p>
        <p class="kpi-value">${formatCurrency(breakdown.federalTaxableIncome)}</p>
      </div>
    </div>
    ${stateNote}
    <ul class="result-list">${assumptions}</ul>
  `;
}

function buildInstallmentDueDates(taxYear) {
  const raw = [
    new Date(Date.UTC(taxYear, 3, 15, 12, 0, 0)),
    new Date(Date.UTC(taxYear, 5, 15, 12, 0, 0)),
    new Date(Date.UTC(taxYear, 8, 15, 12, 0, 0)),
    new Date(Date.UTC(taxYear + 1, 0, 15, 12, 0, 0))
  ];

  return raw.map((date, idx) => {
    const shifted = new Date(date.getTime());
    while (shifted.getUTCDay() === 0 || shifted.getUTCDay() === 6) {
      shifted.setUTCDate(shifted.getUTCDate() + 1);
    }
    return {
      quarter: idx + 1,
      dueDate: shifted.toISOString().slice(0, 10),
      date: shifted
    };
  });
}

function deriveElapsedInstallmentsForDate(taxYear, asOfDate) {
  const dueDates = buildInstallmentDueDates(taxYear);
  const asOf = new Date(`${asOfDate}T12:00:00Z`);
  if (!Number.isFinite(asOf.getTime())) return 0;
  return dueDates.reduce((count, row) => (asOf >= row.date ? count + 1 : count), 0);
}

function applySafeHarborDefaults() {
  const taxYearInput = $("#safeHarborTaxYear");
  const asOfDateInput = $("#safeHarborAsOfDate");
  const installmentsInput = $("#safeHarborInstallmentsElapsed");
  if (!taxYearInput || !asOfDateInput || !installmentsInput) return;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayIso = `${yyyy}-${mm}-${dd}`;

  if (!taxYearInput.value) {
    taxYearInput.value = String(yyyy);
  }
  if (!asOfDateInput.value) {
    asOfDateInput.value = todayIso;
  }

  const elapsed = deriveElapsedInstallmentsForDate(asNumber(taxYearInput.value), asOfDateInput.value);
  installmentsInput.value = String(Math.max(0, Math.min(4, elapsed)));

  if (!taxYearInput.dataset.boundAutoInstallments) {
    const syncElapsedInstallments = () => {
      const elapsedLocal = deriveElapsedInstallmentsForDate(asNumber(taxYearInput.value), asOfDateInput.value);
      installmentsInput.value = String(Math.max(0, Math.min(4, elapsedLocal)));
    };
    taxYearInput.addEventListener("change", syncElapsedInstallments);
    asOfDateInput.addEventListener("change", syncElapsedInstallments);
    taxYearInput.dataset.boundAutoInstallments = "1";
  }
}

function syncSafeHarborWithFreelanceEstimate(freelancePayload, freelanceResult) {
  const totalTax = freelanceResult?.breakdown?.totalEstimatedTax;
  if (!Number.isFinite(Number(totalTax))) return;

  const currentTaxInput = $("#currentYearTotalTax");
  const safeHarborStatus = $("#safeHarborFilingStatus");
  if (currentTaxInput) {
    currentTaxInput.value = String(Math.round(Number(totalTax)));
  }
  if (safeHarborStatus && freelancePayload?.filingStatus) {
    safeHarborStatus.value = String(freelancePayload.filingStatus);
  }
}

function renderSafeHarborResult(result) {
  const el = $("#safeHarborResult");
  const b = result.breakdown || {};
  const scheduleRows = (result.details?.dueSchedule || [])
    .map((row) => `<li>Q${row.quarter}: ${row.dueDate} (${row.status})</li>`)
    .join("");

  const assumptions = (result.assumptions || [])
    .map((item) => `<li>${item}</li>`)
    .join("");

  el.innerHTML = `
    <h2>Safe Harbor Projection</h2>
    <div class="kpi-grid">
      <div class="kpi">
        <p class="kpi-label">Required Annual Safe Harbor</p>
        <p class="kpi-value">${formatCurrency(b.requiredAnnualPayment)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Target Rule Used</p>
        <p class="kpi-value">${b.targetRule || "N/A"}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Paid To Date</p>
        <p class="kpi-value">${formatCurrency(b.paidToDate)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Remaining Safe Harbor Amount</p>
        <p class="kpi-value ${b.remainingSafeHarborAmount > 0 ? "" : "good"}">${formatCurrency(
          b.remainingSafeHarborAmount
        )}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Suggested Per Remaining Installment</p>
        <p class="kpi-value">${formatCurrency(b.suggestedPerRemainingInstallment)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Projected Safe Harbor Gap</p>
        <p class="kpi-value ${b.projectedSafeHarborGap > 0 ? "" : "good"}">${formatCurrency(
          b.projectedSafeHarborGap
        )}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Projected Year-End Tax Gap</p>
        <p class="kpi-value ${b.projectedTaxGap > 0 ? "" : "good"}">${formatCurrency(
          b.projectedTaxGap
        )}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Installments Remaining</p>
        <p class="kpi-value">${b.installmentsRemaining ?? 0}</p>
      </div>
    </div>
    <p class="result-note">
      <strong>As-of date:</strong> ${result.details?.asOfDate || "N/A"} |
      <strong>AGI threshold used:</strong> ${formatCurrency(b.agiThreshold)}
    </p>
    <h3 class="result-subtitle">Installment Due Schedule</h3>
    <ul class="result-list">${scheduleRows}</ul>
    <h3 class="result-subtitle">Assumptions</h3>
    <ul class="result-list">${assumptions}</ul>
  `;
}

function renderHomeOfficeResult(result) {
  const el = $("#homeOfficeResult");
  if (!el) return;

  const b = result.breakdown || {};
  const assumptions = (result.assumptions || [])
    .map((item) => `<li>${item}</li>`)
    .join("");

  const qualificationWarning = result.details?.qualificationWarning
    ? `<p class="result-note"><strong>Use check:</strong> ${result.details.qualificationWarning}</p>`
    : "";

  const limitNote = b.businessIncomeLimitHit
    ? `<p class="result-note"><strong>Income cap:</strong> This estimate is capped by the business income entered before the home-office deduction.</p>`
    : "";

  el.innerHTML = `
    <h2>Deduction Projection</h2>
    <div class="kpi-grid">
      <div class="kpi">
        <p class="kpi-label">Recommended Method</p>
        <p class="kpi-value">${b.recommendedMethod || "N/A"}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Recommended Deduction</p>
        <p class="kpi-value good">${formatCurrency(b.recommendedDeduction)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Simplified Method</p>
        <p class="kpi-value">${formatCurrency(b.simplifiedDeduction)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Actual Expense Method</p>
        <p class="kpi-value">${formatCurrency(b.actualDeduction)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Business Use</p>
        <p class="kpi-value">${formatPercent(b.businessUsePercent)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Difference Between Methods</p>
        <p class="kpi-value">${formatCurrency(b.differenceBetweenMethods)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Income Cap Hit</p>
        <p class="kpi-value">${b.businessIncomeLimitHit ? "Yes" : "No"}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Unused Income Capacity</p>
        <p class="kpi-value">${formatCurrency(b.unusedBusinessIncomeCapacity)}</p>
      </div>
    </div>
    ${qualificationWarning}
    ${limitNote}
    <p class="result-note">
      <strong>Use tests:</strong> ${result.details?.exclusiveUseAffirmed ? "exclusive use affirmed" : "exclusive use not affirmed"} |
      ${result.details?.regularUseAffirmed ? "regular use affirmed" : "regular use not affirmed"}
    </p>
    <h3 class="result-subtitle">Assumptions</h3>
    <ul class="result-list">${assumptions}</ul>
  `;
}

function renderMortgageResult(result) {
  const el = $("#mortgageResult");
  const b = result.breakdown;

  const breakeven = b.breakevenMonths == null ? "No breakeven" : `${b.breakevenMonths} months`;

  const assumptions = (result.assumptions || [])
    .map((item) => `<li>${item}</li>`)
    .join("");

  const goodClass = b.monthlySavings > 0 ? "good" : "";

  el.innerHTML = `
    <h2>Refinance Projection</h2>
    <div class="kpi-grid">
      <div class="kpi">
        <p class="kpi-label">Current Monthly Payment</p>
        <p class="kpi-value">${formatCurrency(b.currentMonthlyPayment)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">New Monthly Payment</p>
        <p class="kpi-value">${formatCurrency(b.newMonthlyPayment)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Monthly Savings</p>
        <p class="kpi-value ${goodClass}">${formatCurrency(b.monthlySavings)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Breakeven</p>
        <p class="kpi-value">${breakeven}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Current Total Interest</p>
        <p class="kpi-value">${formatCurrency(b.currentTotalInterest)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">New Total Interest (+ Costs)</p>
        <p class="kpi-value">${formatCurrency(b.newTotalInterestWithCosts)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Lifetime Savings</p>
        <p class="kpi-value ${b.lifetimeSavings > 0 ? "good" : ""}">${formatCurrency(
          b.lifetimeSavings
        )}</p>
      </div>
    </div>
    <ul class="result-list">${assumptions}</ul>
  `;
}

function renderStakingResult(result, allocationSum) {
  const el = $("#stakingResult");
  const b = result.breakdown;

  const chainRows = (result.chains || [])
    .map(
      (chain) => `
      <tr>
        <td>${chain.name}</td>
        <td>${chain.allocationPercent.toFixed(2)}%</td>
        <td>${chain.apyPercent.toFixed(2)}%</td>
        <td>${formatCurrency(chain.annualGain)}</td>
      </tr>
    `
    )
    .join("");

  const allocationNote =
    Math.abs(allocationSum - 100) > 0.01
      ? `<p class="result-note"><strong>Allocation note:</strong> Your allocations sum to ${allocationSum.toFixed(
          2
        )}%. The calculator automatically normalizes weights.</p>`
      : "";

  const assumptions = (result.assumptions || [])
    .map((item) => `<li>${item}</li>`)
    .join("");

  el.innerHTML = `
    <h2>Yield Projection</h2>
    <div class="kpi-grid">
      <div class="kpi">
        <p class="kpi-label">Principal</p>
        <p class="kpi-value">${formatCurrency(b.principal)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Ending Balance</p>
        <p class="kpi-value">${formatCurrency(b.endingBalance)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Annual Gain</p>
        <p class="kpi-value good">${formatCurrency(b.annualGain)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Portfolio Effective APY</p>
        <p class="kpi-value">${formatPercent(b.effectivePortfolioApyPercent)}</p>
      </div>
    </div>
    ${allocationNote}
    <table class="chain-table">
      <thead>
        <tr>
          <th>Chain</th>
          <th>Weight</th>
          <th>APY</th>
          <th>Est. Annual Gain</th>
        </tr>
      </thead>
      <tbody>${chainRows}</tbody>
    </table>
    <ul class="result-list">${assumptions}</ul>
  `;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed: ${response.status}`);
  }

  return response.json();
}

async function loadMeta() {
  const response = await fetch("/api/tax-data/meta");
  if (!response.ok) throw new Error("Failed to load metadata");
  const meta = await response.json();
  setMeta(meta);
}

async function loadStates() {
  const select = $("#stateCode");
  if (!select) return;
  const previous = String(select.value || "CA").toUpperCase();

  const applyStates = (rows) => {
    select.innerHTML = "";
    for (const row of rows) {
      const code = String(row.code || "").toUpperCase();
      const name = String(row.name || "").trim();
      if (!code || !name) continue;

      const option = document.createElement("option");
      option.value = code;
      option.textContent = `${name} (${code})`;
      select.appendChild(option);
    }

    if (select.options.length === 0) return false;
    const target = Array.from(select.options).some((opt) => opt.value === previous)
      ? previous
      : "CA";
    select.value = target;
    return true;
  };

  try {
    const response = await fetch("/api/states");
    if (!response.ok) throw new Error("Failed to load state list");
    const data = await response.json();
    const rows = Array.isArray(data.states) ? data.states : [];
    if (!applyStates(rows)) {
      throw new Error("State list is empty");
    }
  } catch (error) {
    const fallbackRows = FALLBACK_STATES.map(([code, name]) => ({ code, name }));
    applyStates(fallbackRows);
    console.warn("[states] fallback loaded:", error.message);
  }
}

function bindForms() {
  const freelanceForm = $("#freelanceForm");
  if (freelanceForm) {
    freelanceForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const payload = {
        stateCode: $("#stateCode").value,
        filingStatus: $("#filingStatus").value,
        grossIncome: asNumber($("#grossIncome").value),
        businessExpenses: asNumber($("#businessExpenses").value),
        otherDeductions: asNumber($("#otherDeductions").value)
      };

      renderLoading("freelanceResult", "Estimated Result", "Running tax estimate...");
      setSubmitLoading("freelanceForm", true, "Calculating...");

      try {
        const result = await postJson("/api/calculate/freelance", payload);
        renderFreelanceResult(result);
        const memorySaved = rememberFreelanceResult(payload, result);
        if (memorySaved) {
          $("#freelanceResult").insertAdjacentHTML(
            "beforeend",
            '<p class="result-note"><strong>Saved locally:</strong> The net business income and total tax can be reused by the Safe Harbor and Home Office pages.</p>'
          );
        }
        syncSafeHarborWithFreelanceEstimate(payload, result);
      } catch (error) {
        $("#freelanceResult").innerHTML = `<h2>Estimated Result</h2><p class="placeholder">${error.message}</p>`;
      } finally {
        setSubmitLoading("freelanceForm", false, "");
      }
    });
  }

  const mortgageForm = $("#mortgageForm");
  if (mortgageForm) {
    mortgageForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const payload = {
        currentBalance: asNumber($("#currentBalance").value),
        currentRate: asNumber($("#currentRate").value),
        currentTermYears: asNumber($("#currentTermYears").value),
        newRate: asNumber($("#newRate").value),
        newTermYears: asNumber($("#newTermYears").value),
        closingCosts: asNumber($("#closingCosts").value)
      };

      renderLoading("mortgageResult", "Refinance Projection", "Comparing refinance scenarios...");
      setSubmitLoading("mortgageForm", true, "Calculating...");

      try {
        const result = await postJson("/api/calculate/refinance", payload);
        renderMortgageResult(result);
      } catch (error) {
        $("#mortgageResult").innerHTML = `<h2>Refinance Projection</h2><p class="placeholder">${error.message}</p>`;
      } finally {
        setSubmitLoading("mortgageForm", false, "");
      }
    });
  }

  const stakingForm = $("#stakingForm");
  if (stakingForm) {
    stakingForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const chains = [1, 2, 3].map((idx) => ({
        name: $(`[name="chainName${idx}"]`).value,
        apy: asNumber($(`[name="chainApy${idx}"]`).value),
        allocation: asNumber($(`[name="chainAllocation${idx}"]`).value)
      }));

      const allocationSum = chains.reduce((sum, chain) => sum + chain.allocation, 0);

      const payload = {
        principal: asNumber($("#principal").value),
        compoundingPerYear: asNumber($("#compoundingPerYear").value),
        chains
      };

      renderLoading("stakingResult", "Yield Projection", "Modeling multi-chain yield...");
      setSubmitLoading("stakingForm", true, "Calculating...");

      try {
        const result = await postJson("/api/calculate/staking", payload);
        renderStakingResult(result, allocationSum);
      } catch (error) {
        $("#stakingResult").innerHTML = `<h2>Yield Projection</h2><p class="placeholder">${error.message}</p>`;
      } finally {
        setSubmitLoading("stakingForm", false, "");
      }
    });
  }

  const safeHarborForm = $("#safeHarborForm");
  if (safeHarborForm) {
    safeHarborForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const payload = {
        filingStatus: $("#safeHarborFilingStatus").value,
        taxYear: asNumber($("#safeHarborTaxYear").value),
        currentYearTotalTax: asNumber($("#currentYearTotalTax").value),
        priorYearTotalTax: asNumber($("#priorYearTotalTax").value),
        priorYearAgi: asNumber($("#priorYearAgi").value),
        withholdingYtd: asNumber($("#withholdingYtd").value),
        estimatedPaymentsYtd: asNumber($("#estimatedPaymentsYtd").value),
        expectedWithholdingRemaining: asNumber($("#expectedWithholdingRemaining").value),
        expectedEstimatedPaymentsRemaining: asNumber($("#expectedEstimatedPaymentsRemaining").value),
        installmentsElapsed: asNumber($("#safeHarborInstallmentsElapsed").value),
        asOfDate: $("#safeHarborAsOfDate").value || undefined
      };

      renderLoading("safeHarborResult", "Safe Harbor Projection", "Calculating safe-harbor target...");
      setSubmitLoading("safeHarborForm", true, "Calculating...");

      try {
        const result = await postJson("/api/calculate/safe-harbor", payload);
        renderSafeHarborResult(result);
      } catch (error) {
        $("#safeHarborResult").innerHTML = `<h2>Safe Harbor Projection</h2><p class="placeholder">${error.message}</p>`;
      } finally {
        setSubmitLoading("safeHarborForm", false, "");
      }
    });
  }

  const homeOfficeForm = $("#homeOfficeForm");
  if (homeOfficeForm) {
    homeOfficeForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const payload = {
        officeSquareFeet: asNumber($("#officeSquareFeet").value),
        totalHomeSquareFeet: asNumber($("#totalHomeSquareFeet").value),
        annualHomeExpenses: asNumber($("#annualHomeExpenses").value),
        directOfficeExpenses: asNumber($("#directOfficeExpenses").value),
        annualDepreciation: asNumber($("#annualDepreciation").value),
        businessIncomeBeforeHomeOffice: asNumber($("#businessIncomeBeforeHomeOffice").value),
        exclusiveUseAffirmed: $("#exclusiveUseAffirmed").checked,
        regularUseAffirmed: $("#regularUseAffirmed").checked
      };

      renderLoading("homeOfficeResult", "Deduction Projection", "Comparing home-office methods...");
      setSubmitLoading("homeOfficeForm", true, "Calculating...");

      try {
        const result = await postJson("/api/calculate/home-office", payload);
        renderHomeOfficeResult(result);
      } catch (error) {
        $("#homeOfficeResult").innerHTML = `<h2>Deduction Projection</h2><p class="placeholder">${error.message}</p>`;
      } finally {
        setSubmitLoading("homeOfficeForm", false, "");
      }
    });
  }
}

async function init() {
  activateTab(tabFromPath(window.location.pathname || document.body.dataset.initialTab));
  bindTabNavigation();
  applySafeHarborDefaults();
  bindForms();
  applyPlannerMemoryToForms();

  await loadStates();

  try {
    await loadMeta();
  } catch (error) {
    $("#metaStatus").textContent = "Data load failed";
    $("#metaUpdatedAt").textContent = error.message;
  }

}

init();
