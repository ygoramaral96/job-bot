'use strict';
// Renders the Markdown tracker note from the bot's state. The note lives in
// the user's notes (an Obsidian vault, for instance) and is regenerated on
// every run, except for what the user wrote in it:
//   - the checkbox on each approved job ("- [x]" = applied) and any text typed
//     after the job link ("interview 05/10", "rejected", ...). Text starting
//     with "dropped" moves the job to the Dropped section, shown as "- [-]".
//   - everything below the manual-notes marker at the end
// Deleting a job's line does nothing: the job comes back on the next run. A
// missing line cannot be told apart from a note that was truncated, so only an
// explicit "dropped" takes a job off the list. Text is the signal, not the box:
// Obsidian's checkbox only toggles between "[ ]" and "[x]".

const { timestampIso } = require('./text');

const MARKER = '<!-- manual-notes: everything below this line is kept as-is by the bot -->';
const LINK = /\[open\]\((.+?)\)/;
const CHECKBOX_LINE = /^- \[( |x|X|-)\] (.*)$/;
const DROPPED_NOTE = /^dropped\b/i;
const MAX_SKIPPED_SHOWN = 60;

/**
 * Markdown table with every column padded to its widest cell. This matches
 * Obsidian's own table formatter, so a click inside the table does not make
 * the editor rewrite the file.
 */
function markdownTable(header, rows) {
  const clean = (cell) => String(cell ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const all = [header, ...rows].map((row) => row.map(clean));
  const width = (text) => [...text].length;
  const widths = header.map((_, column) => Math.max(3, ...all.map((row) => width(row[column] || ''))));
  const line = (row) => `| ${row.map((cell, column) => cell + ' '.repeat(widths[column] - width(cell))).join(' | ')} |`;
  const separator = `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`;
  return [line(all[0]), separator, ...all.slice(1).map(line)];
}

/**
 * Reads the user's edits from the previous note: checkbox state and trailing
 * text for each approved or dropped job, keyed by job URL.
 */
function readUserEdits(previousNote) {
  const edits = {};
  const sections = previousNote.split(/^## /m).filter((section) => section.startsWith('✅') || section.startsWith('🗑'));
  for (const rawLine of sections.join('\n').split('\n')) {
    const line = CHECKBOX_LINE.exec(rawLine.trim());
    if (!line) continue;
    const link = LINK.exec(line[2]);
    if (!link) continue;
    const trailing = line[2].slice(link.index + link[0].length).replace(/^\s*·\s*/, '').trim();
    edits[link[1]] = {
      applied: line[1].toLowerCase() === 'x',
      dropped: DROPPED_NOTE.test(trailing),
      note: trailing,
    };
  }
  return edits;
}

/** The manual-notes section of the previous note, or an empty heading. */
function readManualNotes(previousNote) {
  const index = previousNote.indexOf(MARKER);
  return index >= 0 ? previousNote.slice(index + MARKER.length) : '\n\n## 📝 Manual notes\n\n';
}

/**
 * Copies what the user marked in the note into `tracker.statuses`, so the
 * information survives even if the note is lost. Mutates `tracker`.
 */
function syncStatusesFromNote(tracker, previousNote) {
  tracker.statuses = tracker.statuses || {};
  const edits = readUserEdits(previousNote);
  for (const job of tracker.approved) {
    if (edits[job.url]) tracker.statuses[job.id] = edits[job.url];
  }
}

function renderTrackerNote(tracker, pending, previousNote = '') {
  const statuses = tracker.statuses || {};
  const statusOf = (job) => statuses[job.id] || { applied: false, dropped: false, note: '' };
  const jobLine = (job, box) => {
    const status = statusOf(job);
    const trailing = status.note ? ` · ${status.note}` : ' · ';
    return `- [${box}] **${job.company}** — ${job.title} · ${job.score} · ${job.date} · ${job.source} · [open](${job.url})${trailing}`;
  };

  const approved = tracker.approved.filter((job) => !statusOf(job).dropped).sort((a, b) =>
    Number(statusOf(a).applied) - Number(statusOf(b).applied) || b.date.localeCompare(a.date));
  const dropped = tracker.approved.filter((job) => statusOf(job).dropped).sort((a, b) => b.date.localeCompare(a.date));
  const appliedCount = approved.filter((job) => statusOf(job).applied).length;
  const skipped = [...tracker.skipped].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_SKIPPED_SHOWN);
  const waiting = Object.values(pending)
    .filter((job) => !job.test)
    .sort((a, b) => (b.sent || '').localeCompare(a.sent || '') || b.score - a.score);
  const lastRun = tracker.lastRun || {};

  const out = [];
  out.push('---', 'tags:', '  - job-search', '  - tracker', `updated: ${timestampIso()}`, '---', '');
  out.push('# 📋 Job Tracker', '');
  out.push(
    '> [!info] Maintained by job-bot (GitHub Actions + Telegram)',
    '> Approve or skip from Telegram. **Tick the box once you have applied**; anything you type after the job link (e.g. `interview 05/10`, `rejected`) is kept too. **Gave up on a job? Type `dropped` after its link** (deleting the line does nothing; it comes back). Everything else above the marker at the end is regenerated on every run.',
    '',
  );

  out.push(`## ✅ Approved (${approved.length}) — to apply: ${approved.length - appliedCount} · applied: ${appliedCount}`, '');
  for (const job of approved) out.push(jobLine(job, statusOf(job).applied ? 'x' : ' '));

  out.push('', `## 📨 Sent to Telegram — awaiting a decision (${waiting.length})`, '');
  if (waiting.length) {
    out.push(...markdownTable(
      ['Sent', 'Company', 'Role', 'Score', 'Link'],
      waiting.map((job) => [job.sent || '—', job.company, job.title, job.score, `[open](${job.url})`]),
    ));
  } else {
    out.push('Nothing waiting.');
  }

  out.push('', `## 🗑 Dropped (${dropped.length}) — delete the word "dropped" to restore`, '');
  if (dropped.length) {
    for (const job of dropped) out.push(jobLine(job, '-'));
  } else {
    out.push('Nothing dropped.');
  }

  out.push('', `## ⏭ Skipped (last ${skipped.length})`, '');
  out.push(...markdownTable(['Date', 'Company', 'Role', 'Score'], skipped.map((job) => [job.date, job.company, job.title, job.score])));

  out.push('', `## 🚫 Blocked companies (${tracker.blocked.length})`, '');
  for (const company of tracker.blocked) out.push(`- ${company}`);

  const sources = lastRun.stats ? Object.entries(lastRun.stats).map(([name, count]) => `${name}=${count}`).join(', ') : '—';
  out.push('', '## 📊 Last run', '',
    `- When: ${lastRun.when || '—'}`,
    `- Fetched: ${lastRun.fetched ?? '—'} · new candidates: ${lastRun.candidates ?? '—'} · sent: ${lastRun.sent ?? '—'}`,
    `- Sources: ${sources}`,
    `- Mode: ${lastRun.mode || '—'}`);

  out.push('', MARKER + readManualNotes(previousNote).replace(/\s+$/, ''), '');
  return out.join('\n');
}

module.exports = { renderTrackerNote, syncStatusesFromNote, markdownTable, readUserEdits, MARKER };
