'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSalary } = require('../src/salary');

const floor = { BRL_month: 12000, USD_month: 4200 };

test('returns null when no figure is found', () => {
  assert.equal(parseSalary('Competitive salary and benefits.', floor), null);
});

test('reads BRL figures with thousands separators and "k"/"mil" suffixes', () => {
  assert.deepEqual(parseSalary('Salário: R$ 8.000', floor), { label: 'R$ 8000', belowFloor: true });
  assert.deepEqual(parseSalary('até R$ 15k', floor), { label: 'R$ 15000', belowFloor: false });
  assert.deepEqual(parseSalary('R$ 14 mil', floor), { label: 'R$ 14000', belowFloor: false });
});

test('ignores BRL amounts that cannot be a monthly salary', () => {
  assert.equal(parseSalary('Vale refeição de R$ 50 por dia', floor), null);
});

test('converts USD yearly and hourly figures to monthly', () => {
  assert.deepEqual(parseSalary('$80,000/year', floor), { label: '~USD 6667/mo', belowFloor: false });
  assert.deepEqual(parseSalary('USD 20 per hour', floor), { label: '~USD 3200/mo', belowFloor: true });
  assert.deepEqual(parseSalary('$120k', floor), { label: '~USD 10000/mo', belowFloor: false });
});

test('a USD figure without a period is read by its size', () => {
  assert.equal(parseSalary('$3,000', floor).label, '~USD 3000/mo');
  assert.equal(parseSalary('$60,000', floor).label, '~USD 5000/mo');
});

test('a range is judged by its top: only clearly-below ranges are flagged', () => {
  assert.equal(parseSalary('R$ 10.000 – R$ 14.000', floor).belowFloor, false);
  assert.equal(parseSalary('$3,000 - $4,000 per month', floor).belowFloor, true);
});

test('BRL wins when both currencies appear', () => {
  assert.equal(parseSalary('R$ 13.000 (about $2,500)', floor).label, 'R$ 13000');
});
