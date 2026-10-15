'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { planExchangeFlight, pilotExchangeShip } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-exchange-pilot.ts'
);
const arena = { width: 2600, height: 1700, obstacles: [] };

function ship(x, y) {
  return {
    position: { x, y },
    velocity: { x: 0, y: 0 },
    headingRadians: 0,
    speed: 0,
    tactic: 'fight',
    setup: {
      combatSpeed: 130,
      accelerationMetersPerSecond2: 34,
      turnRateRadiansPerSecond: 1,
    },
    subsystems: { engine: 100 },
  };
}

const actions = ['frontal_pass', 'broadside_pass', 'disengage_fire', 'flanking_pass'];
const positions = [];
for (const action of actions) {
  const initiator = ship(600, 760);
  const reactor = ship(1250, 760);
  const plan = planExchangeFlight(initiator, reactor, action, 'evade', 'strong');
  let peakSpeed = 0;
  for (let frame = 0; frame < 120; frame += 1) {
    pilotExchangeShip(
      initiator,
      'initiator',
      plan,
      arena,
      0.08,
      reactor,
      action === 'frontal_pass'
    );
    peakSpeed = Math.max(peakSpeed, initiator.speed);
  }
  const displacement = Math.hypot(initiator.position.x - 600, initiator.position.y - 760);
  assert(displacement > 80, action + ': choreography must move the ship');
  assert(peakSpeed > 25, action + ': ship must build physical speed');
  positions.push(
    [Math.round(initiator.position.x / 10), Math.round(initiator.position.y / 10)].join(':')
  );
}
assert.equal(new Set(positions).size, 4, 'choreographed maneuvers must remain distinct');
console.log('PASS four choreographed passages remain mobile and distinct');
