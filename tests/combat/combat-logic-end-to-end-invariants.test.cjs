'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  path.resolve(__dirname, '../..'),
  'src/systems/combat/strategic-combat-service.ts'
);
const setup = (id) => ({
  id, name: id, shipId: 'patrol', shieldHp: 100, hullHp: 200,
  weapons: [], mines: [], hitChance: 0.7, dodgeChance: 0.1,
  damageMultiplier: 1, criticalChance: 0, cycleTimeMultiplier: 1,
  preferredTactic: 'fight', aiControlled: true, combatSpeed: 100,
  turnRateRadiansPerSecond: 0.7, accelerationMetersPerSecond2: 25,
});
function trace(seed) {
  const arena = {
    width: 2300, height: 1500,
    attackerPosition: { x: 550, y: 750 }, defenderPosition: { x: 1550, y: 750 },
    obstacles: [],
  };
  const combat = createStrategicCombatService(setup('alpha'), setup('beta'), seed, arena);
  const frames = [];
  for (let i = 0; i < 60; i += 1) {
    const snapshot = combat.tick(0.08);
    for (const ship of [snapshot.attacker, snapshot.defender]) {
      assert(Number.isFinite(ship.position.x) && Number.isFinite(ship.position.y),
        'combat physics must not produce NaN/Infinity');
      assert(ship.position.x >= 0 && ship.position.x <= arena.width);
      assert(ship.position.y >= 0 && ship.position.y <= arena.height);
      assert(ship.shieldHp >= 0 && ship.shieldHp <= ship.shieldMaxHp);
      assert(ship.hullHp >= 0 && ship.hullHp <= ship.hullMaxHp);
    }
    assert.equal(snapshot.winner, null, 'unarmed opponents cannot spontaneously destroy each other at range');
    frames.push([
      snapshot.attacker.position.x, snapshot.attacker.position.y,
      snapshot.defender.position.x, snapshot.defender.position.y,
      snapshot.attacker.shieldHp, snapshot.defender.shieldHp,
      snapshot.lastEvent,
    ]);
  }
  return frames;
}
assert.deepEqual(trace(1002), trace(1002), 'same seed and identical start state replay identically');
assert.deepEqual(trace(1001), trace(1001), 'Alpha exchange follows deterministic replay');
console.log('PASS multi-frame combat finite bounds and deterministic seed replay');
