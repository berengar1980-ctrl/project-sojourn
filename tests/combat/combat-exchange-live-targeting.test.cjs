'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { pilotExchangeShip } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-exchange-pilot.ts'
);
function ship(x, y) {
  return {
    position: { x, y },
    velocity: { x: 0, y: 0 },
    headingRadians: 0,
    speed: 0,
    tactic: 'fight',
    setup: { combatSpeed: 120, accelerationMetersPerSecond2: 30, turnRateRadiansPerSecond: 1.5 },
    subsystems: { engine: 100 },
  };
}
const reactor = ship(500, 500);
const opponent = ship(900, 500);
const arena = { width: 2400, height: 1600, obstacles: [] };
const plan = {
  initiatorGoal: { x: 900, y: 500 },
  reactorGoal: { x: 500, y: 100 },
  initiatorHeading: 0,
  reactorHeading: Math.PI,
};
pilotExchangeShip(reactor, 'reactor', plan, arena, 0.08, opponent, false, true);
assert(
  Math.abs(reactor.headingRadians) < 0.001,
  'turn-to-face holds bearing toward enemy, not stale plan or waypoint'
);
opponent.position.x = 500;
opponent.position.y = 900;
pilotExchangeShip(reactor, 'reactor', plan, arena, 0.08, opponent, false, true);
assert(reactor.headingRadians > 0, 'turn-to-face follows moving opponent during the same exchange');
assert(
  reactor.headingRadians <= 1.5 * 0.08 + 0.001,
  'tracking respects physical maximum turn rate'
);
console.log('PASS turn-to-face continuously tracks moving opponent');
