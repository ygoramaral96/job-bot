'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hasTerm, firstTerm, slugify, daysSince, idFromUrl } = require('../src/text');

test('hasTerm matches whole words only', () => {
  assert.equal(hasTerm('we use go and react', 'go'), true);
  assert.equal(hasTerm('we use google and reactive', 'go'), false);
  assert.equal(hasTerm('we use google and reactive', 'react'), false);
  assert.equal(hasTerm('Senior Engineer', 'senior'), true);
});

test('hasTerm works for terms with punctuation', () => {
  assert.equal(hasTerm('backend in c# and .net', 'c#'), true);
  assert.equal(hasTerm('backend in c# and .net', '.net'), true);
  assert.equal(hasTerm('node.js developer', 'node.js'), true);
  assert.equal(hasTerm('nodejs developer', 'node.js'), false);
});

test('firstTerm returns the first match in list order, or null', () => {
  assert.equal(firstTerm('python and node', ['node', 'python']), 'node');
  assert.equal(firstTerm('java only', ['node', 'python']), null);
});

test('slugify strips accents and punctuation', () => {
  assert.equal(slugify('Zé Delivery'), 'ze-delivery');
  assert.equal(slugify('  CI&T  '), 'ci-t');
});

test('daysSince is fractional and Infinity for garbage', () => {
  const now = Date.parse('2026-10-06T12:00:00Z');
  assert.equal(daysSince('2026-10-04T12:00:00Z', now), 2);
  assert.equal(daysSince('not a date', now), Infinity);
});

test('idFromUrl is stable and short', () => {
  assert.equal(idFromUrl('https://x/1'), idFromUrl('https://x/1'));
  assert.equal(idFromUrl('https://x/1').length, 12);
  assert.notEqual(idFromUrl('https://x/1'), idFromUrl('https://x/2'));
});
