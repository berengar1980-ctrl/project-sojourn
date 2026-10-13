'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { pilotExchangeShip } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-exchange-pilot.ts'
);
const { snapshot } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-geometry.ts'
);
function ship(x, velocity) {
  return {
    position: { x, y: 500 },
    velocity: { ...velocity },
    headingRadians: 0,
    speed: Math.hypot(velocity.x, velocity.y),
    tactic: 'fight',
    setup: {
      id: 'test',
      name: 'test',
      shipId: 'patrol',
      combatSpeed: 120,
      accelerationMetersPerSecond2: 40,
      turnRateRadiansPerSecond: 1.2,
    },
    subsystems: { engine: 100, tractor: 100, maximum: 100 },
    shieldHp: 100,
    shieldMaxHp: 100,
    hullHp: 100,
    hullMaxHp: 100,
    fireControl: { max: 1, charges: 1, lastShotAt: 0, nextRechargeAt: 0 },
    mineStock: [],
    strategy: null,
    nextStrategyReviewAt: 0,
    cooldowns: [],
    shieldImpacts: [],
  };
}
const arena = { width: 3000, height: 2000, obstacles: [] };
const plan = {
  initiatorGoal: { x: 650, y: 500 },
  reactorGoal: { x: 650, y: 500 },
  initiatorHeading: 0,
  reactorHeading: 0,
};
const braking = ship(600, { x: 130, y: 65 });
pilotExchangeShip(braking, 'initiator', plan, arena, 0.08);
assert(braking.longitudinalThrust < 0, 'front RCS demand during braking');
assert(braking.lateralThrust < 0, 'lateral RCS opposes positive lateral velocity');
const view = snapshot(braking);
assert.equal(view.longitudinalThrust, braking.longitudinalThrust);
assert.equal(view.lateralThrust, braking.lateralThrust);
const target = ship(750, { x: 60, y: 0 });
const matching = ship(600, { x: 0, y: 0 });
const unmatching = ship(600, { x: 0, y: 0 });
pilotExchangeShip(matching, 'initiator', plan, arena, 0.08, target);
pilotExchangeShip(unmatching, 'initiator', plan, arena, 0.08);
assert(
  matching.velocity.x >= unmatching.velocity.x,
  'nearby target motion influences desired closing velocity without teleporting'
);
console.log('PASS front and lateral RCS braking demand and enemy velocity matching');
