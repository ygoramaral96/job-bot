'use strict';
// Fetches every configured source in parallel. A source that fails does not
// stop the run: its error goes into `stats` and the others are still used.

const { fetchRemotive } = require('./remotive');
const { fetchHimalayas } = require('./himalayas');
const { fetchWwr } = require('./wwr');
const { fetchGreenhouse } = require('./greenhouse');
const { fetchLever } = require('./lever');
const { fetchRemoteOk } = require('./remoteok');
const { fetchWorkingNomads } = require('./workingnomads');
const { fetchJobspresso } = require('./jobspresso');
const { fetchNoDesk } = require('./nodesk');
const { slugify } = require('../text');

/**
 * Listed in order of preference: when the same posting (same company and
 * title) comes from several sources, the first one here wins. Company boards
 * come first because their link applies directly; aggregators often redirect
 * or sit behind a paywall. A source missing from config.json is skipped.
 */
const FETCHERS = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  himalayas: fetchHimalayas,
  remotive: fetchRemotive,
  wwr: fetchWwr,
  remoteok: fetchRemoteOk,
  workingnomads: fetchWorkingNomads,
  jobspresso: fetchJobspresso,
  nodesk: fetchNoDesk,
};

/** Same company and title means the same posting, whatever the URL. */
function postingKey(job) {
  return `${slugify(job.company)}|${slugify(job.title)}`;
}

/** Keeps the first job per id and per posting key, in the order given. */
function dedupe(jobs) {
  const ids = new Set();
  const keys = new Set();
  const kept = [];
  for (const job of jobs) {
    const key = postingKey(job);
    if (!job.url || ids.has(job.id) || (job.company && keys.has(key))) continue;
    ids.add(job.id);
    keys.add(key);
    kept.push(job);
  }
  return kept;
}

/**
 * @returns {{ jobs: object[], stats: Record<string, number | string> }}
 *   jobs deduplicated across sources; stats has a count per source, or "ERR <message>"
 */
async function fetchAllSources(config, log = console.warn) {
  const names = Object.keys(FETCHERS).filter((name) => config.sources[name]);

  const stats = {};
  const results = await Promise.all(names.map(async (name) => {
    try {
      const jobs = await FETCHERS[name](config.sources[name], log);
      stats[name] = jobs.length;
      return jobs;
    } catch (error) {
      stats[name] = `ERR ${error.message}`;
      log(`[${name}] ${error.message}`);
      return [];
    }
  }));

  return { jobs: dedupe(results.flat()), stats };
}

module.exports = { fetchAllSources, dedupe };
