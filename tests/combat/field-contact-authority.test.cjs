'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const authorityPath = 'src/systems/combat/field-contact-authority.ts';
const authority = loadStandaloneTypeScriptModule(root, authorityPath);
const { createParallelNativeDuels } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/parallel-native-duels.ts',
  { [authorityPath]: authority }
);

function entry(id, team, x, y) {
  return {
    id,
    team,
    position: { x, y },
    setup: {
      id,
      name: id,
      shipId: 'patrol-60m-variant-01',
      shieldHp: 3000,
      hullHp: 3000,
      weapons: [],
      hitChance: 0.7,
      dodgeChance: 0.1,
      damageMultiplier: 1,
      criticalChance: 0,
      cycleTimeMultiplier: 1,
      combatSpeed: 100,
    },
  };
}

const field = { asteroids: [], removedIds: new Set(), advanced: false };
const arena = { width: 4200, height: 2600, fieldWorld: field, obstacles: [] };
const first = createParallelNativeDuels(
  [entry('a', 'a', 1000, 1000), entry('b', 'b', 2200, 1000)],
  arena,
  101
);
const second = createParallelNativeDuels(
  [entry('c', 'a', 1010, 1000), entry('d', 'b', 2800, 1500)],
  arena,
  102
);
const a = first.getActor('a');
const c = second.getActor('c');
a.position = { x: 1000, y: 1000 };
c.position = { x: 1010, y: 1000 };
const before = { ...c.position };
authority.resetFieldContactStep(field);
authority.registerFieldCombatActors(field, first.fieldActors(), (id) => first.hasEscaped(id));
authority.registerFieldCombatActors(field, second.fieldActors(), (id) => second.hasEscaped(id));
assert.equal(authority.fieldCombatActors(field).size, 4);
assert.strictEqual(authority.fieldCombatActors(field).get('c'), c);
const cached = second.getSnapshot();
first.advance(0.01);
assert.notDeepEqual(
  c.position,
  before,
  'first fleet resolves contact against the live foreign actor'
);
assert.equal(
  second.getSnapshot().elapsedSeconds,
  0,
  'foreign contact does not tick the other fleet'
);
assert.notStrictEqual(
  second.getSnapshot(),
  cached,
  'foreign correction invalidates stale snapshots'
);
assert.equal(
  authority.claimFieldContact(field, 'c', 'a'),
  false,
  'same unordered pair already claimed'
);
const aAfter = { ...a.position };
c.position = { x: a.position.x + 1, y: a.position.y };
second.advance(0.01);
assert.deepEqual(a.position, aAfter, 'second fleet must not correct the same pair twice');
assert.equal(first.getSnapshot().elapsedSeconds, 0.01);
assert.equal(second.getSnapshot().elapsedSeconds, 0.01);
c.hullHp = 0;
assert(!authority.fieldCombatActors(field).has('c'));
assert(authority.fieldCombatOwnedIds(field).has('c'), 'stale field mirrors must stay excluded');
authority.resetFieldContactStep(field);
assert.equal(authority.fieldCombatActors(field).size, 0);
assert(authority.claimFieldContact(field, 'a', 'c'));
const other = { ...field };
assert(!authority.hasFieldContactStep(other));
authority.resetFieldContactStep(other);
assert(authority.claimFieldContact(other, 'a', 'c'));
console.log('PASS independent fleets share live contact authority and unordered pair claims');
