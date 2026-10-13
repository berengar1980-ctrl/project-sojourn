'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const geometry = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-geometry.ts'
);
const damage = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-damage.ts'
);
const movement = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-movement.ts'
);
const winner = loadStandaloneTypeScriptModule(root, 'src/systems/combat/combat-runtime-winner.ts');
const arena = {
  width: 1900,
  height: 1200,
  attackerPosition: { x: 500, y: 600 },
  defenderPosition: { x: 1100, y: 600 },
  exitPoint: { x: 1800, y: 600 },
};
function ship(id, side) {
  return geometry.createCombatant(
    {
      id,
      name: id,
      shipId: 'patrol-test',
      shieldHp: 0,
      hullHp: 100,
      weapons: [],
      hitChance: 1,
      dodgeChance: 0,
      damageMultiplier: 1,
      criticalChance: 0,
      cycleTimeMultiplier: 1,
      combatSpeed: 100,
      accelerationMetersPerSecond2: 30,
      turnRateRadiansPerSecond: 1,
      tractorRangeMeters: 500,
    },
    side,
    arena
  );
}
const attacker = ship('hunter', 'attacker');
const target = ship('runner', 'defender');
target.tactic = 'flee';
target.shieldHp = 0;
const engineHit = damage.applyDamage(
  target,
  0,
  1000,
  attacker,
  false,
  attacker.position,
  'laser',
  1,
  undefined,
  'engine'
);
assert.equal(engineHit.layer, 'hull');
assert.equal(target.subsystems.engine, 0);
assert.equal(target.hullHp, 100, 'engine damage must not leak to hull');
target.velocity = { x: 8, y: 0 };
const before = { ...target.position };
movement.moveCombatant(target, attacker, 'defender', 0.08, arena, []);
assert.notDeepEqual(target.position, before, 'wrecked engine retains inertia');
damage.applyDamage(
  target,
  0,
  1000,
  attacker,
  false,
  attacker.position,
  'laser',
  2,
  undefined,
  'tractor'
);
assert.equal(target.subsystems.tractor, 0);
assert.equal(target.hullHp, 100, 'tractor damage must not leak to hull');
const combat = { attacker, defender: target, winner: null, lastEvent: '', arena };
winner.resolveRuntimeWinner(combat);
assert.equal(combat.winner, null, 'disabled subsystems alone do not cause defeat');
damage.applyDamage(target, 0, 1000, attacker, false, attacker.position, 'laser', 3);
assert.equal(target.hullHp, 0);
winner.resolveRuntimeWinner(combat);
assert.equal(combat.winner, 'attacker', 'hull defeat still works after subsystem failures');
console.log('PASS concurrent engine/tractor subsystem loss, inertia, and hull-only defeat');
