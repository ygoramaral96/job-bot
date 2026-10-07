'use strict';
// Outbound side: fetch postings, triage them, send the best as Telegram cards.

const { fetchAllSources } = require('./sources');
const { triage } = require('./score');
const { renderCard, cardKeyboard } = require('./telegram');
const { daysSince, todayIso, timestampIso } = require('./text');

const MAX_REJECTIONS_LOGGED = 12;

/**
 * Splits fetched postings into scored candidates and a histogram of rejections.
 * Live runs skip postings already seen and mark rejected ones as seen.
 */
function triageAll(jobs, config, state, { dryRun }) {
  const rejections = {};
  const candidates = [];
  const countRejection = (reason) => {
    // Collapse quoted specifics ("title has \"junior\"" -> "title has \"…\"") so the log stays short.
    const key = reason.replace(/".*"/, '"…"').slice(0, 40);
    rejections[key] = (rejections[key] || 0) + 1;
  };

  for (const job of jobs) {
    if (!dryRun && state.seen[job.id]) continue;
    if (daysSince(job.date) > config.maxAgeDays) { countRejection('too old'); continue; }

    const result = triage(job, config, state.tracker.blocked);
    if (!result.ok) {
      countRejection(result.reject);
      if (!dryRun) state.seen[job.id] = todayIso();
      continue;
    }
    candidates.push({ job, result });
  }

  candidates.sort((a, b) => b.result.score - a.result.score || Date.parse(b.job.date) - Date.parse(a.job.date));
  return { candidates, rejections };
}

function logRejections(log, rejections) {
  const top = Object.entries(rejections)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_REJECTIONS_LOGGED)
    .map(([reason, count]) => `${reason}=${count}`);
  log(`rejections: ${top.join(' · ')}`);
}

function printRanked(log, candidates, count) {
  for (const { job, result } of candidates.slice(0, count)) {
    log(`\n[${result.score}] ${job.title} — ${job.company} · ${job.location} · ${job.source}`);
    log(`     ${result.reasons.join(' · ')}`);
    log(`     ${job.url}`);
  }
}

/** The subset of a posting kept in pending.json and later in the tracker. */
function summarize(job, result) {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    url: job.url,
    source: job.source,
    location: job.location,
    score: result.score,
    sent: todayIso(),
  };
}

async function sendCards(ctx, toSend) {
  const { telegram, state, log } = ctx;
  let sent = 0;
  for (const { job, result } of toSend) {
    try {
      await telegram.sendMessage(renderCard(job, result), cardKeyboard(job.id));
      state.pending[job.id] = summarize(job, result);
      state.seen[job.id] = todayIso();
      sent += 1;
    } catch (error) {
      log(`send failed for ${job.url}: ${error.message}`);
    }
  }
  return sent;
}

function pruneSeen(state, retentionDays) {
  for (const [id, date] of Object.entries(state.seen)) {
    if (daysSince(date) > retentionDays) delete state.seen[id];
  }
}

/**
 * One full run. In dry-run mode it prints the ranked list and changes nothing.
 * @param {object} ctx      { telegram, state, log }
 * @param {object} config   config.json
 * @param {{ dryRun: boolean, limit?: number, show?: number }} options
 */
async function collectAndSend(ctx, config, { dryRun, limit = config.maxSendPerRun, show = 25 }) {
  const { state, log } = ctx;

  const { jobs, stats } = await fetchAllSources(config, log);
  log(`fetched ${jobs.length}`, stats);

  const { candidates, rejections } = triageAll(jobs, config, state, { dryRun });
  const eligible = candidates.filter(({ result }) => result.score >= config.minScore);
  const toSend = eligible.slice(0, limit);
  log(`candidates ${candidates.length}, eligible (>= ${config.minScore}) ${eligible.length}, sending ${toSend.length}`);
  logRejections(log, rejections);

  if (dryRun) {
    printRanked(log, candidates, show);
    log('\n(dry-run: nothing sent, no state written)');
    return;
  }

  const sent = await sendCards(ctx, toSend);

  // Below-threshold candidates are marked seen so they are not re-scored every run.
  for (const { job, result } of candidates) {
    if (result.score < config.minScore) state.seen[job.id] = todayIso();
  }
  pruneSeen(state, config.seenRetentionDays);

  state.tracker.lastRun = {
    when: `${timestampIso()} UTC`,
    fetched: jobs.length,
    candidates: eligible.length,
    sent,
    stats,
    mode: 'live',
  };
  log(`done: sent ${sent}, pending ${Object.keys(state.pending).length}, approved total ${state.tracker.approved.length}`);
}

module.exports = { collectAndSend, triageAll };
