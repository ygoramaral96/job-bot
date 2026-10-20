'use strict';
// Jobspresso RSS (WP Job Manager): https://jobspresso.co/?feed=job_feed
// The feed holds only the latest ten postings of every category and ignores
// filters, so it is read on every run and the title filter does the rest.
// <dc:creator> carries "Company<br>⚲ Location".

const { fetchText } = require('../http');
const { xmlTag } = require('../html');
const { normalize } = require('./normalize');

function splitCreator(creator) {
  const [company = '', ...rest] = creator.split(/<br\s*\/?>/i);
  return { company, location: rest.join(' ').replace('⚲', '').replace(/\s+/g, ' ').trim() };
}

function parseItem(item) {
  const { company, location } = splitCreator(xmlTag(item, 'dc:creator'));
  return normalize({
    source: 'jobspresso',
    title: xmlTag(item, 'title'),
    company,
    location,
    remote: true,
    url: xmlTag(item, 'link'),
    date: new Date(xmlTag(item, 'pubDate')).toISOString(),
    description: xmlTag(item, 'content:encoded') || xmlTag(item, 'description'),
    salary: '',
    meta: {},
  });
}

async function fetchJobspresso(url) {
  const xml = await fetchText(url);
  return xml.split('<item>').slice(1).map(parseItem);
}

module.exports = { fetchJobspresso, parseItem };
