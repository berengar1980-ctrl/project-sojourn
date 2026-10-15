'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { activateCombatBoost, stopCombatBoost, updateCombatBoost } =
  loadStandaloneTypeScriptModule(
    path.resolve(__dirname, '../..'),
    'src/systems/combat/combat-boost-control.ts'
  );

const ship = {
  subsystems: { engine: 100 },
  boostSeconds: 3.5,
  boostActive: false,
};
assert.equal(activateCombatBoost(ship), true);
updateCombatBoost(ship, 1);
assert.equal(ship.boostSeconds, 2.5);
assert.equal(ship.boostActive, true);
stopCombatBoost(ship);
assert.equal(ship.boostActive, false);
updateCombatBoost(ship, 14);
assert(Math.abs(ship.boostSeconds - 3.5) < 0.0001);
ship.boostSeconds = 0.4;
updateCombatBoost(ship, 1);
const firstGain = ship.boostSeconds - 0.4;
ship.boostSeconds = 1.5;
updateCombatBoost(ship, 1);
const middleGain = ship.boostSeconds - 1.5;
ship.boostSeconds = 2.7;
updateCombatBoost(ship, 1);
const lastGain = ship.boostSeconds - 2.7;
assert(firstGain < middleGain && middleGain < lastGain);
ship.boostSeconds = 0;
stopCombatBoost(ship);
updateCombatBoost(ship, 14);
assert(Math.abs(ship.boostSeconds - 3.5) < 0.0001);
ship.subsystems.engine = 0;
assert.equal(activateCombatBoost(ship), false, 'destroyed engine cannot activate boost');
console.log('PASS boost capacity, cooldown and physical disablement survive AI refactor');
