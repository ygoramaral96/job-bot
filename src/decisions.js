'use strict';
// Inbound side: turns Telegram button taps and commands into tracker entries.
// Updates arrive in one of three ways and all end up in applyUpdate():
//   1. forwarded by the webhook Worker (env JOB_BOT_UPDATE, mode "update")
//   2. replayed from the Worker's KV store on every run (GET /recent)
//   3. polled with getUpdates when no webhook is set (mode "clicks")

const { ACTIONS, parseCallbackData } = require('./telegram');
const { escapeHtml } = require('./html');
const { slugify, todayIso } = require('./text');

/**
 * @typedef {object} Context
 * @property {import('./telegram').TelegramClient} telegram
 * @property {string} chatId        the only chat the bot listens to
 * @property {object} state         from state.js
 * @property {(line: string) => void} log
 * @property {string} [workerUrl]   Cloudflare Worker base URL, for replay
 * @property {string} [workerKey]   shared secret for GET /recent
 */

/** Polls Telegram directly, or replays the Worker's stored taps when a webhook is set. */
async function pollTelegram(ctx) {
  const { telegram, state, log } = ctx;
  const webhook = await telegram.getWebhookInfo().catch((error) => ({ error: error.message }));
  const status = webhook.error || (webhook.url ? 'set' : 'none');
  const lastError = webhook.last_error_message ? ` · last error: ${webhook.last_error_message}` : '';
  log(`telegram webhook: ${status} · pending updates ${webhook.pending_update_count ?? '?'}${lastError}`);

  // With a webhook set, getUpdates is refused by Telegram; the Worker is the source instead.
  if (webhook.url) return replayRecentTaps(ctx);

  const offset = state.telegram.offset ? state.telegram.offset + 1 : undefined;
  const updates = await telegram.getUpdates(offset);
  log(`telegram: ${updates.length} update(s) since offset ${state.telegram.offset}`);
  for (const update of updates) await applyUpdate(update, ctx);
}

/**
 * Taps the Worker kept for the last few days. Applying one twice is a no-op
 * (its job is no longer pending), so every run replays them all; this recovers
 * taps whose own workflow run GitHub dropped.
 */
async function replayRecentTaps(ctx) {
  const { workerUrl, workerKey, log } = ctx;
  if (!workerUrl || !workerKey) {
    log('webhook set but JOB_BOT_WORKER_URL / JOB_BOT_WORKER_KEY missing; recent taps not replayed');
    return;
  }
  const response = await fetch(`${workerUrl.replace(/\/$/, '')}/recent`, { headers: { 'x-job-bot-key': workerKey } });
  if (!response.ok) {
    log(`recent taps: worker answered ${response.status}`);
    return;
  }
  const taps = (await response.json()).sort((a, b) => a.update_id - b.update_id);
  log(`recent taps from worker: ${taps.length}`);
  for (const tap of taps) await applyUpdate(tap, ctx, { quiet: true });
}

/**
 * Applies one Telegram update.
 * @param {object} update   a Telegram Update, possibly slimmed by the Worker
 * @param {Context} ctx
 * @param {{ quiet?: boolean }} options  quiet: a replayed tap whose job is already
 *   recorded is skipped without touching Telegram
 */
async function applyUpdate(update, ctx, { quiet = false } = {}) {
  ctx.state.telegram.offset = Math.max(ctx.state.telegram.offset, update.update_id || 0);
  if (update.callback_query) return applyTap(update.callback_query, ctx, quiet);
  if (update.message?.text) return applyCommand(update.message, ctx);
}

function isOwnChat(chatId, ...ids) {
  return ids.some((id) => String(id) === String(chatId));
}

async function applyTap(query, ctx, quiet) {
  const { telegram, chatId, state, log } = ctx;
  const { action, jobId } = parseCallbackData(query.data);
  const messageId = query.message?.message_id;

  if (!isOwnChat(chatId, query.from?.id, query.message?.chat?.id)) {
    await telegram.answerCallback(query.id, 'Not for you.');
    return;
  }

  const job = state.pending[jobId];
  if (job?.test) {
    // Card from `test-card`: proves the tap reached the repo and records nothing.
    delete state.pending[jobId];
    const at = new Date().toISOString().slice(11, 19);
    await telegram.editText(messageId, `🧪 <b>Test OK</b> — tap "${escapeHtml(action)}" received by GitHub at ${at} UTC.`);
    log(`test card ${jobId}: tap ${action} received`);
    return;
  }
  if (!job) {
    if (quiet) return;
    log(`tap ${query.data}: job not pending (already processed?)`);
    await telegram.answerCallback(query.id, 'Posting not found (already processed?)');
    await telegram.removeButtons(messageId);
    return;
  }

  const entry = { ...job, date: todayIso(), decidedAt: new Date().toISOString() };
  if (action === ACTIONS.APPROVE) {
    state.tracker.approved.push(entry);
    await telegram.answerCallback(query.id, '✅ Saved as "to apply"');
    await telegram.editText(messageId, `✅ <b>APPROVED</b>\n${escapeHtml(query.message?.text || '')}`);
  } else if (action === ACTIONS.SKIP) {
    state.tracker.skipped.push(entry);
    await telegram.answerCallback(query.id, '⏭ Skipped');
    await telegram.removeButtons(messageId);
  } else if (action === ACTIONS.BLOCK) {
    const slug = slugify(job.company);
    if (slug && !state.tracker.blocked.includes(slug)) state.tracker.blocked.push(slug);
    state.tracker.skipped.push({ ...entry, blockedCompany: true });
    await telegram.answerCallback(query.id, `🚫 ${job.company} blocked`);
    await telegram.removeButtons(messageId);
  } else {
    log(`tap ${query.data}: unknown action`);
    return;
  }
  delete state.pending[jobId];
  log(`tap ${query.data}: ${job.company} — ${job.title}`);
}

async function applyCommand(message, ctx) {
  const { telegram, chatId, state } = ctx;
  if (!isOwnChat(chatId, message.chat?.id)) return;
  const command = message.text.trim();
  if (command === '/status') {
    const { tracker, pending } = state;
    await telegram.sendMessage(
      `Approved: <b>${tracker.approved.length}</b> · Skipped: ${tracker.skipped.length} · Pending: ${Object.keys(pending).length} · Blocked: ${tracker.blocked.length}\n`
      + `Last run: ${tracker.lastRun ? tracker.lastRun.when : '—'}`,
    );
  } else if (command === '/start') {
    await telegram.sendMessage('job-bot is on. New postings arrive here on schedule; use the buttons. /status shows a summary.');
  }
}

module.exports = { pollTelegram, replayRecentTaps, applyUpdate };
