'use strict';
// Best-effort salary detection. It only ever *flags* a posting, never rejects
// it: a figure in a description may be a bonus, a budget or a typo, so the
// final call stays with the person reading the card.

const HOURS_PER_MONTH = 160;
const MONTHS_PER_YEAR = 12;

// "R$ 12.000", "R$12k", "R$ 15 mil"
const BRL_FIGURE = /r\$\s?([\d.]+)(?:\s?(mil|k))?/g;
// "$80,000/year", "USD 5k per month", "US$ 45/hour", "$120k"
const USD_FIGURE = /(?:usd|us\$|\$)\s?([\d,.]+)\s?(k)?\s?(?:\/|per|por)?\s?(hour|hr|h|year|yr|annum|month|mo|mês|ano|hora)?/g;

// Sanity bounds: a monthly BRL figure outside them is a price, not a salary.
const BRL_MIN = 1_000;
const BRL_MAX = 200_000;

// Without a period, infer it from the size of the number.
const USD_YEARLY_FROM = 20_000;
const USD_MONTHLY_FROM = 1_500;

function highestBrlMonthly(text) {
  let highest = null;
  for (const match of text.matchAll(BRL_FIGURE)) {
    let value = parseFloat(match[1].replace(/\./g, ''));
    if (match[2]) value *= 1000;
    if (value < BRL_MIN || value >= BRL_MAX) continue;
    highest = highest === null ? value : Math.max(highest, value);
  }
  return highest;
}

function usdToMonthly(value, period) {
  if (/hour|hr|^h$|hora/.test(period)) return value * HOURS_PER_MONTH;
  if (/year|yr|annum|ano/.test(period) || (!period && value >= USD_YEARLY_FROM)) return value / MONTHS_PER_YEAR;
  if (/month|mo|mês/.test(period) || (!period && value >= USD_MONTHLY_FROM && value < USD_YEARLY_FROM)) return value;
  return null;
}

function highestUsdMonthly(text) {
  let highest = null;
  for (const match of text.matchAll(USD_FIGURE)) {
    let value = parseFloat(match[1].replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    if (match[2]) value *= 1000;
    const monthly = usdToMonthly(value, (match[3] || '').toLowerCase());
    if (monthly === null) continue;
    highest = highest === null ? monthly : Math.max(highest, monthly);
  }
  return highest;
}

/**
 * Looks for a salary in the text and compares the highest figure found with the
 * floor for its currency. The highest figure is used on purpose: when a range
 * is quoted, the posting is only "clearly below the floor" when its top is.
 *
 * @returns {{ label: string, belowFloor: boolean } | null} null when no figure was found
 */
function parseSalary(text, floor) {
  const lower = text.toLowerCase();

  const brl = highestBrlMonthly(lower);
  if (brl !== null) return { label: `R$ ${brl}`, belowFloor: brl < floor.BRL_month };

  const usd = highestUsdMonthly(lower);
  if (usd !== null) {
    const rounded = Math.round(usd);
    return { label: `~USD ${rounded}/mo`, belowFloor: rounded < floor.USD_month };
  }
  return null;
}

module.exports = { parseSalary };
