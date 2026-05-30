const EARNED_INCOME_EXEMPT_STATES = {
  WA: "Washington taxes certain capital gains, not ordinary freelance income.",
  NH: "New Hampshire taxes interest/dividend income only, not ordinary freelance income."
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNonNegative(value) {
  return Math.max(0, toNumber(value, 0));
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export function calculateProgressiveTax(taxableIncome, brackets) {
  const income = clampNonNegative(taxableIncome);
  if (!Array.isArray(brackets) || brackets.length === 0) {
    return { tax: 0, segments: [] };
  }

  const ordered = [...brackets]
    .filter((item) => Number.isFinite(item.min) && Number.isFinite(item.rate))
    .sort((a, b) => a.min - b.min);

  if (ordered.length === 0) {
    return { tax: 0, segments: [] };
  }

  const segments = [];
  let totalTax = 0;

  for (let i = 0; i < ordered.length; i += 1) {
    const current = ordered[i];
    const next = ordered[i + 1];

    const lower = current.min;
    const upperExclusive = next ? next.min : Infinity;

    if (income <= lower) continue;

    const taxableAtRate = Math.max(0, Math.min(income, upperExclusive) - lower);
    if (taxableAtRate <= 0) continue;

    const taxAtRate = taxableAtRate * current.rate;
    totalTax += taxAtRate;

    segments.push({
      rate: current.rate,
      min: lower,
      max: Number.isFinite(upperExclusive) ? upperExclusive : null,
      taxableAtRate: roundCurrency(taxableAtRate),
      taxAtRate: roundCurrency(taxAtRate)
    });
  }

  return {
    tax: roundCurrency(totalTax),
    segments
  };
}

function pickFilingStatus(status) {
  const allowed = ["single", "married_filing_jointly", "head_of_household"];
  return allowed.includes(status) ? status : "single";
}

function pickSafeHarborFilingStatus(status) {
  const allowed = [
    "single",
    "married_filing_jointly",
    "married_filing_separately",
    "head_of_household"
  ];
  return allowed.includes(status) ? status : "single";
}

function toUtcDate(value, fallbackDate = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map((item) => Number(item));
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  }

  const fallback =
    fallbackDate instanceof Date && Number.isFinite(fallbackDate.getTime())
      ? fallbackDate
      : new Date();
  return new Date(
    Date.UTC(
      fallback.getUTCFullYear(),
      fallback.getUTCMonth(),
      fallback.getUTCDate(),
      12,
      0,
      0
    )
  );
}

function shiftWeekendToNextBusinessDay(date) {
  const shifted = new Date(date.getTime());
  while (shifted.getUTCDay() === 0 || shifted.getUTCDay() === 6) {
    shifted.setUTCDate(shifted.getUTCDate() + 1);
  }
  return shifted;
}

function buildQuarterlyDueDates(taxYear) {
  const schedule = [
    { quarter: 1, year: taxYear, month: 3, day: 15 },
    { quarter: 2, year: taxYear, month: 5, day: 15 },
    { quarter: 3, year: taxYear, month: 8, day: 15 },
    { quarter: 4, year: taxYear + 1, month: 0, day: 15 }
  ];

  return schedule.map((row) => {
    const dueAt = shiftWeekendToNextBusinessDay(
      new Date(Date.UTC(row.year, row.month, row.day, 12, 0, 0))
    );
    return {
      quarter: row.quarter,
      dueAt
    };
  });
}

function deriveElapsedInstallments(asOfDate, dueDates) {
  return dueDates.reduce((count, row) => (asOfDate >= row.dueAt ? count + 1 : count), 0);
}

function normalizeInstallmentCount(value, fallback) {
  if (!Number.isFinite(Number(value))) return fallback;
  return Math.max(0, Math.min(4, Math.round(Number(value))));
}

function getStateForFreelanceTax(taxData, stateCode) {
  const normalized = String(stateCode || "").toUpperCase();
  return taxData.states?.[normalized] || null;
}

export function calculateFreelanceTaxes({ taxData, input }) {
  const filingStatus = pickFilingStatus(input.filingStatus);
  const stateCode = String(input.stateCode || "CA").toUpperCase();
  const state = getStateForFreelanceTax(taxData, stateCode);

  const grossIncome = clampNonNegative(input.grossIncome);
  const businessExpenses = clampNonNegative(input.businessExpenses);
  const otherDeductions = clampNonNegative(input.otherDeductions);

  const netBusinessIncome = clampNonNegative(grossIncome - businessExpenses);

  const selfEmploymentTaxRate =
    toNumber(taxData.federal?.selfEmploymentTaxRate, 0.153);

  const selfEmploymentTaxBase = netBusinessIncome * 0.9235;
  const selfEmploymentTax = selfEmploymentTaxBase * selfEmploymentTaxRate;
  const deductibleHalfSE = selfEmploymentTax * 0.5;

  const adjustedIncome = clampNonNegative(netBusinessIncome - deductibleHalfSE);

  const federalStandardDeduction = clampNonNegative(
    taxData.federal?.standardDeduction?.[filingStatus]
  );

  const federalTaxableIncome = clampNonNegative(
    adjustedIncome - federalStandardDeduction - otherDeductions
  );

  const federalTaxCalc = calculateProgressiveTax(
    federalTaxableIncome,
    taxData.federal?.brackets?.[filingStatus] || []
  );

  let stateTaxableIncome = 0;
  let stateIncomeTax = 0;
  let stateTaxCalc = { tax: 0, segments: [] };
  let stateNote = null;

  if (!state) {
    stateNote = "State data unavailable. State tax is shown as $0 estimate.";
  } else if (EARNED_INCOME_EXEMPT_STATES[stateCode]) {
    stateNote = EARNED_INCOME_EXEMPT_STATES[stateCode];
  } else {
    const stateStandardDeduction = clampNonNegative(
      state.standardDeduction?.[filingStatus] ?? state.standardDeduction?.single
    );
    stateTaxableIncome = clampNonNegative(adjustedIncome - stateStandardDeduction);

    stateTaxCalc = calculateProgressiveTax(
      stateTaxableIncome,
      state.brackets?.[filingStatus] || state.brackets?.single || []
    );

    stateIncomeTax = stateTaxCalc.tax;
  }

  const totalEstimatedTax = roundCurrency(
    federalTaxCalc.tax + selfEmploymentTax + stateIncomeTax
  );

  const effectiveRate = netBusinessIncome > 0 ? totalEstimatedTax / netBusinessIncome : 0;

  return {
    assumptions: [
      "Estimate only. Do not use this result as a filed tax return.",
      "Uses federal + state income tax and self-employment tax approximations.",
      "Does not include local taxes, credits, AMT, or special pass-through rules."
    ],
    input: {
      filingStatus,
      stateCode,
      grossIncome,
      businessExpenses,
      otherDeductions
    },
    breakdown: {
      netBusinessIncome: roundCurrency(netBusinessIncome),
      selfEmploymentTaxBase: roundCurrency(selfEmploymentTaxBase),
      selfEmploymentTax: roundCurrency(selfEmploymentTax),
      deductibleHalfSelfEmploymentTax: roundCurrency(deductibleHalfSE),
      adjustedIncome: roundCurrency(adjustedIncome),
      federalStandardDeduction: roundCurrency(federalStandardDeduction),
      federalTaxableIncome: roundCurrency(federalTaxableIncome),
      federalIncomeTax: roundCurrency(federalTaxCalc.tax),
      stateTaxableIncome: roundCurrency(stateTaxableIncome),
      stateIncomeTax: roundCurrency(stateIncomeTax),
      totalEstimatedTax,
      effectiveTaxRate: Number((effectiveRate * 100).toFixed(2)),
      quarterlyEstimatedPayment: roundCurrency(totalEstimatedTax / 4)
    },
    details: {
      federal: federalTaxCalc,
      state: stateTaxCalc,
      stateNote,
      stateName: state?.name || stateCode
    }
  };
}

export function calculateQuarterlySafeHarbor(input = {}) {
  const now = new Date();
  const taxYear = Math.min(2100, Math.max(2000, toInteger(input.taxYear, now.getFullYear())));
  const filingStatus = pickSafeHarborFilingStatus(input.filingStatus);

  const currentYearTotalTax = clampNonNegative(
    input.currentYearTotalTax ??
      input.currentYearTaxEstimate ??
      input.projectedCurrentYearTax ??
      input.estimatedCurrentYearTax
  );
  const priorYearTotalTax = clampNonNegative(input.priorYearTotalTax);
  const priorYearAgi = clampNonNegative(input.priorYearAgi);
  const withholdingYtd = clampNonNegative(input.withholdingYtd);
  const estimatedPaymentsYtd = clampNonNegative(input.estimatedPaymentsYtd);
  const expectedWithholdingRemaining = clampNonNegative(input.expectedWithholdingRemaining);
  const expectedEstimatedPaymentsRemaining = clampNonNegative(input.expectedEstimatedPaymentsRemaining);

  const asOfDate = toUtcDate(input.asOfDate, now);
  const dueDates = buildQuarterlyDueDates(taxYear);
  const elapsedAuto = deriveElapsedInstallments(asOfDate, dueDates);
  const installmentsElapsed = normalizeInstallmentCount(input.installmentsElapsed, elapsedAuto);
  const installmentsRemaining = Math.max(0, 4 - installmentsElapsed);

  const agiThreshold = filingStatus === "married_filing_separately" ? 75000 : 150000;
  const priorYearMultiplier = priorYearAgi > agiThreshold ? 1.1 : 1;
  const priorYearRuleTarget = priorYearTotalTax * priorYearMultiplier;
  const currentYearRuleTarget = currentYearTotalTax * 0.9;

  let requiredAnnualPayment = currentYearRuleTarget;
  let targetRule = "90% of current-year estimated total tax";

  if (priorYearRuleTarget > 0 && priorYearRuleTarget < currentYearRuleTarget) {
    requiredAnnualPayment = priorYearRuleTarget;
    targetRule =
      priorYearMultiplier > 1
        ? "110% of prior-year total tax (AGI above threshold)"
        : "100% of prior-year total tax";
  }

  const paidToDate = withholdingYtd + estimatedPaymentsYtd;
  const remainingSafeHarborAmount = Math.max(0, requiredAnnualPayment - paidToDate);
  const nextInstallmentAmount =
    installmentsRemaining > 0 ? remainingSafeHarborAmount / installmentsRemaining : 0;

  const projectedYearEndPayments =
    paidToDate + expectedWithholdingRemaining + expectedEstimatedPaymentsRemaining;
  const projectedSafeHarborGap = Math.max(0, requiredAnnualPayment - projectedYearEndPayments);
  const projectedTaxGap = Math.max(0, currentYearTotalTax - projectedYearEndPayments);

  return {
    assumptions: [
      "Safe harbor generally means paying the smaller of 90% of current-year tax or 100%/110% of prior-year tax.",
      "Withholding and estimated payments are both credited toward safe-harbor targets.",
      "Estimate excludes special cases (farmer/fisher rules, annualized installment method, and penalty interest details)."
    ],
    input: {
      taxYear,
      filingStatus,
      currentYearTotalTax: roundCurrency(currentYearTotalTax),
      priorYearTotalTax: roundCurrency(priorYearTotalTax),
      priorYearAgi: roundCurrency(priorYearAgi),
      withholdingYtd: roundCurrency(withholdingYtd),
      estimatedPaymentsYtd: roundCurrency(estimatedPaymentsYtd),
      expectedWithholdingRemaining: roundCurrency(expectedWithholdingRemaining),
      expectedEstimatedPaymentsRemaining: roundCurrency(expectedEstimatedPaymentsRemaining),
      installmentsElapsed,
      asOfDate: asOfDate.toISOString().slice(0, 10)
    },
    breakdown: {
      currentYearRuleTarget: roundCurrency(currentYearRuleTarget),
      priorYearRuleTarget: roundCurrency(priorYearRuleTarget),
      requiredAnnualPayment: roundCurrency(requiredAnnualPayment),
      targetRule,
      priorYearMultiplier,
      agiThreshold,
      paidToDate: roundCurrency(paidToDate),
      remainingSafeHarborAmount: roundCurrency(remainingSafeHarborAmount),
      installmentsElapsed,
      installmentsRemaining,
      suggestedPerRemainingInstallment: roundCurrency(nextInstallmentAmount),
      projectedYearEndPayments: roundCurrency(projectedYearEndPayments),
      projectedSafeHarborGap: roundCurrency(projectedSafeHarborGap),
      projectedTaxGap: roundCurrency(projectedTaxGap)
    },
    details: {
      dueSchedule: dueDates.map((row) => ({
        quarter: row.quarter,
        dueDate: row.dueAt.toISOString().slice(0, 10),
        status: row.dueAt <= asOfDate ? "elapsed" : "upcoming"
      })),
      asOfDate: asOfDate.toISOString().slice(0, 10)
    }
  };
}

function monthlyPayment(principal, annualRate, termYears) {
  const p = clampNonNegative(principal);
  const n = Math.max(1, Math.round(clampNonNegative(termYears) * 12));
  const r = clampNonNegative(annualRate) / 12;

  if (r === 0) {
    return p / n;
  }

  const base = Math.pow(1 + r, n);
  return (p * r * base) / (base - 1);
}

export function calculateMortgageRefinance(input) {
  const currentBalance = clampNonNegative(input.currentBalance);
  const currentRate = clampNonNegative(input.currentRate) / 100;
  const currentTermYears = clampNonNegative(input.currentTermYears);

  const newRate = clampNonNegative(input.newRate) / 100;
  const newTermYears = clampNonNegative(input.newTermYears);
  const closingCosts = clampNonNegative(input.closingCosts);

  const currentMonthlyPayment = monthlyPayment(
    currentBalance,
    currentRate,
    currentTermYears
  );
  const newMonthlyPayment = monthlyPayment(currentBalance, newRate, newTermYears);

  const currentPayments = Math.max(1, Math.round(currentTermYears * 12));
  const newPayments = Math.max(1, Math.round(newTermYears * 12));

  const currentTotalPaid = currentMonthlyPayment * currentPayments;
  const newTotalPaid = newMonthlyPayment * newPayments + closingCosts;

  const currentTotalInterest = Math.max(0, currentTotalPaid - currentBalance);
  const newTotalInterest = Math.max(0, newTotalPaid - currentBalance);

  const monthlySavings = currentMonthlyPayment - newMonthlyPayment;
  const lifetimeSavings = currentTotalInterest - newTotalInterest;

  const breakevenMonths =
    monthlySavings > 0 ? Math.ceil(closingCosts / monthlySavings) : null;

  return {
    assumptions: [
      "Estimate assumes fixed-rate loans and no prepayment.",
      "Escrow, taxes, insurance, and PMI are excluded from payment math."
    ],
    breakdown: {
      currentMonthlyPayment: roundCurrency(currentMonthlyPayment),
      newMonthlyPayment: roundCurrency(newMonthlyPayment),
      monthlySavings: roundCurrency(monthlySavings),
      currentTotalInterest: roundCurrency(currentTotalInterest),
      newTotalInterestWithCosts: roundCurrency(newTotalInterest),
      lifetimeSavings: roundCurrency(lifetimeSavings),
      breakevenMonths
    }
  };
}

export function calculateStakingYield(input) {
  const principal = clampNonNegative(input.principal);
  const compoundingPerYear = Math.max(1, Math.round(clampNonNegative(input.compoundingPerYear) || 12));

  const chains = Array.isArray(input.chains) ? input.chains : [];

  const normalizedChains = chains
    .map((chain) => ({
      name: String(chain.name || "Unnamed Chain").trim() || "Unnamed Chain",
      apy: clampNonNegative(chain.apy) / 100,
      allocation: clampNonNegative(chain.allocation)
    }))
    .filter((chain) => chain.allocation > 0);

  const totalAllocation = normalizedChains.reduce((sum, chain) => sum + chain.allocation, 0);

  const chainResults = normalizedChains.map((chain) => {
    const weight = totalAllocation > 0 ? chain.allocation / totalAllocation : 0;
    const principalPart = principal * weight;

    const periodRate = chain.apy / compoundingPerYear;
    const endingBalance = principalPart * Math.pow(1 + periodRate, compoundingPerYear);
    const gain = endingBalance - principalPart;

    return {
      name: chain.name,
      allocationPercent: Number((weight * 100).toFixed(2)),
      principal: roundCurrency(principalPart),
      apyPercent: Number((chain.apy * 100).toFixed(2)),
      endingBalance: roundCurrency(endingBalance),
      annualGain: roundCurrency(gain)
    };
  });

  const endingBalance = chainResults.reduce((sum, row) => sum + row.endingBalance, 0);
  const annualGain = endingBalance - principal;

  const effectivePortfolioApy = principal > 0 ? annualGain / principal : 0;

  return {
    assumptions: [
      "Estimate assumes APY remains constant during the period.",
      "Protocol slashing risk, validator fee changes, and token price volatility are excluded."
    ],
    breakdown: {
      principal: roundCurrency(principal),
      endingBalance: roundCurrency(endingBalance),
      annualGain: roundCurrency(annualGain),
      effectivePortfolioApyPercent: Number((effectivePortfolioApy * 100).toFixed(2))
    },
    chains: chainResults
  };
}
