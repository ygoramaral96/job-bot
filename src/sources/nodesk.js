'use strict';
// NoDesk RSS, engineering category: https://nodesk.co/remote-jobs/engineering/index.xml
// Titles look like "Role at Company"; the feed gives no location, so only the
// description check applies.

const { fetchText } = require('../http');
const { xmlTag } = require('../html');
const { normalize } = require('./normalize');

function splitTitle(fullTitle) {
  const at = fullTitle.lastIndexOf(' at ');
  if (at <= 0) return { title: fullTitle, company: '' };
  return { title: fullTitle.slice(0, at).trim(), company: fullTitle.slice(at + 4).trim() };
}

function parseItem(item) {
  const { title, company } = splitTitle(xmlTag(item, 'title'));
  return normalize({
    source: 'nodesk',
    title,
    company,
    location: '',
    remote: true,
    url: xmlTag(item, 'link') || xmlTag(item, 'guid'),
    date: new Date(xmlTag(item, 'pubDate')).toISOString(),
    description: xmlTag(item, 'description'),
    salary: '',
    meta: {},
  });
}

async function fetchNoDesk(url) {
  const xml = await fetchText(url);
  return xml.split('<item>').slice(1).map(parseItem);
}

module.exports = { fetchNoDesk, parseItem };
