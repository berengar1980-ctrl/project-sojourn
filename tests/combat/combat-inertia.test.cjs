'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { getShipDefinition } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-registry.ts'
);
const { resolveShipCombatMovementStats } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-stats.ts'
);
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);

for (const id of ['patrol-60m-variant-01', 'salvage-75m-variant-01']) {
  const ship = getShipDefinition(id);
  if (!ship) continue;
  const stats = resolveShipCombatMovementStats(ship);
  assert(stats.combatSpeed > 0 && stats.accelerationMetersPerSecond2 > 0);
  assert(stats.turnRateRadiansPerSecond > 0);
  assert.deepEqual(resolveShipCombatMovementStats(ship), stats, 'performance must be deterministic');
}

function ship(id) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 100,
    hullHp: 100,
    weapons: [],
    hitChance: 1,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    preferredTactic: 'fight',
    combatSpeed: 140,
    turnRateRadiansPerSecond: 0.6,
    accelerationMetersPerSecond2: 30,
  };
}

const combat = createStrategicCombatService(ship('pilot'), ship('opponent'), 37, {
  width: 2600,
  height: 1400,
  attackerPosition: { x: 800, y: 700 },
  defenderPosition: { x: 1900, y: 700 },
  exitPoint: { x: 160, y: 700 },
});
let forward = combat.getSnapshot();
assert.deepEqual(forward.attacker.velocity, { x: 0, y: 0 });
for (let step = 0; step < 35; step += 1) forward = combat.tick(0.08);
assert(forward.attacker.velocity.x > 30, 'the ship needs real forward momentum');
assert(Math.abs(forward.attacker.speed - Math.hypot(
  forward.attacker.velocity.x, forward.attacker.velocity.y
)) < 1e-8, 'displayed speed must be the velocity magnitude');

const beforeTurn = forward.attacker;
combat.setTactic('attacker', 'flee');
const turning = combat.tick(0.08).attacker;
assert(
  turning.headingRadians !== beforeTurn.headingRadians,
  'the bow should begin turning towards the new flight direction'
);
assert(
  turning.velocity.x > 0 && turning.position.x > beforeTurn.position.x,
  'a turning ship must initially keep drifting in its original direction'
);
assert(
  Math.abs(turning.velocity.x - beforeTurn.velocity.x) < 10,
  'a turn must not instantly reverse the velocity vector'
);
let reversed = false;
for (let step = 0; step < 180 && !combat.getSnapshot().winner; step += 1) {
  const state = combat.tick(0.08).attacker;
  if (state.velocity.x < -2) {
    reversed = true;
    break;
  }
}
assert(reversed, 'thrust must eventually redirect momentum towards the escape point');
assert.equal(
  beforeTurn.velocity.x,
  forward.attacker.velocity.x,
  'a previous snapshot must remain detached from the mutable velocity'
);

console.log('PASS shared ship combat stats and physically persistent heading-independent momentum');
