'use strict';
// Every source maps its payload to this shape before triage sees it:
//
//   {
//     id:              short hash of the URL (stable across runs)
//     source:          'remotive' | 'himalayas' | 'wwr' | 'greenhouse:<board>' | 'lever:<board>'
//     title, company, location: trimmed strings ('' when unknown)
//     remote:          true | false | null (null = the source does not say)
//     url:             where to apply
//     date:            ISO 8601 publication date
//     description:     plain text, capped
//     descriptionHtml: original markup, capped (used for the Telegram card)
//     salary:          free-text salary as the source shows it, '' when absent
//     meta:            source-specific extras used by location rules
//   }

const { stripHtml } = require('../html');
const { idFromUrl } = require('../text');

const MAX_DESCRIPTION_CHARS = 12_000;

function normalize(raw) {
  const html = String(raw.description || '').slice(0, MAX_DESCRIPTION_CHARS);
  return {
    ...raw,
    id: idFromUrl(raw.url),
    title: (raw.title || '').trim(),
    company: (raw.company || '').trim(),
    location: (raw.location || '').trim(),
    description: stripHtml(raw.description).slice(0, MAX_DESCRIPTION_CHARS),
    descriptionHtml: html,
    salary: (raw.salary || '').trim(),
    meta: raw.meta || {},
  };
}

module.exports = { normalize };
