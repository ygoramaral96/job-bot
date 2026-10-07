'use strict';
// Fetches every configured source in parallel. A source that fails does not
// stop the run: its error goes into `stats` and the others are still used.

const { fetchRemotive } = require('./remotive');
const { fetchHimalayas } = require('./himalayas');
const { fetchWwr } = require('./wwr');
const { fetchGreenhouse } = require('./greenhouse');
const { fetchLever } = require('./lever');

/**
 * @returns {{ jobs: object[], stats: Record<string, number | string> }}
 *   jobs deduplicated by id; stats has a count per source, or "ERR <message>"
 */
async function fetchAllSources(config, log = console.warn) {
  const sources = config.sources;
  const fetchers = {
    remotive: () => fetchRemotive(sources.remotive),
    himalayas: () => fetchHimalayas(sources.himalayas),
    wwr: () => fetchWwr(sources.wwr),
    greenhouse: () => fetchGreenhouse(sources.greenhouse, log),
    lever: () => fetchLever(sources.lever, log),
  };

  const stats = {};
  const byId = new Map();
  await Promise.all(Object.entries(fetchers).map(async ([name, fetcher]) => {
    try {
      const jobs = await fetcher();
      stats[name] = jobs.length;
      for (const job of jobs) {
        if (job.url && !byId.has(job.id)) byId.set(job.id, job);
      }
    } catch (error) {
      stats[name] = `ERR ${error.message}`;
      log(`[${name}] ${error.message}`);
    }
  }));

  return { jobs: [...byId.values()], stats };
}

module.exports = { fetchAllSources };
