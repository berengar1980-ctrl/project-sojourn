'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { applyCombatRamImpact } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-ram-impact.ts'
);

const makeShip = (x, heading, velocity) => ({
  position: { x, y: 400 },
  velocity: { x: velocity, y: 0 },
  headingRadians: heading,
  speed: Math.abs(velocity),
  shieldHp: 100,
  hullHp: 100,
  subsystems: { engine: 100 },
});
function impact(aHeading, bHeading) {
  const attacker = makeShip(200, aHeading, 80);
  const defender = makeShip(240, bHeading, -80);
  const runtime = { attacker, defender, elapsedSeconds: 2, combatLog: [] };
  applyCombatRamImpact(runtime);
  return [100 - attacker.shieldHp, 100 - defender.shieldHp];
}
const headOn = impact(0, Math.PI);
assert(Math.abs(headOn[0] - headOn[1]) < 0.001, 'nose-to-nose deals equal damage');
const flank = impact(0, Math.PI / 2);
assert(flank[1] > flank[0], 'ramming broadside takes more damage than armored nose');
const rear = impact(0, 0);
assert(flank[1] > rear[1], 'side hit receives the additional 50% ram vulnerability');
assert(Math.abs(flank[1] / (rear[1] / 1.6) - 1.95) < 0.001);
function damageAtSpeed(closing) {
  const first = makeShip(200, 0, closing / 2);
  const second = makeShip(240, Math.PI, -closing / 2);
  first.shieldHp = 1000;
  second.shieldHp = 1000;
  applyCombatRamImpact({ attacker: first, defender: second, elapsedSeconds: 2, combatLog: [] });
  return 1000 - second.shieldHp;
}
assert(damageAtSpeed(240) > damageAtSpeed(180), 'boosted approach speed must increase damage');
assert(damageAtSpeed(180) > damageAtSpeed(120), 'damage grows across normal attack speeds');
const unshieldedAttacker = makeShip(200, 0, 180);
const unshieldedDefender = makeShip(240, 0, -180);
unshieldedDefender.shieldHp = 0;
applyCombatRamImpact({
  attacker: unshieldedAttacker,
  defender: unshieldedDefender,
  elapsedSeconds: 2,
  combatLog: [],
});
assert(unshieldedDefender.subsystems.engine < 100, 'unshielded stern impact damages engines');
console.log('PASS directional ram impact: prow, flank, stern and exposed engine');
