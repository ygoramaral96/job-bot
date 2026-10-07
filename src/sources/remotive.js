'use strict';
// Remotive public API: https://remotive.com/api/remote-jobs?category=software-dev

const { fetchJson } = require('../http');
const { normalize } = require('./normalize');

async function fetchRemotive(url) {
  const payload = await fetchJson(url);
  return (payload.jobs || []).map((job) => normalize({
    source: 'remotive',
    title: job.title,
    company: job.company_name,
    location: job.candidate_required_location || 'Worldwide',
    remote: true,
    url: job.url,
    date: job.publication_date,
    description: job.description,
    salary: job.salary,
    meta: { jobType: job.job_type, tags: job.tags || [] },
  }));
}

module.exports = { fetchRemotive };
