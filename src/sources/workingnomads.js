'use strict';
// Working Nomads public API: https://www.workingnomads.com/api/exposed_jobs/
// Every category comes back together; the title filter drops the non-engineering ones.

const { fetchJson } = require('../http');
const { normalize } = require('./normalize');

function parseJob(job) {
  return normalize({
    source: 'workingnomads',
    title: job.title,
    company: job.company_name,
    location: job.location || '',
    remote: true,
    url: job.url,
    date: new Date(job.pub_date).toISOString(),
    description: job.description,
    salary: '',
    meta: {
      category: job.category_name,
      tags: String(job.tags || '').split(',').filter(Boolean),
    },
  });
}

async function fetchWorkingNomads(url) {
  const payload = await fetchJson(url);
  return (payload || []).map(parseJob);
}

module.exports = { fetchWorkingNomads, parseJob };
