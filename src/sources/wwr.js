'use strict';
// We Work Remotely RSS feeds. Items look like "<title>Company: Role</title>"
// plus custom <region>, <country>, <skills> and <type> tags.

const { fetchText } = require('../http');
const { xmlTag } = require('../html');
const { normalize } = require('./normalize');

// Postings usually end with "URL: https://company.com/..."; applying through
// WWR itself is paywalled, so that link is kept for the card.
const COMPANY_URL = /\bURL:\s*(https?:\/\/[^\s<>"]+)/i;

function splitTitle(fullTitle) {
  const colon = fullTitle.indexOf(':');
  if (colon <= 0) return { company: '', title: fullTitle };
  return { company: fullTitle.slice(0, colon).trim(), title: fullTitle.slice(colon + 1).trim() };
}

function parseItem(item) {
  const { company, title } = splitTitle(xmlTag(item, 'title'));
  const job = normalize({
    source: 'wwr',
    title,
    company,
    location: xmlTag(item, 'region'),
    remote: true,
    url: xmlTag(item, 'link') || xmlTag(item, 'guid'),
    date: new Date(xmlTag(item, 'pubDate')).toISOString(),
    description: xmlTag(item, 'description'),
    salary: '',
    meta: {
      region: xmlTag(item, 'region'),
      country: xmlTag(item, 'country'),
      skills: xmlTag(item, 'skills'),
      type: xmlTag(item, 'type'),
    },
  });
  const site = COMPANY_URL.exec(job.description);
  if (site) job.meta.companyUrl = site[1].replace(/[.,;)]+$/, '');
  return job;
}

async function fetchWwr(feedUrls) {
  const jobs = [];
  for (const feedUrl of feedUrls) {
    const xml = await fetchText(feedUrl);
    for (const item of xml.split('<item>').slice(1)) jobs.push(parseItem(item));
  }
  return jobs;
}

module.exports = { fetchWwr };
