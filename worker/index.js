// Telegram webhook for job-bot, hosted on Cloudflare Workers (free plan).
//
// On each update from the owner's chat it answers the button tap at once,
// removes the card's buttons, and dispatches the GitHub Actions workflow with
// the update so run.js records the decision (about a minute later).
//
// Every tap is also kept in KV for a few days and served at GET /recent.
// GitHub keeps at most one queued run per concurrency group and drops the
// others, so each run replays the recent taps; run.js ignores taps whose job
// is no longer pending, which makes the replay idempotent.
//
// Cron Triggers (wrangler.toml) start the full run. They fire on time, unlike
// GitHub's own schedule, which ran hours late or not at all.
//
// Vars (wrangler.toml):       GITHUB_REPO ("owner/name"), GITHUB_REF, WORKFLOW_FILE
// Secrets (wrangler secret put): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, GITHUB_TOKEN, WEBHOOK_SECRET
//   GITHUB_TOKEN: fine-grained, only this repo, permission "Actions: read and write".
// Binding:                    CLICKS (KV namespace)

const CLICK_TTL_SECONDS = 3 * 24 * 3600;

const TAP_FEEDBACK = {
  a: '✅ Approved, recording…',
  s: '⏭ Skipped, recording…',
  b: '🚫 Company blocked, recording…',
};

async function telegram(env, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}

/** Starts the workflow: mode "full" (scheduled) or "update" with one Telegram update. */
async function dispatchWorkflow(env, mode, update = null) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.WORKFLOW_FILE}/dispatches`;
  const inputs = update ? { mode, update: JSON.stringify(update) } : { mode };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'job-bot-worker',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({ ref: env.GITHUB_REF || 'main', inputs }),
  });
  if (!response.ok) throw new Error(`dispatch ${response.status}: ${await response.text()}`);
}

/** Keeps only the fields run.js reads, so the workflow input stays small. */
function slimUpdate(update) {
  if (update.callback_query) {
    const query = update.callback_query;
    const message = query.message || {};
    return {
      update_id: update.update_id,
      callback_query: {
        id: query.id,
        data: query.data,
        from: { id: query.from?.id },
        message: { message_id: message.message_id, chat: { id: message.chat?.id }, text: message.text },
      },
    };
  }
  return { update_id: update.update_id, message: { text: update.message.text, chat: { id: update.message.chat.id } } };
}

function isOwnerChat(env, chatId) {
  return String(chatId) === String(env.TELEGRAM_CHAT_ID);
}

async function handleTap(env, update) {
  const query = update.callback_query;
  if (!isOwnerChat(env, query.message?.chat?.id)) return;

  const action = String(query.data || '').split(':')[0];
  await telegram(env, 'answerCallbackQuery', { callback_query_id: query.id, text: TAP_FEEDBACK[action] || 'Recording…' });
  await telegram(env, 'editMessageReplyMarkup', {
    chat_id: env.TELEGRAM_CHAT_ID,
    message_id: query.message.message_id,
    reply_markup: { inline_keyboard: [] },
  });

  const slim = slimUpdate(update);
  const key = `c:${String(update.update_id).padStart(12, '0')}`; // zero-padded so KV lists in order
  await env.CLICKS.put(key, JSON.stringify(slim), { expirationTtl: CLICK_TTL_SECONDS });
  await dispatchWorkflow(env, 'update', slim);
}

async function handleCommand(env, update) {
  const message = update.message;
  if (!isOwnerChat(env, message.chat?.id)) return;
  if (/^\/(status|start)\b/.test(message.text.trim())) await dispatchWorkflow(env, 'update', slimUpdate(update));
}

async function handleUpdate(env, update) {
  if (update.callback_query) return handleTap(env, update);
  if (update.message?.text) return handleCommand(env, update);
}

async function listRecentTaps(env) {
  const { keys } = await env.CLICKS.list({ prefix: 'c:' });
  const items = await Promise.all(keys.map((key) => env.CLICKS.get(key.name, 'json')));
  return items.filter(Boolean);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(dispatchWorkflow(env, 'full'));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const secretOk = (value) => Boolean(value && env.WEBHOOK_SECRET && value === env.WEBHOOK_SECRET);

    // One-time setup: points the bot at this Worker. Protected by the webhook secret.
    if (url.pathname === '/setup' && secretOk(url.searchParams.get('key'))) {
      const result = await telegram(env, 'setWebhook', {
        url: `${url.origin}/telegram`,
        secret_token: env.WEBHOOK_SECRET,
        allowed_updates: ['callback_query', 'message'],
        drop_pending_updates: false,
      });
      return Response.json(result);
    }

    if (url.pathname === '/recent' && secretOk(request.headers.get('x-job-bot-key'))) {
      return Response.json(await listRecentTaps(env));
    }

    if (url.pathname === '/telegram' && request.method === 'POST') {
      if (!secretOk(request.headers.get('x-telegram-bot-api-secret-token'))) {
        return new Response('forbidden', { status: 403 });
      }
      const update = await request.json();
      ctx.waitUntil(handleUpdate(env, update).catch((error) => console.error(error.message)));
      return new Response('ok'); // Telegram retries anything that is not a fast 200
    }

    return new Response('not found', { status: 404 });
  },
};
