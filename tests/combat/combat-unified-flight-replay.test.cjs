'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { createMotionMetrics } = require('../../scripts/combat-motion-metrics.cjs');
const root = path.resolve(__dirname, '../..');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const { SHIP_COMPONENT_CATALOG } = loadStandaloneTypeScriptModule(
  root,
  'src/data/ships/ship-component-catalog.ts'
);
function weapon(id) {
  const item = SHIP_COMPONENT_CATALOG.weapon.find((entry) => entry.id === id);
  assert(item, 'missing test weapon: ' + id);
  return item;
}
function setup(id, mounted, speed = 120, acceleration = 35) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 150,
    hullHp: 200,
    weapons: [mounted.weapon],
    weaponMounts: [{ slotIndex: 0, x: 0, y: 0, facing: mounted.facing }],
    hitChance: 0.75,
    dodgeChance: 0.05,
    damageMultiplier: 1,
    criticalChance: 0.06,
    cycleTimeMultiplier: 1,
    combatSpeed: speed,
    accelerationMetersPerSecond2: acceleration,
    turnRateRadiansPerSecond: 0.8,
    aiControlled: true,
    aiAggression: 90,
  };
}
const front = { weapon: weapon('weapon-railgun-1'), facing: 'forward' };
const broadside = { weapon: weapon('weapon-autocannon-1'), facing: 'port' };
const scenarios = [
  {
    label: 'front vs broadside',
    first: setup('front', front),
    second: setup('side', broadside),
  },
  {
    label: 'fast vs slow',
    first: setup('fast', front, 160, 45),
    second: setup('slow', broadside, 80, 20),
  },
  {
    label: 'both front',
    first: setup('alpha', front),
    second: setup('beta', front),
  },
];
// Complete per-tick snapshots captured on main at 9ba7f68 before sharing the tick.
const referenceTraces = {
  'front vs broadside': '1b44a6e65a54a478fff6b6edddb6efa69ca789ac949fbaf873f3c46bbfef6265',
  'fast vs slow': 'a23ed5a14cb0c967772abe0ec0b97662286e71c4da20eb5fdbc0428a23f2525a',
  'both front': 'e9ce59e002b452c36c387b805ac0113279dc6f7eba5f7f4ea9ec067cb6a3f9a5',
};
for (const { label, first, second } of scenarios) {
  const hash = createHash('sha256');
  for (const seed of [1001, 100, 101]) {
    const battle = createStrategicCombatService(first, second, seed);
    for (let tick = 0; tick < 1000; tick++) {
      const state = battle.tick(0.08);
      hash.update(JSON.stringify(state));
      if (state.winner) break;
    }
  }
  assert.equal(hash.digest('hex'), referenceTraces[label], '1vs1 replay changed: ' + label);
}

for (const scenario of scenarios) {
  for (const seed of [1001, 100, 101, 102]) {
    const battle = createStrategicCombatService(scenario.first, scenario.second, seed);
    const monitor = createMotionMetrics([scenario.first.combatSpeed, scenario.second.combatSpeed]);
    monitor.sample(battle.getSnapshot());
    let latest = battle.getSnapshot();
    for (let tick = 0; tick < 1125 && !latest.winner; tick += 1) {
      latest = battle.tick(0.08);
      monitor.sample(latest);
    }
    const metrics = monitor.summarize();
    const label = scenario.label + ' seed ' + seed;
    assert.equal(metrics.invalidFrames, 0, label + ': all movement must be finite');
    assert(
      metrics.longestBothSlowStreakSeconds < 20,
      label + ': persistent two-ship stall ' + JSON.stringify(metrics)
    );
    assert(
      !battle.getCombatLog().some((event) => event.detail.startsWith('EXCHANGE_OUTCOME')),
      label + ': runtime must not schedule paired choreography'
    );
  }
}
console.log('PASS unified flight avoids sustained stalls in twelve seeded weapon duels');
