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

// FC-41: two armed mines detonate in the SAME physics interval. The native
// duel runtime exposes only lastImpact, so FleetCombat must retain BOTH
// contribution records rather than crediting only the final explosion.
const twoMineA = ship('mine-a', 300);
const twoMineB = ship('mine-b', 580);
for (const [actor, id] of [
  [twoMineA, 'a'],
  [twoMineB, 'b'],
]) {
  actor.tactic = 'minefield';
  actor.mineStock.push({
    id: 'ion-' + id,
    name: 'Ion ' + id,
    kind: 'ion',
    tier: 1,
    pursuitSeconds: 0,
    pursuitSpeedMetersPerSecond: 0,
    triggerRadiusMeters: 120,
    shieldDamage: 25,
    hullDamage: 20,
  });
}
twoMineA.velocity.x = 25;
twoMineB.velocity.x = -25;
const dualMines = createFleetNativeSpecials(arena());
dualMines.tick(0.08, 0.08, [twoMineA, twoMineB], (actor) =>
  actor === twoMineA ? twoMineB : twoMineA
);
assert.equal(dualMines.mines().length, 2, 'both opponents deploy real mines');
twoMineA.position.x = 580;
twoMineB.position.x = 300;
const simultaneousHits = [];
for (let index = 1; index <= 11; index++) {
  simultaneousHits.push(
    ...dualMines.tick(0.08, (index + 1) * 0.08, [twoMineA, twoMineB], () => null)
  );
}
assert.equal(dualMines.mines().length, 0, 'both armed mines detonated');
assert.deepEqual(
  new Set(simultaneousHits.map((hit) => hit.sourceId + ':' + hit.targetId)),
  new Set(['mine-a:mine-b', 'mine-b:mine-a']),
  'each simultaneous mine hit retains its own attacker/target contribution'
);

// FC-42: a mine keeps its ORIGINAL victim when the owner switches to a third
// ship. It must also finish arming/detonating after its owner leaves the field.
const switchingSource = ship('switching-miner', 200);
const originalVictim = ship('original-victim', 440);
const interveningPirate = ship('intervening-pirate', 900);
switchingSource.mineStock.push({
  id: 'switch-mine',
  name: 'Switch mine',
  kind: 'ion',
  tier: 1,
  pursuitSeconds: 0,
  pursuitSpeedMetersPerSecond: 0,
  triggerRadiusMeters: 120,
  shieldDamage: 25,
  hullDamage: 20,
});
originalVictim.velocity.x = -25;
const switchingSpecials = createFleetNativeSpecials(arena());
switchingSpecials.tick(0.08, 0.08, [switchingSource, originalVictim, interveningPirate], (actor) =>
  actor === switchingSource ? originalVictim : null
);
assert.equal(switchingSpecials.mines().length, 1, 'original mine has been deployed');
originalVictim.position.x = 260;
switchingSpecials.tick(0.08, 0.16, [switchingSource, originalVictim, interveningPirate], (actor) =>
  actor === switchingSource ? interveningPirate : null
);
assert.equal(switchingSpecials.mines()[0].ownerId, 'switching-miner');
const retainedMineHits = [];
for (let index = 2; index < 15; index++) {
  // The mine owner has exited, and the third participant is still present.
  retainedMineHits.push(
    ...switchingSpecials.tick(
      0.08,
      (index + 1) * 0.08,
      [originalVictim, interveningPirate],
      () => null
    )
  );
}
assert(
  retainedMineHits.some(
    (hit) => hit.sourceId === 'switching-miner' && hit.targetId === 'original-victim'
  ),
  'departed owner retains attribution and the original mine still detonates'
);
assert.equal(interveningPirate.shieldHp, 100, 'third-party ship is not a retargeted victim');

// If the original mine victim leaves, the old target-locked mine must not
// freeze indefinitely and later hit a ghost or a newly arriving ship.
const abandonedSource = ship('abandoned-source', 200);
const abandonedVictim = ship('abandoned-victim', 440);
abandonedVictim.velocity.x = -25;
abandonedSource.mineStock.push({
  id: 'abandoned-mine',
  name: 'Abandoned mine',
  kind: 'ion',
  tier: 1,
  pursuitSeconds: 0,
  pursuitSpeedMetersPerSecond: 0,
  triggerRadiusMeters: 120,
  shieldDamage: 25,
  hullDamage: 20,
});
const abandonedPhysics = createFleetNativeSpecials(arena());
abandonedPhysics.tick(0.08, 0.08, [abandonedSource, abandonedVictim], (actor) =>
  actor === abandonedSource ? abandonedVictim : null
);
assert.equal(abandonedPhysics.mines().length, 1);
abandonedPhysics.tick(0.08, 0.16, [abandonedSource], () => null);
assert.equal(abandonedPhysics.mines().length, 0, 'departed target cannot retain ghost mine');
assert.equal(
  abandonedPhysics.tick(0.08, 0.24, [abandonedSource, abandonedVictim], () => null).length,
  0,
  'a returning ship cannot be hit by a removed mine'
);

// A launched native tractor rock must keep moving and striking the original
// victim even if the thrower changes targets and subsequently departs.
const switchingArena = arena();
switchingArena.asteroids.push({
  id: 'switching-rock',
  kind: 'debris',
  radius: 12,
  position: { x: 250, y: 500 },
  velocity: { x: 0, y: 0 },
  angularVelocity: 0,
  rotation: 0,
});
const rockThrower = ship('rock-thrower', 200, 0);
rockThrower.setup.tractorCanManipulateObjects = true;
rockThrower.setup.tractorRangeMeters = 500;
rockThrower.subsystems.tractor = 100;
const rockVictim = ship('rock-victim', 650, 120);
const rockIntruder = ship('rock-intruder', 1000);
const switchingRocks = createFleetNativeSpecials(switchingArena);
switchingRocks.tick(0.08, 0.08, [rockThrower, rockVictim, rockIntruder], (actor) =>
  actor === rockThrower ? rockVictim : null
);
assert.equal(switchingRocks.throws().length, 1);
switchingRocks.tick(0.08, 0.16, [rockThrower, rockVictim, rockIntruder], (actor) =>
  actor === rockThrower ? rockIntruder : null
);
const rockSwitchHits = [];
for (let index = 2; index < 51; index++) {
  rockSwitchHits.push(
    ...switchingRocks.tick(0.08, (index + 1) * 0.08, [rockVictim, rockIntruder], () => null)
  );
}
assert(
  rockSwitchHits.some((hit) => hit.sourceId === 'rock-thrower' && hit.targetId === 'rock-victim'),
  'a thrown rock keeps its original trajectory and damage source after withdrawal'
);
assert.equal(rockIntruder.shieldHp, 100, 'late-joining enemy does not steal prior projectile');

// FC-43: thrown rocks hit the FIRST intervening ship, including friendly or
// neutral ships, and do not pass through to their originally designated enemy.
const collateralArena = arena();
collateralArena.asteroids.push({
  id: 'collateral-rock',
  kind: 'debris',
  radius: 12,
  position: { x: 250, y: 500 },
  velocity: { x: 0, y: 0 },
  angularVelocity: 0,
  rotation: 0,
});
const collateralThrower = ship('collateral-thrower', 200, 0);
collateralThrower.setup.tractorCanManipulateObjects = true;
collateralThrower.setup.tractorRangeMeters = 500;
collateralThrower.subsystems.tractor = 100;
const collateralEnemy = ship('collateral-enemy', 650, 120);
const collateralCivilian = ship('collateral-civilian', 460, 120);
const collateralPhysics = createFleetNativeSpecials(collateralArena);
collateralPhysics.tick(0.08, 0.08, [collateralThrower, collateralEnemy], (actor) =>
  actor === collateralThrower ? collateralEnemy : null
);
assert.equal(collateralPhysics.throws().length, 1);
const collateralHits = [];
for (let tick = 1; tick < 51; tick++) {
  collateralHits.push(
    ...collateralPhysics.tick(
      0.08,
      (tick + 1) * 0.08,
      [collateralThrower, collateralEnemy, collateralCivilian],
      () => null
    )
  );
}
assert(
  collateralHits.some(
    (hit) => hit.targetId === 'collateral-civilian' && hit.sourceId === 'collateral-thrower'
  ),
  'third-party ship takes actual native rock damage'
);
assert.equal(collateralEnemy.shieldHp, 120, 'rock must stop at first collision');
assert.equal(collateralPhysics.throws().length, 0, 'spent thrown rock is consumed');

// A physical asteroid obstacle blocks a thrown object before any ship.
const blockedRockArena = arena();
blockedRockArena.asteroids.push({
  id: 'blocked-rock',
  kind: 'debris',
  radius: 12,
  position: { x: 250, y: 500 },
  velocity: { x: 0, y: 0 },
  angularVelocity: 0,
  rotation: 0,
});
const blockedThrower = ship('blocked-thrower', 200, 0);
blockedThrower.setup.tractorCanManipulateObjects = true;
blockedThrower.setup.tractorRangeMeters = 500;
blockedThrower.subsystems.tractor = 100;
const blockedRockEnemy = ship('blocked-rock-enemy', 650, 120);
const blockedRockPhysics = createFleetNativeSpecials(blockedRockArena);
blockedRockPhysics.tick(0.08, 0.08, [blockedThrower, blockedRockEnemy], (actor) =>
  actor === blockedThrower ? blockedRockEnemy : null
);
blockedRockArena.obstacles.push({
  id: 'post-launch-cover',
  position: { x: 375, y: 500 },
  radius: 35,
});
for (let tick = 1; tick < 51; tick++)
  blockedRockPhysics.tick(0.08, (tick + 1) * 0.08, [blockedThrower, blockedRockEnemy], () => null);
assert.equal(blockedRockEnemy.shieldHp, 120, 'rock obstacle intercepts thrown asteroid');
assert.equal(blockedRockPhysics.throws().length, 0);
console.log(
  'PASS fleet native ram, simultaneous mines, persistent target locks and tractor physics and collateral using protected campaign functions'
);
