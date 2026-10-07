#!/usr/bin/env node
'use strict';
// job-bot entry point: collect → triage → Telegram approval queue → tracker note.
//
//   node run.js [full] [--dry-run] [--limit N] [--show N]   fetch, triage, send (default)
//   node run.js clicks                                      poll Telegram taps, no fetching
//   node run.js update                                      apply the update in $JOB_BOT_UPDATE
//   node run.js test-card                                   send a test card to check the webhook
//
// Environment (all optional; without Telegram credentials every mode is a dry run):
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   the bot and the only chat it talks to
//   TRACKER_NOTE                           path of the Markdown note to (re)write
//   JOB_BOT_WORKER_URL, JOB_BOT_WORKER_KEY the webhook Worker, for replaying taps
//   JOB_BOT_UPDATE                         one Telegram update as JSON (mode "update")

const fs = require('node:fs');
const path = require('node:path');
const { loadState, saveState } = require('./src/state');
const { TelegramClient, cardKeyboard } = require('./src/telegram');
const { collectAndSend } = require('./src/pipeline');
const { pollTelegram, applyUpdate } = require('./src/decisions');
const { renderTrackerNote, syncStatusesFromNote } = require('./src/tracker');
const { todayIso } = require('./src/text');

const ROOT = __dirname;
const STATE_DIR = path.join(ROOT, 'state');
const MODES = ['full', 'clicks', 'update', 'test-card'];

const OPTIONS_WITH_VALUE = ['--limit', '--show'];

function parseArgs(argv) {
  const positional = [];
  const options = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (OPTIONS_WITH_VALUE.includes(arg)) options[arg.slice(2)] = Number(argv[++i]);
    else if (arg.startsWith('--')) throw new Error(`unknown option "${arg}"`);
    else positional.push(arg);
  }
  const mode = positional[0] || 'full';
  if (!MODES.includes(mode)) throw new Error(`unknown mode "${mode}"; expected one of ${MODES.join(', ')}`);
  return { mode, ...options };
}

function buildContext(env, log) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  const live = Boolean(token && chatId);
  return {
    live,
    telegram: live ? new TelegramClient(token, chatId) : null,
    chatId,
    state: loadState(STATE_DIR),
    log,
    workerUrl: env.JOB_BOT_WORKER_URL,
    workerKey: env.JOB_BOT_WORKER_KEY,
    notePath: env.TRACKER_NOTE,
  };
}

/** Rewrites the tracker note, keeping the user's own edits, then persists state. */
function persist(ctx) {
  const { state, notePath, log } = ctx;
  if (notePath) {
    const previous = fs.existsSync(notePath) ? fs.readFileSync(notePath, 'utf8') : '';
    syncStatusesFromNote(state.tracker, previous);
    fs.writeFileSync(notePath, renderTrackerNote(state.tracker, state.pending, previous));
  } else {
    log('TRACKER_NOTE not set; tracker note not written');
  }
  saveState(STATE_DIR, state);
}

async function sendTestCard(ctx) {
  const id = `test${Date.now().toString(36)}`;
  await ctx.telegram.sendMessage('🧪 <b>job-bot test card</b>\nTap any button. Nothing is recorded in the tracker.', cardKeyboard(id));
  ctx.state.pending[id] = { id, test: true, title: 'Test card', company: 'job-bot', url: '', source: 'test', score: 0, sent: todayIso() };
  saveState(STATE_DIR, ctx.state);
  ctx.log(`test card ${id} sent`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const log = (...parts) => console.log(...parts);
  const ctx = buildContext(process.env, log);
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  const dryRun = options.dryRun || !ctx.live;

  log(`job-bot ${new Date().toISOString()} mode=${options.mode} ${dryRun ? '(dry-run)' : '(live)'}`);

  if (options.mode !== 'full' && dryRun) {
    log(`mode "${options.mode}" needs Telegram credentials; nothing to do`);
    return;
  }

  switch (options.mode) {
    case 'test-card':
      await sendTestCard(ctx);
      return;
    case 'update':
      await applyUpdate(JSON.parse(process.env.JOB_BOT_UPDATE || '{}'), ctx, { quiet: true });
      await pollTelegram(ctx); // also replays the other recent taps
      persist(ctx);
      return;
    case 'clicks':
      await pollTelegram(ctx);
      persist(ctx);
      return;
    default:
      if (!dryRun) await pollTelegram(ctx);
      await collectAndSend(ctx, config, { dryRun, limit: options.limit, show: options.show });
      if (!dryRun) persist(ctx);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
