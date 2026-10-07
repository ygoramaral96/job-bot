'use strict';
// Thin wrappers over the global fetch with a timeout and a stable user agent.

const DEFAULT_TIMEOUT_MS = 25_000;

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (job-bot; personal use)',
  accept: '*/*',
};

async function fetchText(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.text();
}

async function fetchJson(url, options) {
  return JSON.parse(await fetchText(url, options));
}

module.exports = { fetchText, fetchJson };
