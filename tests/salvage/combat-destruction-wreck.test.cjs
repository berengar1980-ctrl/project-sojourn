'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { addDestroyedShipWreck } = load('src/systems/salvage/combat-destruction-wreck.ts');
const { salvageFieldCombatArena } = load('src/systems/combat/field-combat-arena.ts');

const variants = ['engine-room', 'cargo-bay', 'bridge'];
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
  const ship = { id: 'pirate-ship', position: { x: 650, y: 700 }, hullHp: 0 };
  const sequence = [i / 3 + 0.001, .47, .12, .6, .4, .3, .9];
  const random = () => sequence.shift() ?? .5;
  const wreck = addDestroyedShipWreck(field, ship, 'battle-1', random);
  assert(wreck, 'destroyed ships must leave an object');
  assert.equal(wreck.sectionVariant, variants[i], 'three distinct 3D wreck silhouettes');
  assert(wreck.resources.some((deposit) => deposit.remainingAmount > 0), 'wreck must contain recoverable salvage');
  assert.equal(field.wrecks.length, 1);
  assert.equal(addDestroyedShipWreck(field, ship, 'battle-1', () => .5), wreck, 'combat completion must be idempotent');
  assert.equal(field.wrecks.length, 1, 'one ship cannot produce two wrecks');
  assert.equal(wreck.position.x, ship.position.x);
  assert.equal(wreck.position.y, ship.position.y);
  const visual = salvageFieldCombatArena(field).asteroids.find((body) => body.id === wreck.id);
  assert(visual && visual.sectionVariant === wreck.sectionVariant, 'wreck remains physical on re-entering combat');
}
const intact = emptyField();
assert.equal(addDestroyedShipWreck(intact, { id: 'survivor', position: { x: 100, y: 100 }, hullHp: 10 }, 'battle-1'), null);
assert.equal(intact.wrecks.length, 0);
console.log('PASS destroyed ship creates one random recoverable physical wreck');
