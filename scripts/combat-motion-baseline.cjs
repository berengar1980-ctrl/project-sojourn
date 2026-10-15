'use strict';

// Read-only diagnostic: node scripts/combat-motion-baseline.cjs [seconds]
// No changes to combat tactics, velocity, projectiles or state.
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../tests/ts-module-loader.cjs');
const { createMotionMetrics } = require('./combat-motion-metrics.cjs');
const root = path.resolve(__dirname, '..');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const { SHIP_COMPONENT_CATALOG } = loadStandaloneTypeScriptModule(
  root,
  'src/data/ships/ship-component-catalog.ts'
);

function weapon(id) {
  const found = SHIP_COMPONENT_CATALOG.weapon.find((entry) => entry.id === id);
  if (!found) throw new Error('Missing combat fixture weapon: ' + id);
  return found;
}

function combatant(id, weapons, facing, speed = 120, acceleration = 35) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 150,
    hullHp: 200,
    weapons,
    weaponMounts: weapons.map((_, slotIndex) => ({
      slotIndex,
      x: 0,
      y: 0,
      facing,
    })),
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

function analyze(seed, label, attacker, defender, maximumSeconds) {
  const combat = createStrategicCombatService(attacker, defender, seed);
  const metrics = createMotionMetrics([attacker.combatSpeed, defender.combatSpeed]);
  let frame = combat.getSnapshot();
  metrics.sample(frame);
  const steps = Math.ceil(maximumSeconds / 0.08);
  for (let index = 0; index < steps && !frame.winner; index += 1) {
    frame = combat.tick(0.08);
    metrics.sample(frame);
  }
  const log = combat.getCombatLog();
  return {
    label,
    seed,
    steeringPath: seed === 1001 ? 'exchange-reference' : 'regular',
    winner: frame.winner,
    ...metrics.summarize(),
    plannedActions: log.filter((entry) => entry.event === 'plan').length,
    phaseChanges: log.filter((entry) => entry.event === 'phase').length,
    reactiveEvents: log.filter((entry) => entry.detail.startsWith('REACTIVE_')).length,
    confirmedExchangeOutcomes: log.filter((entry) => entry.detail.startsWith('EXCHANGE_OUTCOME'))
      .length,
  };
}

const rail = weapon('weapon-railgun-1');
const broadside = weapon('weapon-autocannon-1');
const maximumSeconds = Number(process.argv[2] ?? 90);
if (!Number.isFinite(maximumSeconds) || maximumSeconds < 1 || maximumSeconds > 600) {
  throw new Error('maximumSeconds must be between 1 and 600');
}
const scenarios = [
  [
    'front vs broadside',
    combatant('front', [rail], 'forward'),
    combatant('side', [broadside], 'port'),
  ],
  [
    'fast vs slow',
    combatant('fast', [rail], 'forward', 160, 45),
    combatant('slow', [broadside], 'port', 80, 20),
  ],
  [
    'both front',
    combatant('alpha', [rail], 'forward'),
    combatant('beta', [rail], 'forward'),
  ],
];
const results = [];
for (const [label, attacker, defender] of scenarios) {
  for (const seed of [1001, 100, 101, 102]) {
    results.push(analyze(seed, label, attacker, defender, maximumSeconds));
  }
}
process.stdout.write(
  JSON.stringify({ baselineVersion: 1, maximumSeconds, scenarios: results }, null, 2) + '\n'
);
