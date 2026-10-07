'use strict';
// Deterministic triage: hard filters first, then an additive score with a
// human-readable reason for every point. The reasons are shown on the Telegram
// card so a surprising score can be traced back to a rule in config.json.

const { hasTerm, firstTerm, slugify } = require('./text');
const { locationReject } = require('./location');
const { parseSalary } = require('./salary');

const MAX_STACK_HITS_SHOWN = 8;

/**
 * @param {object} job          normalized posting (see sources/normalize.js)
 * @param {object} config       config.json
 * @param {string[]} blocked    slugs of companies the user blocked
 * @returns {{ ok: false, reject: string } | { ok: true, score: number, reasons: string[], remote: boolean }}
 */
function triage(job, config, blocked = []) {
  const title = job.title.toLowerCase();
  const company = job.company.toLowerCase();

  const reject = hardFilterReject({ job, title, company, config, blocked });
  if (reject) return { ok: false, reject };

  const text = `${job.title} ${job.description}`.toLowerCase();
  const weights = config.weights;
  const reasons = [];
  let score = 0;

  // Seniority
  const seniorTerm = firstTerm(title, config.seniorityPlus);
  if (seniorTerm) {
    score += weights.seniorTitle;
    reasons.push(`senior title (${seniorTerm})`);
  } else if (hasTerm(text, 'senior') || hasTerm(text, 'sênior')) {
    score += weights.seniorInText;
    reasons.push('senior in text');
  }
  const midTerm = firstTerm(title, config.seniorityMinus);
  if (midTerm && !seniorTerm) {
    score += weights.midLevelTitle;
    reasons.push(`mid-level title (${midTerm})`);
  }

  // Remote
  const remote = isRemote(job, text);
  score += remote ? weights.remote : weights.notRemote;
  reasons.push(remote ? 'remote' : 'not remote');

  // Stack keywords, capped so a long description cannot dominate the score
  const { points, hits } = stackPoints(text, config);
  score += points;
  if (hits.length) {
    const sign = points >= 0 ? '+' : '';
    reasons.push(`stack ${sign}${points} (${hits.slice(0, MAX_STACK_HITS_SHOWN).join(', ')})`);
  }

  // Company
  if (firstTerm(company, config.greatPlaces)) {
    score += weights.greatPlace;
    reasons.push('great place to work');
  }

  // Salary: informative, and a small penalty when clearly below the floor
  const salary = parseSalary(text, config.salaryFloor);
  if (salary && salary.belowFloor) {
    score += weights.belowSalaryFloor;
    reasons.push(`⚠️ salary ${salary.label} below floor (you decide)`);
  } else if (salary) {
    reasons.push(`salary ${salary.label}`);
  }

  if (job.meta?.commitment) reasons.push(job.meta.commitment);

  return { ok: true, score, reasons, remote };
}

function hardFilterReject({ job, title, company, config, blocked }) {
  // Blocked companies are stored as slugs, so compare slug to slug.
  const companySlug = slugify(company);
  if (blocked.some((slug) => companySlug.includes(slug))) return 'blocked company';
  if (!firstTerm(title, config.titleMust)) return 'title not an engineering role';

  const excluded = firstTerm(title, config.titleExclude);
  if (excluded) return `title has "${excluded}"`;

  // "Python Developer" is dropped; "Python/Node Developer" stays.
  const offStack = firstTerm(title, config.titleOffStack);
  if (offStack && !firstTerm(title, config.titleOnStack)) return `title is ${offStack}-specific`;

  return locationReject(job, config);
}

function isRemote(job, text) {
  if (job.remote === true) return true;
  const location = (job.location || '').toLowerCase();
  return hasTerm(text, 'remote') || hasTerm(text, 'remoto') || hasTerm(text, 'home office')
    || firstTerm(location, ['remote', 'remoto', 'worldwide', 'anywhere']) !== null;
}

function stackPoints(text, config) {
  let points = 0;
  const hits = [];
  for (const [term, weight] of Object.entries(config.stackPlus)) {
    if (hasTerm(text, term)) { points += weight; hits.push(term); }
  }
  for (const [term, weight] of Object.entries(config.stackMinus)) {
    if (hasTerm(text, term)) { points += weight; hits.push(`-${term}`); }
  }
  const { stackMin, stackMax } = config.weights;
  return { points: Math.max(stackMin, Math.min(stackMax, points)), hits };
}

module.exports = { triage };
