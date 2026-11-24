'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (name) => loadStandaloneTypeScriptModule(root, name);
const { addDestroyedShipWreck } = load('src/systems/salvage/combat-destruction-wreck.ts');
const { combatWreckVariantFor } = load('src/core/combat-wreck-variant.ts');
const { salvageFieldCombatArena } = load('src/systems/combat/field-combat-arena.ts');

const emptyField = () => ({
  id: 'field-test',
  sourceLocationId: 'field-test',
  seed: 450,
  width: 1800,
  height: 1400,
  wrecks: [],
});
for (let i = 0; i < 3; i++) {
  const field = emptyField();
  const ship = { id: 'pirate-ship-' + i, position: { x: 650, y: 700 }, hullHp: 0 };
  const sequence = [i / 3 + 0.001, 0.47, 0.12, 0.6, 0.4, 0.3, 0.9];
  const random = () => sequence.shift() ?? 0.5;
  const wreck = addDestroyedShipWreck(field, ship, 'battle-1', 19 + i, random);
  assert(wreck, 'destroyed ships must leave an object');
  assert.equal(wreck.combatWreckVariant, combatWreckVariantFor(field.seed, ship.id, 19 + i));
  assert(
    wreck.resources.some((deposit) => deposit.remainingAmount > 0),
    'wreck must contain recoverable salvage'
  );
  assert.equal(field.wrecks.length, 1);
  assert.equal(
    addDestroyedShipWreck(field, ship, 'battle-1', 19 + i, () => 0.5),
    wreck,
    'combat completion must be idempotent'
  );
  assert.equal(field.wrecks.length, 1, 'one ship cannot produce two wrecks');
  assert.equal(wreck.position.x, ship.position.x);
  assert.equal(wreck.position.y, ship.position.y);
  const visual = salvageFieldCombatArena(field).asteroids.find((body) => body.id === wreck.id);
  assert(
    visual && visual.combatWreckVariant === wreck.combatWreckVariant,
    'wreck remains physical on re-entering combat'
  );
}
const intact = emptyField();
assert.equal(
  addDestroyedShipWreck(
    intact,
    { id: 'survivor', position: { x: 100, y: 100 }, hullHp: 10 },
    'battle-1',
    12
  ),
  null
);
assert.equal(intact.wrecks.length, 0);
assert.equal(
  new Set(Array.from({ length: 60 }, (_, i) => combatWreckVariantFor(450, 'ship-' + i, 12))).size,
  5,
  'all five destroyed-ship variants must be selectable'
);
console.log('PASS destroyed ship creates one random recoverable physical wreck');
