'use strict';

// Deterministic diagnostic fights: node scripts/simulate-combat.cjs [count]
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../tests/ts-module-loader.cjs');

const root = path.resolve(__dirname, '..');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const { analyzeCombatLog } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-log-analysis.ts'
);
const { SHIP_COMPONENT_CATALOG } = loadStandaloneTypeScriptModule(
  root,
  'src/data/ships/ship-component-catalog.ts'
);
const catalog = SHIP_COMPONENT_CATALOG.weapon;
const railgun = catalog.find((entry) => entry.id === 'weapon-railgun-1');
const broadside = catalog.find((entry) => entry.id === 'weapon-autocannon-1');
if (!railgun || !broadside) throw new Error('Missing combat weapon profiles');

function ship(id, weapons, facing) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 150,
    hullHp: 200,
    weapons,
    weaponMounts: weapons.map((_, index) => ({
      slotIndex: index,
      x: 0,
      y: 0,
      facing,
    })),
    hitChance: 0.75,
    dodgeChance: 0.05,
    damageMultiplier: 1,
    criticalChance: 0.06,
    cycleTimeMultiplier: 1,
    combatSpeed: 120,
    accelerationMetersPerSecond2: 35,
    turnRateRadiansPerSecond: 0.8,
    aiControlled: true,
    aiAggression: 90,
  };
}

function simulate(seed) {
  const combat = createStrategicCombatService(
    ship('A', [railgun], 'forward'),
    ship('B', [broadside], 'port'),
    seed
  );
  let state = combat.getSnapshot();
  for (let tick = 0; tick < 2400 && !state.winner; tick += 1) {
    state = combat.tick(0.08);
  }
  return { seed, ...analyzeCombatLog(combat.getCombatLog()) };
}

const count = Math.max(1, Math.min(200, Number(process.argv[2] ?? 16) || 16));
const results = Array.from({ length: count }, (_, index) => simulate(index + 100));
const average = (key) => results.reduce((sum, entry) => sum + entry[key], 0) / count;
process.stdout.write(
  JSON.stringify(
    {
      scenarios: count,
      averageDurationSeconds: Number(average('durationSeconds').toFixed(2)),
      averageDamage: Number(average('totalDamage').toFixed(2)),
      winners: {
        attacker: results.filter((entry) => entry.winner?.includes('A gewinnt')).length,
        defender: results.filter((entry) => entry.winner?.includes('B gewinnt')).length,
        unresolved: results.filter((entry) => !entry.winner).length,
      },
      results,
    },
    null,
    2
  ) + '\n'
);
