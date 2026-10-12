'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { applyActionRamImpact } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-exchange-collision.ts'
);

const makeShip = (x, heading, velocity) => ({
  position: { x, y: 400 },
  velocity: { x: velocity, y: 0 },
  headingRadians: heading,
  speed: Math.abs(velocity),
  shieldHp: 100,
  hullHp: 100,
});
function impact(aHeading, bHeading) {
  const attacker = makeShip(200, aHeading, 80);
  const defender = makeShip(260, bHeading, -80);
  const runtime = { attacker, defender, elapsedSeconds: 2, combatLog: [] };
  applyActionRamImpact(runtime);
  return [100 - attacker.shieldHp, 100 - defender.shieldHp];
}
const headOn = impact(0, Math.PI);
assert(Math.abs(headOn[0] - headOn[1]) < 0.001, 'nose-to-nose deals equal damage');
const flank = impact(0, Math.PI / 2);
assert(flank[1] > flank[0], 'ramming broadside takes more damage than armored nose');
console.log('PASS directional ram impact: nose-to-nose and nose-to-flank');
