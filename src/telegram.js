'use strict';
// Minimal Telegram Bot API client plus the job-card layout. No dependencies.
// Docs: https://core.telegram.org/bots/api

const { escapeHtml, toTelegramHtml } = require('./html');

const MESSAGE_LIMIT = 4096; // Telegram's cap per message
const CARD_TAG_MARGIN = 60; // room for the <blockquote> tags and the ellipsis
const MAX_SNIPPET_CHARS = 2500;
const MIN_SNIPPET_ROOM = 200;

/** Button actions, encoded in callback_data as "<action>:<job id>". */
const ACTIONS = { APPROVE: 'a', SKIP: 's', BLOCK: 'b' };

class TelegramClient {
  constructor(token, chatId) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
    this.chatId = String(chatId);
  }

  async call(method, body = {}) {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!payload.ok) throw new Error(`${method}: ${payload.description}`);
    return payload.result;
  }

  getWebhookInfo() {
    return this.call('getWebhookInfo');
  }

  getUpdates(offset) {
    return this.call('getUpdates', { offset, timeout: 0, allowed_updates: ['callback_query', 'message'] });
  }

  sendMessage(text, replyMarkup) {
    return this.call('sendMessage', {
      chat_id: this.chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    });
  }

  // The three edits below may run after the webhook Worker already did the
  // same thing, so a failure is expected there and ignored.
  answerCallback(callbackId, text) {
    return this.call('answerCallbackQuery', { callback_query_id: callbackId, text }).catch(() => {});
  }

  removeButtons(messageId) {
    return this.call('editMessageReplyMarkup', {
      chat_id: this.chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    }).catch(() => {});
  }

  editText(messageId, text) {
    return this.call('editMessageText', {
      chat_id: this.chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }).catch(() => {});
  }
}

/** Parses "<action>:<job id>" from a button tap. */
function parseCallbackData(data) {
  const [action, jobId] = String(data || '').split(':');
  return { action, jobId };
}

function cardKeyboard(jobId) {
  return {
    inline_keyboard: [[
      { text: '✅ Apply', callback_data: `${ACTIONS.APPROVE}:${jobId}` },
      { text: '⏭ Skip', callback_data: `${ACTIONS.SKIP}:${jobId}` },
      { text: '🚫 Company', callback_data: `${ACTIONS.BLOCK}:${jobId}` },
    ]],
  };
}

/**
 * One posting as a Telegram message: title, company, score with its reasons,
 * links, and the description inside an expandable quote so the card stays
 * short until tapped.
 */
function renderCard(job, triage) {
  const lines = [
    `<b>${escapeHtml(job.title)}</b>`,
    `${escapeHtml(job.company)} · ${escapeHtml(job.location || '—')} · <i>${escapeHtml(job.source)}</i>`,
    `Score <b>${triage.score}</b> · ${escapeHtml(triage.reasons.join(' · '))}`,
  ];
  if (job.salary) lines.push(`💰 ${escapeHtml(job.salary)}`);
  lines.push(`<a href="${escapeHtml(job.url)}">Open posting</a>`);

  if (job.source === 'wwr') {
    // Applying through WWR is paywalled; the company's own careers page usually is not.
    const search = `https://www.google.com/search?q=${encodeURIComponent(`"${job.company}" careers`)}`;
    const companyLink = job.meta.companyUrl ? `<a href="${escapeHtml(job.meta.companyUrl)}">company site</a> · ` : '';
    lines.push(`🏢 Applying on WWR is paid — ${companyLink}<a href="${escapeHtml(search)}">search careers page</a>`);
  }

  const head = lines.join('\n');
  const room = MESSAGE_LIMIT - head.length - CARD_TAG_MARGIN;
  const plain = (job.description || '').trim();
  if (!plain || room <= MIN_SNIPPET_ROOM) return head;

  const limit = Math.min(MAX_SNIPPET_CHARS, room);
  const snippet = toTelegramHtml(job.descriptionHtml || plain, limit) + (plain.length > limit ? ' […]' : '');
  return `${head}\n<blockquote expandable>${snippet}</blockquote>`;
}

module.exports = { TelegramClient, ACTIONS, parseCallbackData, cardKeyboard, renderCard };
