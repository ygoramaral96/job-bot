'use strict';
// Greenhouse job boards: https://boards-api.greenhouse.io/v1/boards/<board>/jobs
// One request per board; a board that fails is logged and skipped.

const { fetchJson } = require('../http');
const { normalize } = require('./normalize');

function locationOf(job) {
  if (job.location?.name) return job.location.name;
  return (job.offices || []).map((office) => office.name).join(', ');
}

async function fetchBoard(board) {
  const payload = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`);
  return (payload.jobs || []).map((job) => normalize({
    source: `greenhouse:${board}`,
    title: job.title,
    company: job.company_name || board,
    location: locationOf(job),
    remote: null,
    url: job.absolute_url,
    date: job.first_published || job.updated_at,
    description: job.content,
    salary: '',
    meta: { board },
  }));
}

async function fetchGreenhouse(boards, log = console.warn) {
  const results = await Promise.allSettled(boards.map(fetchBoard));
  const jobs = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') jobs.push(...result.value);
    else log(`[greenhouse:${boards[index]}] ${result.reason.message}`);
  });
  return jobs;
}

module.exports = { fetchGreenhouse };
