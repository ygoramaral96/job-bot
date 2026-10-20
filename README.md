<p align="center"><img src="assets/bot-avatar.png" width="96" alt=""></p>

# job-bot

A personal job-search pipeline that runs for free and never applies on its own.
Three times a day it pulls postings from public job APIs, triages them with
deterministic rules, and sends the best ones to Telegram as cards with
**Apply / Skip / Block company** buttons. Every tap lands in a Markdown
tracker note within a minute.

No LLM, no API key, no server to keep alive: Node 22 built-ins, GitHub
Actions, and one Cloudflare Worker on the free plan.

```
 Cloudflare Worker ──cron──▶ GitHub Actions ──▶ run.js
                                                 │  fetch 7 job boards + Greenhouse/Lever companies
                                                 │  triage (config.json) → score + reasons
                                                 ▼
                                             Telegram card  ✅ Apply  ⏭ Skip  🚫 Company
                                                 │ tap
                                                 ▼
 Cloudflare Worker ◀──webhook── Telegram
   │ answers the tap, removes the buttons
   │ stores the tap in KV (3 days)
   └──dispatch(mode=update)──▶ GitHub Actions ──▶ run.js records the decision
                                                 │  commits state/*.json here
                                                 └─ rewrites the tracker note in a notes repo
```

## Design decisions

**No LLM in the triage.** The filters are lists of words in [config.json](config.json)
and the score is a sum of named weights. Every point comes with a reason that is
printed on the card (`senior title (sr) · remote · stack +7 (node, typescript, aws)`),
so a surprising result is traceable to one line of config. A model would be
slower, cost money, and make the same mistake twice without telling you why.

**The bot ranks; a person decides.** It never applies, never messages a
company, and never drops a posting because of salary. A figure clearly below
the floor costs two points and gets a ⚠️ on the card. Job descriptions are
treated as untrusted input: stripped to plain text for scoring, and re-emitted
as the small HTML subset Telegram accepts, with every text node escaped.

**A webhook instead of polling.** The first version polled `getUpdates` on an
hourly schedule, so a tap took up to an hour to show any effect and the buttons
stayed on the card until then. The Worker answers the tap immediately, removes
the buttons, and dispatches the workflow with the update. The tracker note
updates about a minute later.

**Do not trust GitHub's `schedule`.** On 2026-10-01 the hourly schedule fired
7 times out of 26, and the daily runs came 3–6 hours late. Cron Triggers on
Cloudflare fire on time, so the Worker owns the clock and the workflow only
listens to `workflow_dispatch`.

**Replay taps from KV on every run.** The workflow runs under a concurrency
group, and GitHub keeps at most one queued run per group: a burst of taps
drops some dispatches. The Worker keeps every tap in KV for three days and
serves them at `GET /recent`; every run replays all of them. Applying a tap
twice is a no-op, because its job is no longer pending, so the replay is
idempotent and recovers whatever GitHub dropped.

**State lives in the repo.** Four small JSON files under `state/` are
committed back by the workflow after each live run. There is nothing to host,
and `git log` is the audit trail. The cost is that a public repo would publish
your decisions, so run the bot from a private fork.

**The tracker note is regenerated, except for what you wrote in it.** The
checkbox on each approved job and any text after its link survive, as does
everything below a marker at the end. What you mark in the note is also
copied back into `state/tracker.json`, so the note can be lost and rebuilt.
To give up on a job, type `dropped` after its link: it moves to a Dropped
section, and deleting the word brings it back. Deleting the line does
nothing, on purpose: a missing line looks the same as a note truncated by a
sync conflict, and that should never wipe the list.

**Zero dependencies.** A tool that runs unattended should not break because a
transitive dependency did. Fetching, HTML stripping, XML reading and the
Telegram client are a few hundred lines of plain Node.

## Triage rules

All in [config.json](config.json); nothing is hard-coded in `src/`.

1. **Title** must contain an engineering word (`titleMust`) and none of the
   `titleExclude` words (junior, mobile, data, devops, QA, manager, ...).
2. A title naming an **off-stack language** (`titleOffStack`: Python, Java,
   .NET, Ruby, PHP, ...) is dropped unless it also names an on-stack one
   (`titleOnStack`). "Python Developer" goes; "Python/Node Developer" stays.
3. **Location** is checked per source (WWR regions, Himalayas restriction
   lists, free text elsewhere) and then the description is searched for
   "US only"-style phrases (`locationBad`).
4. **Salary** is never a filter. The highest figure found is compared with
   `salaryFloor`; a range counts as "below the floor" only when its top is.
5. **Score** = seniority + remote + stack keywords (capped) + great-place
   bonus − salary flag. Weights live under `weights`. Cards go out for
   `score >= minScore`, at most `maxSendPerRun` per run, highest first; the
   rest wait for the next run.

Tune and check with `npm run dry-run`, which prints the ranked list with
reasons and writes nothing.

## Sources

| Source | How | Location signal |
|---|---|---|
| Remotive | JSON API | `candidate_required_location` |
| Himalayas | JSON API | `locationRestrictions` |
| We Work Remotely | RSS, three categories | `<region>` / `<country>` tags |
| Greenhouse boards | `boards-api.greenhouse.io` per company | location name, offices |
| Lever boards | `api.lever.co` per company | `categories.location`, `workplaceType` |
| Remote OK | JSON API | free text; a filled-in one must say open/remote |
| Working Nomads | JSON API | free text; needs a known-good marker |
| Jobspresso | RSS, latest 10 of all categories | after the ⚲ in `<dc:creator>` |
| NoDesk | RSS, engineering category | none, description only |

Add a company: `job-boards.greenhouse.io/<slug>` → `sources.greenhouse`;
`jobs.lever.co/<slug>` → `sources.lever`. A failing board is logged and
skipped; the run goes on with the others. A source missing from
`config.json` is not fetched.

The same posting often sits on several boards under different URLs. Jobs
with the same company and title are kept once, from the first source in
`src/sources/index.js`: company boards first, since their link applies
directly.

## Setup

1. **Bot and chat.** Telegram → `@BotFather` → `/newbot` → keep the token.
   Send the bot any message, then read `message.chat.id` at
   `https://api.telegram.org/bot<TOKEN>/getUpdates`.
2. **Repo secrets** (`gh secret set NAME --body VALUE` from a private fork):
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
3. **Optional notes repo**, if you want the tracker note committed somewhere
   else (an Obsidian vault, for instance): secret `NOTES_TOKEN` (fine-grained,
   that repo only, *Contents: read and write*) and repository variables
   `NOTES_REPO` (`owner/name`) and `TRACKER_NOTE_PATH` (path of the note inside it).
4. **First run.** Actions → `job-bot` → *Run workflow*. Without the Telegram
   secrets every run is a dry run that only logs the ranked list.

### Webhook Worker

```bash
cd worker
npx wrangler kv namespace create CLICKS     # paste the id into wrangler.toml
# set GITHUB_REPO in wrangler.toml
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put GITHUB_TOKEN        # fine-grained, this repo only, Actions: read and write
npx wrangler secret put WEBHOOK_SECRET      # any long random string
npx wrangler deploy
```

Then add the same random string to the repo as `JOB_BOT_WORKER_KEY` and the
Worker URL as `JOB_BOT_WORKER_URL`, and open `<worker url>/setup?key=<WEBHOOK_SECRET>`
once to point the bot at the Worker. `gh workflow run job-bot -f mode=test`
sends a test card; tapping it turns the card into "Test OK" and records nothing.

If taps stop landing, the GitHub token has most likely expired: generate a new
one and `wrangler secret put GITHUB_TOKEN`.

## Running locally

```bash
npm test                                   # unit tests (node:test, no dependencies)
npm run dry-run                            # rank and print reasons, write nothing
node run.js --dry-run --show 50 --limit 3
TELEGRAM_BOT_TOKEN=… TELEGRAM_CHAT_ID=… node run.js   # a real run from your machine
```

## Layout

```
run.js               CLI: full | clicks | update | test-card
config.json          every rule, list and weight
src/
  pipeline.js        fetch → triage → send
  decisions.js       Telegram taps and commands → tracker entries
  score.js           hard filters, then the additive score with reasons
  location.js        per-source location rules
  salary.js          best-effort salary detection
  sources/           one fetcher per site, all producing the same shape
  telegram.js        Bot API client and the card layout
  tracker.js         the Markdown note, keeping the user's edits
  state.js           the four JSON files under state/
  html.js, http.js, text.js
test/                one file per module
worker/              Cloudflare Worker: webhook, KV replay, cron dispatch
.github/workflows/   the single workflow, started only by workflow_dispatch
```

## Known limitations

- Keyword scoring reads the whole description. A board that pastes the
  company's entire stack into every posting makes unrelated roles score high;
  that is what the Skip button is for, and why the reasons are on the card.
- Salary detection is regex-based and conservative. It reads common formats
  (`R$ 12.000`, `$80k/year`, `USD 45/hour`) and ignores the rest.
- Companies on Gupy or custom career portals have no public API and cannot be added.

## How it was built

I set the design and the rules: the sources, the triage, the webhook and the
replay from KV, the "rank, never apply" boundary. The implementation was
written with an AI coding assistant under my review, in the same spec-driven
way I work day to day. The decisions above are the part I would defend in a
code review; the code is the part the tests cover.

## License

[MIT](LICENSE)
