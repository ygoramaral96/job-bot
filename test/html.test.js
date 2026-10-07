'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeEntities, escapeHtml, stripHtml, toTelegramHtml, xmlTag } = require('../src/html');

test('decodeEntities handles named, decimal and hex entities', () => {
  assert.equal(decodeEntities('a &amp; b &lt; c &#39;d&#39; &#x41; &nbsp;x'), "a & b < c 'd' A  x");
  assert.equal(decodeEntities('&unknown;'), '&unknown;');
});

test('escapeHtml escapes the three characters Telegram cares about', () => {
  assert.equal(escapeHtml('<b>&</b>'), '&lt;b&gt;&amp;&lt;/b&gt;');
  assert.equal(escapeHtml(null), '');
});

test('stripHtml removes tags, scripts and styles and collapses whitespace', () => {
  const html = '<p>Hello&nbsp;<b>world</b></p><script>alert(1)</script><style>p{}</style>\n\n  bye';
  assert.equal(stripHtml(html), 'Hello world bye');
  assert.equal(stripHtml(''), '');
});

test('toTelegramHtml keeps the supported subset and drops the rest', () => {
  const html = '<h2>Role</h2><p>We use <strong>Node</strong> and <span class="x">TS</span>.</p><ul><li>Remote</li><li>Async</li></ul>';
  assert.equal(toTelegramHtml(html), '<b>Role</b>\nWe use <b>Node</b> and TS.\n• Remote\n• Async');
});

test('toTelegramHtml keeps only http(s) links and escapes text', () => {
  assert.equal(toTelegramHtml('<a href="https://x.io/a?b=1&c=2">apply</a> <a href="javascript:alert(1)">no</a> 1 < 2'),
    '<a href="https://x.io/a?b=1&amp;c=2">apply</a> no 1 &lt; 2');
});

test('toTelegramHtml closes tags left open and respects the character limit', () => {
  assert.equal(toTelegramHtml('<b>bold <i>both'), '<b>bold <i>both</i></b>');
  assert.equal(toTelegramHtml('<b>0123456789</b> tail', 4), '<b>0123</b>');
});

test('toTelegramHtml drops scripts and styles entirely', () => {
  assert.equal(toTelegramHtml('x<script>alert(1)</script>y<style>a{}</style>z'), 'x y z');
});

test('xmlTag reads the first element, unwrapping CDATA and entities', () => {
  const xml = '<item><title><![CDATA[Acme: Senior &amp; Lead]]></title><region>Anywhere</region></item>';
  assert.equal(xmlTag(xml, 'title'), 'Acme: Senior & Lead');
  assert.equal(xmlTag(xml, 'region'), 'Anywhere');
  assert.equal(xmlTag(xml, 'missing'), '');
});
