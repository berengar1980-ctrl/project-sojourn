'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createParallelNativeDuels } = load('src/systems/combat/parallel-native-duels.ts');

function entry(id, team) {
  return {
    id,
    team,
    setup: {
      id,
      name: id,
      shipId: 'patrol-60m',
      shieldHp: 3000,
      hullHp: 3000,
      weapons: [],
      hitChance: 0.7,
      dodgeChance: 0.1,
      damageMultiplier: 1,
      criticalChance: 0,
      cycleTimeMultiplier: 1,
      combatSpeed: 100,
      preferredTactic: 'fight',
    },
  };
}
const asteroid = {
  id: 'shared-rock',
  kind: 'resource',
  position: { x: 3800, y: 3600 },
  velocity: { x: 12, y: 0 },
  rotation: 0,
  angularVelocity: 0,
  radius: 22,
};
const arena = {
  width: 7600,
  height: 5600,
  obstacles: [{ id: 'shared-rock', position: asteroid.position, radius: 22 }],
  asteroids: [asteroid],
};
const original = [entry('a-1', 'a'), entry('a-2', 'a'), entry('b-1', 'b'), entry('b-2', 'b')];
const world = createParallelNativeDuels(original, arena, 212);
assert.equal(world.duels.length, 2);
let view = world.getSnapshot();
assert.equal(view.duels.length, 2);
assert.deepEqual(
  view.duels.map((duel) => [duel.attacker.id, duel.defender.id]),
  [['a-1', 'b-1'], ['a-2', 'b-2']]
);
assert.equal(view.elapsedSeconds, 0);
assert.strictEqual(view.duels[0].arena.asteroids, arena.asteroids);
assert.strictEqual(view.duels[1].arena.asteroids, arena.asteroids);
assert.equal(new Set(view.duels.flatMap((duel) => [duel.attacker.id, duel.defender.id])).size, 4);

let bystanders = [];
const originalBystanders = world.duels[0].setBystanders;
world.duels[0].setBystanders = (ships) => {
  bystanders = ships;
  originalBystanders(ships);
};
const initialRockX = asteroid.position.x;
world.tick(0.08);
view = world.getSnapshot();
assert.equal(view.duels[0].elapsedSeconds, 0.08);
assert.equal(view.duels[1].elapsedSeconds, 0.08);
assert.equal(bystanders.length, 2, 'other duel ships must be native collision bystanders');
assert.deepEqual(bystanders.map((s) => s.id).sort(), ['a-2', 'b-2']);
assert.equal(view.duels[0].arena.obstacles.filter((s) => s.id.startsWith('ship:')).length, 2);
assert(
  Math.abs(asteroid.position.x - initialRockX - 12 * 0.08) < 0.15,
  'asteroid may advance only once, not once for each duel'
);
for (let i = 0; i < 35; i++) world.tick(0.08);
view = world.getSnapshot();
assert.equal(view.duels[0].elapsedSeconds, view.duels[1].elapsedSeconds);
for (const duel of view.duels) {
  for (const ship of [duel.attacker, duel.defender]) {
    assert(Number.isFinite(ship.position.x));
    assert(Number.isFinite(ship.position.y));
  }
}
assert.throws(
  () => createParallelNativeDuels(original.slice(0, 3), arena),
  /exactly 2 vs 2/
);
console.log('PASS: two original 1vs1 services, shared asteroids once, other ships in collision/flight routes');
