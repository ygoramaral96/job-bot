'use strict';
// Himalayas public API: https://himalayas.app/jobs/api

const { fetchJson } = require('../http');
const { normalize } = require('./normalize');

function salaryText(job) {
  if (!job.minSalary && !job.maxSalary) return '';
  const range = job.maxSalary ? `${job.minSalary || ''}–${job.maxSalary}` : String(job.minSalary);
  return `${job.currency || ''} ${range} ${job.salaryPeriod || ''}`.trim();
}

async function fetchHimalayas(url) {
  const payload = await fetchJson(url);
  return (payload.jobs || []).map((job) => {
    const restrictions = job.locationRestrictions || [];
    return normalize({
      source: 'himalayas',
      title: job.title,
      company: job.companyName,
      location: restrictions.length ? restrictions.join(', ') : 'Worldwide',
      remote: true,
      url: job.applicationLink || job.guid,
      date: new Date((job.pubDate || 0) * 1000).toISOString(),
      description: job.description || job.excerpt,
      salary: salaryText(job),
      meta: {
        seniority: job.seniority || [],
        employmentType: job.employmentType,
        categories: job.parentCategories || [],
        locationRestrictions: restrictions,
      },
    });
  });
}

module.exports = { fetchHimalayas };
