'use strict';
const fs = require('node:fs');
const path = require('node:path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));

/** A normalized posting with sensible defaults; override what the test cares about. */
function job(overrides = {}) {
  return {
    id: 'abc123',
    source: 'remotive',
    title: 'Senior Node.js Engineer',
    company: 'Acme',
    location: 'Worldwide',
    remote: true,
    url: 'https://example.com/jobs/1',
    date: new Date().toISOString(),
    description: 'We use Node.js and TypeScript on AWS.',
    descriptionHtml: '',
    salary: '',
    meta: {},
    ...overrides,
  };
}

module.exports = { config, job };
