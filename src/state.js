'use strict';
// Bot state is four small JSON files committed back to the repo by the
// workflow, so a GitHub Actions run has no database to talk to.

const fs = require('node:fs');
const path = require('node:path');

const FILES = {
  seen: 'seen.json',         // job id -> date first seen (pruned after seenRetentionDays)
  pending: 'pending.json',   // job id -> card sent to Telegram, awaiting a tap
  tracker: 'tracker.json',   // approved[], skipped[], blocked[], statuses{}, lastRun
  telegram: 'telegram.json', // { offset } for getUpdates polling
};

const DEFAULTS = {
  seen: () => ({}),
  pending: () => ({}),
  tracker: () => ({ approved: [], skipped: [], blocked: [], statuses: {}, lastRun: null }),
  telegram: () => ({ offset: 0 }),
};

function loadState(dir) {
  const state = {};
  for (const [key, file] of Object.entries(FILES)) {
    const filePath = path.join(dir, file);
    state[key] = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : DEFAULTS[key]();
  }
  return state;
}

function saveState(dir, state) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [key, file] of Object.entries(FILES)) {
    fs.writeFileSync(path.join(dir, file), `${JSON.stringify(state[key], null, 2)}\n`);
  }
}

module.exports = { loadState, saveState };
