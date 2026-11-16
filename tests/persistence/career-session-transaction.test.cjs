'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { CAREER_SAVE_SECTIONS } = load('src/systems/persistence/career-save-contract.ts');
const { prepareCareerAuthorities, createCareerSessionSlot } = load(
  'src/systems/persistence/career-session-transaction.ts'
);
const snapshot = {
  version: 1,
  sections: Object.fromEntries(CAREER_SAVE_SECTIONS.map((section) => [section, { id: section }])),
};
const events = [];
const active = { original: true };
const slot = createCareerSessionSlot(active);
const builders = CAREER_SAVE_SECTIONS.map((section) => ({
  section,
  stage(value, preceding) {
    if (section === 'economy') assert.equal(preceding.player.id, 'player');
    events.push('build:' + section);
    return {
      value: { id: value.id },
      discard: () => events.push('discard:' + section),
    };
  },
}));
const prepared = prepareCareerAuthorities(snapshot, builders, (sections) => {
  assert.equal(Object.keys(sections).length, 14);
  assert.equal(sections.world.id, 'world');
});
assert.strictEqual(slot.current(), active, 'staging must never replace the live session');
assert.strictEqual(slot.install(prepared.sections), active);
assert.strictEqual(slot.current(), prepared.sections);
assert.equal(events.filter((event) => event.startsWith('discard:')).length, 0);

const before = slot.current();
const damaged = JSON.parse(JSON.stringify(snapshot));
damaged.sections.campaigns = { invalid: true };
assert.throws(
  () =>
    prepareCareerAuthorities(damaged, builders, () => {
      throw new Error('cross-domain validation failed');
    }),
  /cross-domain validation/
);
assert.strictEqual(
  slot.current(),
  before,
  'failed cross-domain check must not alter active session'
);
const cleanup = events.filter((event) => event.startsWith('discard:'));
assert.equal(cleanup.length, 14);
assert.equal(cleanup[0], 'discard:world');
assert.equal(cleanup.at(-1), 'discard:navigation');
assert.throws(() => prepareCareerAuthorities(snapshot, builders.slice(1), () => {}), /Incomplete/);
assert.throws(
  () => prepareCareerAuthorities(snapshot, [...builders, builders[0]], () => {}),
  /duplicated/
);
assert.strictEqual(slot.current(), before);
console.log('PASS career transaction: 14 authority staging, cleanup and atomic session pointer');
