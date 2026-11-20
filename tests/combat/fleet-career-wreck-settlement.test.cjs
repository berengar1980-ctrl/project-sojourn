'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);

const { generateMiningSpace } = load('src/systems/local-space/local-space-generator.ts');
const { createFleetCareerWreckSettlement } = load(
  'src/systems/combat/fleet-career-wreck-settlement.ts'
);
const { miningFieldCombatArena } = load('src/systems/combat/field-combat-arena.ts');

const field = {
  locationId: 'fleet-wreck-field',
  instance: generateMiningSpace('fleet-wreck-field', 112),
  combatWrecks: [],
};
const registered = [];
const recorder = createFleetCareerWreckSettlement(
  field,
  new Set(['pirate-a', 'pirate-b', 'miner']),
  (wrecks) => {
    for (const wreck of wrecks) {
      registered.push(wreck);
      field.combatWrecks.push(wreck);
    }
  },
  'battle-21'
);
const ship = (id, hullHp, x, y) => ({
  factionId: 'pirate-a',
  targetId: null,
  ship: { id, hullHp, position: { x, y } },
});
const first = [
  ship('pirate-a', 0, 230, 400),
  ship('pirate-b', 0, 480, 450),
  ship('miner', 60, 600, 700),
  ship('player', 0, 800, 900),
];
const created = recorder.settle(first, 4.8);
assert.equal(created.length, 2, 'two independently destroyed career NPCs create two wrecks');
assert.equal(registered.length, 2, 'existing career field store is the only registration target');
assert.equal(new Set(created.map((wreck) => wreck.id)).size, 2);
assert(created.every((wreck) => wreck.combatWreckVariant));
assert.deepEqual(
  created.map((wreck) => wreck.position),
  [first[0].ship.position, first[1].ship.position],
  'both ships leave salvage where they were destroyed'
);
assert.equal(recorder.settle(first, 5).length, 0, 'the same death is not registered twice');
assert.equal(registered.length, 2);
const later = recorder.settle(
  [ship('pirate-a', 0, 230, 400), ship('pirate-b', 0, 480, 450), ship('miner', 0, 620, 710)],
  7.2
);
assert.equal(later.length, 1, 'another victim can be destroyed in a later tick');
assert.equal(field.combatWrecks.length, 3);
assert.equal(recorder.settle([], 8).length, 0);
assert.equal(recorder.settle([ship('miner', 0, 620, 710)], 8).length, 0);
const arena = miningFieldCombatArena(field.instance, { x: 0, y: 0 }, field.combatWrecks);
for (const wreck of registered) {
  const collider = arena.asteroids.find((body) => body.id === wreck.id);
  assert(collider && collider.combatWreckVariant === wreck.combatWreckVariant);
}
assert.equal(
  registered.some((wreck) => wreck.id.includes('player')),
  false,
  'player hull never produces an NPC wreck through the career NPC adapter'
);
console.log(
  'PASS FC-37: one recoverable career wreck per destroyed fleet ship, reused salvage factory'
);
