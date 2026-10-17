'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { applyCombatRamImpact } = loadStandaloneTypeScriptModule(
  path.resolve(__dirname, '../..'),
  'src/systems/combat/combat-ram-impact.ts'
);

function vessel(x, headingRadians) {
  return {
    position: { x, y: 500 },
    velocity: { x: 0, y: 0 },
    speed: 0,
    headingRadians,
    shieldHp: 100,
    hullHp: 100,
    subsystems: { engine: 100 },
  };
}

function ram(closing) {
  const attacker = vessel(500, 0);
  const defender = vessel(546, Math.PI);
  attacker.velocity.x = closing / 2;
  defender.velocity.x = -closing / 2;
  const runtime = {
    attacker,
    defender,
    elapsedSeconds: 1,
    combatLog: [],
  };
  const damage = applyCombatRamImpact(runtime);
  assert.equal(applyCombatRamImpact(runtime), 0, 'same contact cannot deal damage every frame');
  assert(runtime.combatLog.some((event) => event.event === 'impact'));
  return damage;
}
assert(ram(12) < 1, 'slow contact must barely damage shields');
assert(ram(140) > ram(12) * 10, 'fast collision must remain more destructive');
console.log('PASS canonical ram damage scales physically and is protected from repeated hits');
