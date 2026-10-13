'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { descriptionOf } = require('../src/sources/lever');

test('descriptionOf keeps the role body and the lists, drops the company opening and closing', () => {
  const posting = {
    openingPlain: 'At Acme we change the world.\nWe are 8,000 people.',
    descriptionPlain: 'At Acme we change the world.\nWe are 8,000 people.\n\nWe need a Node engineer.',
    descriptionBodyPlain: 'We need a Node engineer.',
    lists: [{ text: 'Requirements', content: '<li>Node.js</li><li>Postgres</li>' }],
    additionalPlain: 'Benefits: health plan.',
  };
  assert.equal(descriptionOf(posting), 'We need a Node engineer.\n\nRequirements\nNode.js Postgres');
});

test('descriptionOf cuts the opening off the front when Lever gives no separate body', () => {
  const posting = {
    openingPlain: 'At Acme we change the world.',
    descriptionPlain: 'At Acme we change the world.\n\nWe need a Go engineer.',
  };
  assert.equal(descriptionOf(posting), 'We need a Go engineer.');
});

test('descriptionOf is empty when a posting is nothing but the opening', () => {
  assert.equal(descriptionOf({ openingPlain: 'At Acme.', descriptionPlain: 'At Acme.' }), '');
  assert.equal(descriptionOf({}), '');
});
