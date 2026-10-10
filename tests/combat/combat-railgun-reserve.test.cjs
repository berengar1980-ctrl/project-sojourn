'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { shouldReserveRailgun } = loadStandaloneTypeScriptModule(root, 'src/systems/combat/strategic-combat-weapons.ts');

const shorterWeapon = { weapon: { mount: 'turret', rangeMeters: 500 } };
const source = {
  position: { x: 0, y: 0 },
  velocity: { x: 0, y: 0 },
  tactic: 'fight',
  setup: { weapons: [shorterWeapon] },
};
const target = {
  position: { x: 350, y: 0 },
  velocity: { x: 70, y: 0 },
  shieldHp: 0,
  tactic: 'flee',
};
assert.equal(shouldReserveRailgun(source, target, 1200), true, 'save shot when target is escaping inside turret range');
assert.equal(shouldReserveRailgun(source, { ...target, shieldHp: 10 }, 1200), false, 'shields do not trigger reserve');
assert.equal(shouldReserveRailgun(source, { ...target, tactic: 'fight' }, 1200), false, 'engaged opponent is not escaping');
assert.equal(shouldReserveRailgun(source, { ...target, velocity: { x: -20, y: 0 } }, 1200), false, 'approaching target does not trigger reserve');
assert.equal(shouldReserveRailgun(source, { ...target, position: { x: 600, y: 0 } }, 1200), false, 'fire when short-range weapons are out of range');
assert.equal(shouldReserveRailgun({ ...source, tactic: 'flee' }, target, 1200), false, 'fleeing shooter does not save the shot');
console.log('PASS railgun tactical reserve conditions');
