'use strict';
// Remote OK public API: https://remoteok.com/api
// The first element is the API's legal notice, not a job. Its terms ask for a
// followed link back to Remote OK, which the card's job link already is.

const { fetchJson } = require('../http');
const { normalize } = require('./normalize');

/**
 * The API encodes its text as UTF-8 twice ("Sotheby’s" arrives as "Sothebyâ\u0080\u0099s").
 * Reading the characters back as Latin-1 bytes undoes it. A string with a
 * character above U+00FF was not double-encoded, and one that does not decode
 * cleanly is left alone.
 */
function repairEncoding(value) {
  const text = String(value || '');
  if (/[^\u0000-ÿ]/.test(text)) return text;
  const repaired = Buffer.from(text, 'latin1').toString('utf8');
  return repaired.includes('�') ? text : repaired;
}

function salaryText(job) {
  if (!job.salary_min && !job.salary_max) return '';
  const range = job.salary_max ? `${job.salary_min || ''}–${job.salary_max}` : String(job.salary_min);
  return `USD ${range} year`;
}

function parseJob(job) {
  return normalize({
    source: 'remoteok',
    title: repairEncoding(job.position),
    company: repairEncoding(job.company),
    location: repairEncoding(job.location),
    remote: true,
    url: job.url || job.apply_url,
    date: job.date || new Date((job.epoch || 0) * 1000).toISOString(),
    description: repairEncoding(job.description),
    salary: salaryText(job),
    meta: { tags: job.tags || [] },
  });
}

async function fetchRemoteOk(url) {
  const payload = await fetchJson(url);
  return (payload || []).filter((item) => item.position).map(parseJob);
}

module.exports = { fetchRemoteOk, parseJob, repairEncoding };
