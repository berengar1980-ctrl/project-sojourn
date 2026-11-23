'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const { getShipMine } = loadStandaloneTypeScriptModule(root, 'src/data/combat/ship-mines.ts');
const laser = {
  id: 'integration-laser',
  type: 'weapon',
  name: 'Pulse laser',
  tier: 1,
  power: 1,
  cost: 0,
  weapon: {
    family: 'pulse_laser',
    role: 'balanced',
    shieldDamage: 16,
    hullDamage: 14,
    rangeMeters: 900,
    cooldownSeconds: 0.35,
    heat: 1,
    ammoPerShot: 0,
  },
};
const missile = {
  id: 'integration-missile',
  type: 'weapon',
  name: 'Torpedo',
  tier: 1,
  power: 1,
  cost: 0,
  weapon: {
    family: 'guided_missile',
    role: 'balanced',
    shieldDamage: 22,
    hullDamage: 28,
    rangeMeters: 1300,
    cooldownSeconds: 0.8,
    heat: 1,
    ammoPerShot: 1,
  },
};
const setup = (id, tactic) => ({
  id,
  name: id,
  shipId: 'patrol-60m-variant-01',
  shieldHp: 90,
  hullHp: 120,
  weapons: [laser, missile],
  mines: [getShipMine('mine-ion-1')].filter(Boolean),
  hitChance: 0.9,
  dodgeChance: 0,
  damageMultiplier: 1,
  criticalChance: 0,
  cycleTimeMultiplier: 1,
  preferredTactic: tactic,
  aiControlled: true,
  combatSpeed: 100,
  turnRateRadiansPerSecond: 0.65,
  accelerationMetersPerSecond2: 28,
  sensorCrewSkill: 80,
  sensorTier: 2,
  sensorRangeMeters: 1000,
  sensorRangeMultiplier: 1,
});
const arena = {
  width: 2000,
  height: 1300,
  attackerPosition: { x: 600, y: 650 },
  defenderPosition: { x: 1400, y: 650 },
  obstacles: [{ id: 'test-rock', position: { x: 1000, y: 650 }, radius: 135 }],
};
function simulate(seed) {
  const combat = createStrategicCombatService(
    setup('miner', 'minefield'),
    setup('hunter', 'fight'),
    seed,
    arena
  );
  const digest = require('node:crypto').createHash('sha256');
  const trace = [];
  for (let frame = 0; frame < 180; frame += 1) {
    const snapshot = combat.tick(0.08);
    digest.update(JSON.stringify(snapshot));
    for (const ship of [snapshot.attacker, snapshot.defender]) {
      assert(Number.isFinite(ship.position.x) && Number.isFinite(ship.position.y));
      assert(ship.position.x >= 0 && ship.position.x <= arena.width);
      assert(ship.position.y >= 0 && ship.position.y <= arena.height);
      assert(ship.shieldHp >= 0 && ship.shieldHp <= ship.shieldMaxHp);
      assert(ship.hullHp >= 0 && ship.hullHp <= ship.hullMaxHp);
    }
    for (const projectile of snapshot.projectiles) {
      assert(Number.isFinite(projectile.position.x) && Number.isFinite(projectile.position.y));
    }
    for (const mine of snapshot.mines) {
      assert(Number.isFinite(mine.position.x) && Number.isFinite(mine.position.y));
    }
    trace.push([
      snapshot.elapsedSeconds,
      snapshot.winner,
      snapshot.attacker.position.x,
      snapshot.attacker.position.y,
      snapshot.defender.position.x,
      snapshot.defender.position.y,
      snapshot.attacker.shieldHp,
      snapshot.defender.shieldHp,
      snapshot.projectiles.length,
      snapshot.mines.length,
      snapshot.lastEvent,
    ]);
    if (snapshot.winner) break;
  }
  return { trace, digest: digest.digest('hex') };
}
// Complete per-tick snapshots through the winner, recorded on pre-PR main f8f6569.
const reference = new Map([
  [7, 'd3b828fc26aa241214dec3739a6a80c3b5f7e30bd38c0b2b25fd32d40e65f5f6'],
  [19, '1c1b539e3b9f6a03b8951f62305e8fa374d2e82a3e161fde570c448f4dead49f'],
  [1337, '8cfc04d473ddee560c8b954458b9907b9c4e42759f16d189b73c8e88893e11ad'],
]);
for (const seed of [7, 19, 1337]) {
  const first = simulate(seed);
  const repeat = simulate(seed);
  assert.deepEqual(first, repeat, 'combined weapons/mines/obstacles reproduce for seed ' + seed);
  assert.equal(first.digest, reference.get(seed), 'pre-integration 1vs1 replay for seed ' + seed);
  assert(first.trace.length > 20, 'battle simulation advances beyond opening exchanges');
}
console.log('PASS multi-seed combined weapons, minefield and asteroid simulation');
