'use strict';
// Lever job boards: https://api.lever.co/v0/postings/<board>?mode=json
// One request per board; a board that fails is logged and skipped.

const { fetchJson } = require('../http');
const { stripHtml } = require('../html');
const { normalize } = require('./normalize');

function locationOf(categories) {
  const all = [categories.location, ...(categories.allLocations || [])].filter(Boolean);
  return [...new Set(all)].join(', ');
}

function remoteOf(workplaceType) {
  if (!workplaceType) return null;
  return workplaceType === 'remote';
}

// Lever splits a posting into a plain intro plus titled lists ("Requirements", ...).
function descriptionOf(job) {
  const lists = (job.lists || []).map((list) => `${list.text} ${stripHtml(list.content)}`);
  return [job.descriptionPlain, ...lists].join(' ');
}

async function fetchBoard(board) {
  const postings = await fetchJson(`https://api.lever.co/v0/postings/${board}?mode=json`);
  return (postings || []).map((job) => {
    const categories = job.categories || {};
    return normalize({
      source: `lever:${board}`,
      title: job.text,
      company: board,
      location: locationOf(categories),
      remote: remoteOf(job.workplaceType),
      url: job.hostedUrl,
      date: new Date(job.createdAt || 0).toISOString(),
      description: descriptionOf(job),
      salary: '',
      meta: { board, commitment: categories.commitment, workplaceType: job.workplaceType },
    });
  });
}

async function fetchLever(boards, log = console.warn) {
  const results = await Promise.allSettled(boards.map(fetchBoard));
  const jobs = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') jobs.push(...result.value);
    else log(`[lever:${boards[index]}] ${result.reason.message}`);
  });
  return jobs;
}

module.exports = { fetchLever };
