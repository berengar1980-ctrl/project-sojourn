'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const pilot = fs.readFileSync(
  path.join(root, 'src/systems/combat/combat-exchange-pilot.ts'),
  'utf8'
);
const controller = fs.readFileSync(
  path.join(root, 'src/systems/combat/combat-exchange-controller.ts'),
  'utf8'
);
assert(
  pilot.includes("action === 'frontal_pass' ? 0 : separation"),
  'frontal approach avoids flanking offset'
);
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { useBoostForExchange } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-exchange-boost.ts'
);
assert(controller.includes('useBoostForExchange('), 'exchange invokes the boost owner');
function boostShip(velocity, headingRadians = 0) {
  return {
    position: { x: 0, y: 0 },
    velocity: { x: velocity, y: 0 },
    headingRadians,
    tactic: 'fight',
    boostSeconds: 3,
    boostActive: false,
    subsystems: { engine: 100 },
  };
}
const goal = { x: 800, y: 0 };
const reversed = boostShip(-25);
useBoostForExchange(reversed, goal, true, 800, 4);
assert.equal(reversed.boostActive, false, 'boost refuses reversed velocity');
const facingAway = boostShip(25, Math.PI);
useBoostForExchange(facingAway, goal, true, 800, 4);
assert.equal(facingAway.boostActive, false, 'boost requires forward orientation');
const aligned = boostShip(25);
useBoostForExchange(aligned, goal, true, 800, 4);
assert.equal(aligned.boostActive, true, 'aligned advancing ship may boost');
console.log('PASS frontal approach alignment guards');
