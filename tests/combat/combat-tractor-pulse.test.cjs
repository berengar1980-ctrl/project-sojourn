'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { pulseCombatTractor } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-tractor-pulse.ts'
);
const mkShip = (range) => ({
  position: { x: 500, y: 500 },
  velocity: { x: 0, y: 0 },
  speed: 0,
  hullHp: 100,
  tactic: 'fight',
  setup: { name: 'Tester', tractorRangeMeters: range },
  subsystems: { tractor: range > 0 ? 100 : 0 },
});
const ship = mkShip(600);
const enemy = mkShip(0);
enemy.position.x = 750;
enemy.velocity.x = 100;
const runtime = { elapsedSeconds: 2, combatLog: [], beams: [], beamSerial: 0, lastEvent: '' };
pulseCombatTractor(runtime, 'attacker', ship, enemy, 0.08);
assert(enemy.velocity.x < 100, 'installed tractor slows a separating enemy');
assert(runtime.combatLog.some((event) => event.detail.includes('TRAKTORIMPULS')));
assert.equal(runtime.beams.length, 1, 'tractor use creates a visible pulse');
assert.equal(runtime.beams[0].kind, 'tractor');
const once = enemy.velocity.x;
pulseCombatTractor(runtime, 'attacker', ship, enemy, 0.08);
assert.equal(enemy.velocity.x, once, 'tractor pulse obeys cooldown');
assert.equal(runtime.beams.length, 1, 'cooldown prevents duplicate visual pulses');
ship.setup.tractorRangeMeters = 0;
ship.tractorPulseCooldown = 0;
pulseCombatTractor(runtime, 'attacker', ship, enemy, 0.08);
assert.equal(enemy.velocity.x, once, 'ships without tractor cannot fire pulse');
console.log('PASS tractor pulse range, equipment and cooldown');
