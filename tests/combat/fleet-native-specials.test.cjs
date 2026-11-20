'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createFleetNativeSpecials } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/fleet-native-specials.ts'
);
const { createCombatant } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-geometry.ts'
);
const arena = () => ({ width: 3000, height: 2000, asteroids: [], obstacles: [] });
function ship(id, x, shield = 100) {
  const setup = {
    id,
    name: id,
    shipId: 'test-ship',
    shieldHp: shield,
    hullHp: 300,
    weapons: [],
    hitChance: 1,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    preferredTactic: 'fight',
  };
  const actor = createCombatant(setup, 'attacker', {
    ...arena(),
    attackerPosition: { x, y: 500 },
    attackerHeadingRadians: 0,
  });
  actor.cooldowns.fill(0);
  return actor;
}
const first = ship('rammer', 500);
const second = ship('ram-target', 546);
first.velocity.x = 90;
second.velocity.x = -90;
const impact = createFleetNativeSpecials(arena());
const ramHits = impact.ram(first, second, 1);
assert.equal(ramHits.length, 2, 'both hulls receive native kinetic damage');
assert(ramHits.every((hit) => hit.shieldDamage > 0));
assert.equal(impact.ram(first, second, 1.08).length, 0, 'native impact cooldown');
assert.equal(first.shieldHp < 100 && second.shieldHp < 100, true);

// Native mine placement, arming and damage; no parallel mine or damage implementation.
const mineSource = ship('mine-source', 200);
const mineVictim = ship('mine-victim', 440);
mineSource.mineStock.push({
  id: 'fleet-ion',
  name: 'Ion Mine',
  kind: 'ion',
  tier: 1,
  pursuitSeconds: 0,
  pursuitSpeedMetersPerSecond: 0,
  triggerRadiusMeters: 120,
  shieldDamage: 25,
  hullDamage: 20,
});
mineVictim.velocity.x = -25;
const minePhysics = createFleetNativeSpecials(arena());
const mineActors = [mineSource, mineVictim];
const mineTarget = (actor) => (actor === mineSource ? mineVictim : null);
minePhysics.tick(0.08, 0.08, mineActors, mineTarget);
assert.equal(mineSource.mineStock.length, 0, 'native mine consumes actual inventory');
assert.equal(minePhysics.mines().length, 1, 'mine laid into authoritative encounter');
assert.equal(minePhysics.mines()[0].armed, false);
mineVictim.position.x = 260;
const mineDamage = [];
for (let i = 1; i < 15; i++) {
  mineDamage.push(...minePhysics.tick(0.08, 0.08 * (i + 1), mineActors, mineTarget));
}
assert(
  mineDamage.some(
    (entry) =>
      entry.sourceId === 'mine-source' && entry.targetId === 'mine-victim' && entry.shieldDamage > 0
  ),
  'mine credits actual detonation'
);
assert.equal(minePhysics.mines().length, 0, 'detonated mine removed');

// Native tractor rock: real shield restriction, capture/charge/flight, rock removal.
const throwArena = arena();
throwArena.asteroids.push({
  id: 'real-asteroid',
  kind: 'debris',
  radius: 12,
  position: { x: 250, y: 500 },
  velocity: { x: 0, y: 0 },
  angularVelocity: 0,
  rotation: 0,
});
const thrower = ship('thrower', 200, 0);
thrower.setup.tractorCanManipulateObjects = true;
thrower.setup.tractorRangeMeters = 500;
thrower.subsystems.tractor = 100;
const throwTarget = ship('throw-target', 650, 120);
const throwPhysics = createFleetNativeSpecials(throwArena);
const thrownActors = [thrower, throwTarget];
const getTarget = (actor) => (actor === thrower ? throwTarget : null);
throwPhysics.tick(0.08, 0.08, thrownActors, getTarget);
assert.equal(throwPhysics.throws().length, 1);
assert.equal(throwArena.asteroids.length, 0, 'native capture removes original collider');
assert.equal(throwPhysics.throws()[0].phase, 'capture');
const throwHits = [];
for (let i = 1; i < 50; i++) {
  throwHits.push(...throwPhysics.tick(0.08, (i + 1) * 0.08, thrownActors, getTarget));
}
assert(
  throwHits.some(
    (hit) => hit.sourceId === 'thrower' && hit.targetId === 'throw-target' && hit.shieldDamage > 0
  ),
  'physical tractor impact credited'
);
console.log('PASS fleet native ram, mine and tractor physics using protected campaign functions');
