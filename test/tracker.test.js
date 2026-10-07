'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderTrackerNote, syncStatusesFromNote, markdownTable, readUserEdits, MARKER } = require('../src/tracker');

function tracker() {
  return {
    approved: [
      { id: 'a1', title: 'Senior Node Engineer', company: 'Acme', url: 'https://x/1', source: 'remotive', score: 9, date: '2026-10-01' },
      { id: 'a2', title: 'Backend Engineer', company: 'Beta', url: 'https://x/2', source: 'lever:beta', score: 7, date: '2026-10-03' },
    ],
    skipped: [{ id: 's1', title: 'PHP Dev', company: 'Gamma', url: 'https://x/3', source: 'wwr', score: 2, date: '2026-10-02' }],
    blocked: ['gamma'],
    statuses: {},
    lastRun: { when: '2026-10-05 19:15 UTC', fetched: 300, candidates: 12, sent: 8, stats: { remotive: 100, wwr: 'ERR HTTP 503' }, mode: 'live' },
  };
}

test('markdownTable pads columns to the widest cell and escapes pipes', () => {
  const lines = markdownTable(['A', 'Role'], [['1', 'a|b'], ['22', 'Dev']]);
  assert.deepEqual(lines, [
    '| A   | Role |',
    '| --- | ---- |',
    '| 1   | a\\|b |',
    '| 22  | Dev  |',
  ]);
});

test('renders every section with counts', () => {
  const note = renderTrackerNote(tracker(), {});
  assert.match(note, /^---\ntags:\n {2}- job-search/);
  assert.ok(note.includes('## ✅ Approved (2) — to apply: 2 · applied: 0'));
  assert.ok(note.includes('- [ ] **Beta** — Backend Engineer · 7 · 2026-10-03 · lever:beta · [open](https://x/2) · '));
  assert.ok(note.includes('## 📨 Sent to Telegram — awaiting a decision (0)\n\nNothing waiting.'));
  assert.ok(note.includes('## ⏭ Skipped (last 1)'));
  assert.ok(note.includes('## 🚫 Blocked companies (1)\n\n- gamma'));
  assert.ok(note.includes('- Sources: remotive=100, wwr=ERR HTTP 503'));
  assert.ok(note.trimEnd().endsWith(`${MARKER}\n\n## 📝 Manual notes`));
});

test('pending cards are listed in a table, newest first; test cards are hidden', () => {
  const pending = {
    p1: { id: 'p1', title: 'Go Engineer', company: 'Delta', url: 'https://x/4', score: 6, sent: '2026-10-04' },
    p2: { id: 'p2', title: 'TS Engineer', company: 'Echo', url: 'https://x/5', score: 8, sent: '2026-10-05' },
    t1: { id: 't1', test: true, title: 'Test card', company: 'job-bot', url: '', score: 0, sent: '2026-10-05' },
  };
  const note = renderTrackerNote(tracker(), pending);
  assert.ok(note.includes('awaiting a decision (2)'));
  assert.ok(note.indexOf('Echo') < note.indexOf('Delta'));
  assert.ok(!note.includes('Test card'));
});

test('readUserEdits picks up the checkbox and the text typed after the link', () => {
  const previous = [
    '## ✅ Approved (2)', '',
    '- [x] **Acme** — Senior Node Engineer · 9 · 2026-10-01 · remotive · [open](https://x/1) · interview 05/10',
    '- [ ] **Beta** — Backend Engineer · 7 · 2026-10-03 · lever:beta · [open](https://x/2) · ',
    '', '## ⏭ Skipped',
  ].join('\n');
  assert.deepEqual(readUserEdits(previous), {
    'https://x/1': { applied: true, note: 'interview 05/10' },
    'https://x/2': { applied: false, note: '' },
  });
});

test('user edits survive a regeneration and applied jobs sink to the bottom', () => {
  const state = tracker();
  const first = renderTrackerNote(state, {});
  const edited = first.replace('- [ ] **Acme**', '- [x] **Acme**').replace('[open](https://x/1) · ', '[open](https://x/1) · rejected 06/10');

  syncStatusesFromNote(state, edited);
  assert.deepEqual(state.statuses.a1, { applied: true, note: 'rejected 06/10' });

  const second = renderTrackerNote(state, {}, edited);
  assert.ok(second.includes('to apply: 1 · applied: 1'));
  assert.ok(second.includes('- [x] **Acme** — Senior Node Engineer · 9 · 2026-10-01 · remotive · [open](https://x/1) · rejected 06/10'));
  assert.ok(second.indexOf('**Beta**') < second.indexOf('**Acme**'));
});

test('everything below the marker is kept verbatim', () => {
  const previous = `${renderTrackerNote(tracker(), {})}\nCall Acme back on Monday.\n`;
  const next = renderTrackerNote(tracker(), {}, previous);
  assert.ok(next.endsWith(`${MARKER}\n\n## 📝 Manual notes\n\nCall Acme back on Monday.\n`));
});
