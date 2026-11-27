'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const doc = fs.readFileSync(path.join(root, 'docs/UNIFIED_FIELD_FLIGHT_ARCHITECTURE.md'), 'utf8');
const expected = ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08'];
const keys = ['code', 'removed', 'test', 'ci', 'loc', 'parity'];
const rows = [...doc.matchAll(/^- \[([ x])\] (F\d{2}) .+$/gm)];

assert.deepEqual(
  rows.map((row) => row[2]),
  expected,
  'Keep every architecture package exactly once and in order.'
);

const evidence = doc.split('## Nachweisblock')[1]?.split('## Arbeitslog')[0];
assert.ok(evidence, 'Missing architecture evidence block.');

for (const [, checked, id] of rows) {
  if (checked !== 'x') continue;
  for (const key of keys) {
    const prefix = `- ${id} ${key}: `;
    const entries = evidence.split(/\r?\n/).filter((line) => line.startsWith(prefix));
    assert.equal(entries.length, 1, `${id}: exactly one ${key} evidence entry required.`);
    const value = entries[0].slice(prefix.length).trim();
    assert.ok(
      value.length > 8 && !/^(todo|tbd|offen|placeholder|n\/a|\.\.\.)$/i.test(value),
      `${id}: missing ${key} evidence.`
    );
    if (key === 'test') {
      const files = value.match(/tests\/[\w./-]+\.test\.cjs/g) ?? [];
      assert.ok(files.length, `${id}: reference an actual behavior test.`);
      for (const file of files) {
        assert.ok(fs.existsSync(path.join(root, file)), `${id}: missing ${file}.`);
      }
    }
  }
}

console.log('Field flight architecture checklist structure and evidence references OK.');
