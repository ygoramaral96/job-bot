'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { config, job } = require('./helpers');
const { dedupe } = require('../src/sources');
const remoteok = require('../src/sources/remoteok');
const workingnomads = require('../src/sources/workingnomads');
const jobspresso = require('../src/sources/jobspresso');
const nodesk = require('../src/sources/nodesk');
const { locationReject } = require('../src/location');

test('remoteok maps position, company and the yearly USD range', () => {
  const parsed = remoteok.parseJob({
    position: 'Senior Node Engineer',
    company: 'Acme',
    location: '',
    url: 'https://remoteOK.com/remote-jobs/1',
    date: '2026-10-19T16:00:04+00:00',
    description: '<p>Node and Postgres.</p>',
    salary_min: 90000,
    salary_max: 120000,
  });
  assert.equal(parsed.source, 'remoteok');
  assert.equal(parsed.title, 'Senior Node Engineer');
  assert.equal(parsed.company, 'Acme');
  assert.equal(parsed.salary, 'USD 90000–120000 year');
  assert.equal(parsed.description, 'Node and Postgres.');
});

test('remoteok has no salary when the API sends zeros', () => {
  assert.equal(remoteok.parseJob({ position: 'Dev', url: 'https://x', salary_min: 0, salary_max: 0 }).salary, '');
});

test('remoteok undoes the double UTF-8 encoding and leaves clean text alone', () => {
  assert.equal(remoteok.repairEncoding('Sothebyâ\u0080\u0099s'), 'Sotheby’s');
  assert.equal(remoteok.repairEncoding('Ciudad de MÃ©xico'), 'Ciudad de México');
  assert.equal(remoteok.repairEncoding('Sotheby’s'), 'Sotheby’s');
  assert.equal(remoteok.repairEncoding('São Paulo'), 'São Paulo');
  assert.equal(remoteok.repairEncoding(undefined), '');
});

test('remoteok location: empty and open pass, bare places and foreign remote do not', () => {
  const reject = (location) => locationReject(job({ source: 'remoteok', location, description: '' }), config);
  assert.equal(reject(''), null);
  assert.equal(reject('Remote'), null);
  assert.equal(reject('LATAM'), null);
  assert.equal(reject('Brazil'), null);
  assert.match(reject('Kansas '), /location/);
  assert.match(reject('Redwood City'), /location/);
  assert.match(reject('Remote, United States'), /location/);
});

test('workingnomads splits the tag string and keeps the category', () => {
  const parsed = workingnomads.parseJob({
    url: 'https://www.workingnomads.com/job/go/1/',
    title: 'Senior Backend Engineer',
    company_name: 'Lemon.io',
    category_name: 'Development',
    tags: 'node,golang',
    location: 'Europe, LATAM, APAC',
    pub_date: '2026-10-20T13:39:57-04:00',
    description: '<p>Hi</p>',
  });
  assert.equal(parsed.company, 'Lemon.io');
  assert.deepEqual(parsed.meta.tags, ['node', 'golang']);
  assert.equal(parsed.meta.category, 'Development');
  assert.equal(parsed.date, '2026-10-20T17:39:57.000Z');
});

test('workingnomads location passes only with a known-good marker', () => {
  const reject = (location) => locationReject(job({ source: 'workingnomads', location }), config);
  assert.equal(reject('Europe, LATAM, APAC, the U.S., Canada'), null);
  assert.equal(reject('Global'), null);
  assert.match(reject('Time zone: CET (+/- 3 hours)'), /location/);
  assert.match(reject('United States'), /location/);
});

test('jobspresso takes company and location from dc:creator', () => {
  const item = `
    <title>Senior Full Stack Engineer</title>
    <link>https://jobspresso.co/job/senior-full-stack-engineer/</link>
    <dc:creator><![CDATA[Olo<br>⚲&nbsp;United Kingdom]]></dc:creator>
    <pubDate>Tue, 20 Oct 2026 07:53:23 +0000</pubDate>
    <description><![CDATA[Short.]]></description>
    <content:encoded><![CDATA[<p>Full body with React.</p>]]></content:encoded>
  </item>`;
  const parsed = jobspresso.parseItem(item);
  assert.equal(parsed.company, 'Olo');
  assert.equal(parsed.location, 'United Kingdom');
  assert.equal(parsed.description, 'Full body with React.');
  assert.equal(parsed.url, 'https://jobspresso.co/job/senior-full-stack-engineer/');
});

test('nodesk splits "Role at Company" on the last " at "', () => {
  const item = `<title>Lead Engineer at Data at Scale</title><description>Go and gRPC.</description>
    <pubDate>Sat, 17 Oct 2026 03:04:30 +0200</pubDate>
    <link>https://nodesk.co/remote-jobs/x/</link></item>`;
  const parsed = nodesk.parseItem(item);
  assert.equal(parsed.title, 'Lead Engineer at Data');
  assert.equal(parsed.company, 'Scale');
  assert.equal(parsed.location, '');
});

test('dedupe keeps the first source for the same company and title', () => {
  const kept = dedupe([
    job({ id: 'a', source: 'greenhouse:acme', company: 'Acme', title: 'Senior Node Engineer', url: 'https://boards/1' }),
    job({ id: 'b', source: 'remoteok', company: 'ACME', title: 'Senior Node  Engineer', url: 'https://remoteok/1' }),
    job({ id: 'c', source: 'remoteok', company: 'Acme', title: 'Staff Go Engineer', url: 'https://remoteok/2' }),
  ]);
  assert.deepEqual(kept.map((item) => item.id), ['a', 'c']);
});

test('dedupe does not merge postings with no company', () => {
  const kept = dedupe([
    job({ id: 'a', company: '', title: 'Engineer', url: 'https://x/1' }),
    job({ id: 'b', company: '', title: 'Engineer', url: 'https://x/2' }),
    job({ id: 'b', company: '', title: 'Engineer', url: 'https://x/2' }),
    job({ id: 'd', url: '' }),
  ]);
  assert.deepEqual(kept.map((item) => item.id), ['a', 'b']);
});
