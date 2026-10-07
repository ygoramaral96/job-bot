'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { triage } = require('../src/score');
const { config, job } = require('./helpers');

const { weights } = config;

test('a senior remote Node role passes and explains every point', () => {
  const result = triage(job(), config);
  assert.equal(result.ok, true);
  assert.ok(result.reasons.some((r) => r.startsWith('senior title')));
  assert.ok(result.reasons.includes('remote'));
  assert.ok(result.reasons.some((r) => r.startsWith('stack +')));
  // "node.js" also matches the "node" keyword: node (+3) + node.js (+3) + typescript (+3) + aws (+1) = 10, the cap
  assert.equal(result.score, weights.seniorTitle + weights.remote + weights.stackMax);
});

test('titles that are not engineering roles are rejected', () => {
  const result = triage(job({ title: 'Account Executive' }), config);
  assert.deepEqual(result, { ok: false, reject: 'title not an engineering role' });
});

test('excluded words in the title reject the posting', () => {
  assert.equal(triage(job({ title: 'Junior Node Developer' }), config).reject, 'title has "junior"');
  assert.equal(triage(job({ title: 'Software Engineer, Mobile' }), config).reject, 'title has "mobile"');
});

test('an off-stack language in the title is dropped unless an on-stack one is also named', () => {
  assert.equal(triage(job({ title: 'Senior Python Developer' }), config).reject, 'title is python-specific');
  assert.equal(triage(job({ title: 'Senior Python/Node Developer' }), config).ok, true);
});

test('generic role words do not rescue an off-stack title', () => {
  assert.equal(triage(job({ title: 'Backend Java Engineer' }), config).reject, 'title is java-specific');
});

test('blocked companies are rejected before anything else', () => {
  const result = triage(job({ company: 'Mercado Livre' }), config, ['mercado-livre', 'acme']);
  assert.equal(result.reject, 'blocked company');
});

test('descriptions that restrict the location reject the posting', () => {
  const result = triage(job({ description: 'Must be authorized to work in the United States.' }), config);
  assert.equal(result.reject, 'description says "authorized to work in the united states"');
});

test('Greenhouse boards: a foreign city rejects, Brazil or worldwide passes', () => {
  const board = { source: 'greenhouse:acme', remote: null, meta: { board: 'acme' } };
  assert.equal(triage(job({ ...board, location: 'New York, NY' }), config).reject, 'location "New York, NY"');
  assert.equal(triage(job({ ...board, location: 'Remote - Brazil' }), config).ok, true);
  assert.equal(triage(job({ ...board, location: 'São Paulo' }), config).ok, true);
});

test('WWR regions outside the allowed list are rejected', () => {
  const wwr = { source: 'wwr', meta: { region: 'USA Only', country: '' } };
  assert.equal(triage(job(wwr), config).reject, 'region "USA Only"');
  assert.equal(triage(job({ ...wwr, meta: { region: 'Anywhere in the World' } }), config).ok, true);
});

test('Himalayas location restrictions must include an open region', () => {
  const himalayas = { source: 'himalayas' };
  assert.ok(triage(job({ ...himalayas, meta: { locationRestrictions: ['United States', 'Canada'] } }), config).reject.startsWith('restricted to'));
  assert.equal(triage(job({ ...himalayas, meta: { locationRestrictions: ['Latin America'] } }), config).ok, true);
  assert.equal(triage(job({ ...himalayas, meta: { locationRestrictions: [] } }), config).ok, true);
});

test('a salary clearly below the floor costs points and is flagged, never rejected', () => {
  const base = triage(job(), config).score;
  const result = triage(job({ description: 'Node.js and TypeScript on AWS. Pay: R$ 6.000 per month.' }), config);
  assert.equal(result.ok, true);
  assert.equal(result.score, base + weights.belowSalaryFloor);
  assert.ok(result.reasons.some((r) => r.startsWith('⚠️ salary R$ 6000 below floor')));
});

test('a salary at or above the floor is only informative', () => {
  const result = triage(job({ description: 'Node.js and TypeScript on AWS. USD 90,000/year.' }), config);
  assert.ok(result.reasons.includes('salary ~USD 7500/mo'));
});

test('not remote costs points', () => {
  const office = job({ source: 'greenhouse:acme', remote: null, location: 'Brazil', description: 'Node.js, on site.' });
  assert.ok(triage(office, config).reasons.includes('not remote'));
});

test('stack points are capped so a long keyword list cannot dominate', () => {
  const everything = Object.keys(config.stackPlus).join(', ');
  const result = triage(job({ title: 'Software Engineer', description: everything }), config);
  const stackReason = result.reasons.find((r) => r.startsWith('stack '));
  assert.ok(stackReason.startsWith(`stack +${weights.stackMax} (`));
});

test('great places to work get a bonus', () => {
  const result = triage(job({ company: 'Nubank' }), config);
  assert.ok(result.reasons.includes('great place to work'));
});
