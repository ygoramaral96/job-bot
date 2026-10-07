'use strict';
// Small text helpers shared by triage, sources and the tracker.

const crypto = require('node:crypto');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Word-boundary match that also works for terms containing punctuation
 * ("c#", ".net", "node.js"). The term must not be glued to other letters or
 * digits on either side, so "go" does not match "google" and "react" does not
 * match "reactive".
 */
function hasTerm(text, term) {
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(text);
}

/** First term of the list present in the text, or null when none is. */
function firstTerm(text, terms = []) {
  return terms.find((term) => hasTerm(text, term)) ?? null;
}

/** Stable short id for a posting, derived from its URL. */
function idFromUrl(url) {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
}

/** "Mercado Livre" -> "mercado-livre". Keys the blocked-company list. */
function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Fractional days between an ISO date and now; Infinity for unparseable input. */
function daysSince(isoDate, now = Date.now()) {
  const time = Date.parse(isoDate);
  return Number.isFinite(time) ? (now - time) / DAY_MS : Infinity;
}

/** YYYY-MM-DD in UTC. */
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** "2026-10-06 14:05" in UTC, used for the tracker note and run summaries. */
function timestampIso() {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

module.exports = { hasTerm, firstTerm, idFromUrl, slugify, daysSince, todayIso, timestampIso };
