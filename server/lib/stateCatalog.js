export const US_STATES = [
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

export const STATE_CODE_TO_NAME = Object.fromEntries(US_STATES);

const NAME_TO_CODE_BASE = Object.fromEntries(
  US_STATES.map(([code, name]) => [name.toLowerCase(), code])
);

NAME_TO_CODE_BASE["washington dc"] = "DC";
NAME_TO_CODE_BASE["district of columbia"] = "DC";
NAME_TO_CODE_BASE["d.c."] = "DC";

export function normalizeStateName(value) {
  if (!value) return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/^[-•]\s*/, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function stateNameToCode(name) {
  if (!name) return null;
  const normalized = normalizeStateName(name).toLowerCase();
  return NAME_TO_CODE_BASE[normalized] || null;
}

export function buildEmptyStateTaxIndex() {
  const index = {};
  for (const [code, name] of US_STATES) {
    index[code] = {
      code,
      name,
      incomeTaxType: "none",
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
        provider: "fallback",
        url: null,
        year: null
      }
    };
  }
  return index;
}
