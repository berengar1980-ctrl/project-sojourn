'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { reviewCombatStrategy } = loadStandaloneTypeScriptModule(
  root, 'src/systems/combat/combat-strategy-planner.ts'
);
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root, 'src/systems/combat/strategic-combat-service.ts'
);
const { SHIP_COMPONENT_CATALOG } = loadStandaloneTypeScriptModule(
  root, 'src/data/ships/ship-component-catalog.ts'
);
const get = (id) => SHIP_COMPONENT_CATALOG.weapon.find((item) => item.id === id);
const ion = get('weapon-ion-laser-1');
const cannon = get('weapon-autocannon-1');
const turret = get('weapon1');
assert(ion && cannon && turret);

function combatant(weapons, x) {
  return {
    setup: {
      weapons,
      weaponMounts: weapons.map((weapon, index) => ({
        slotIndex: index, x: 0, y: 0,
        facing: weapon.weapon?.mount === 'broadside' ? 'port' : 'forward',
      })),
      combatSpeed: 110, turnRateRadiansPerSecond: 1.2, aiControlled: true,
      aiAggression: 90,
    },
    position: { x, y: 650 },
    shieldHp: 300, shieldMaxHp: 300,
    hullHp: 300, hullMaxHp: 300,
    subsystems: { engine: 100, tractor: 0, maximum: 100 },
    mineStock: [], tactic: 'fight', strategy: null, nextStrategyReviewAt: 0,
  };
}
const ship = combatant([ion, cannon], 600);
const enemy = combatant([turret], 1000);
reviewCombatStrategy(ship, enemy, 'attacker', 0);
const firstKind = ship.strategy.kind;
assert(firstKind === 'skirmish' || firstKind === 'broadside');
for (const second of [8, 16, 24]) reviewCombatStrategy(ship, enemy, 'attacker', second);
assert(
  ship.stalledPlanKind,
  'after 24 seconds of no damage the tactical planner must flag its failed posture'
);
assert(
  ship.strategy.kind !== firstKind ||
    ship.strategy.reason.includes('Ausweichplan') ||
    ship.strategy.broadsideFacing !== undefined,
  'a stalled plan must retain a possible fallback or record its fallback posture'
);

function setup(id, guns, facing) {
  return {
    id, name: id, shipId: 'patrol-60m-variant-01',
    shieldHp: 200, hullHp: 250, weapons: guns,
    weaponMounts: guns.map((_, slotIndex) => ({
      slotIndex, x: 0, y: -10, facing,
    })),
    hitChance: 1, dodgeChance: 0, damageMultiplier: 1,
    criticalChance: 0, cycleTimeMultiplier: 1,
    combatSpeed: 100, turnRateRadiansPerSecond: 1.6,
    accelerationMetersPerSecond2: 35, aiControlled: true,
    aiAggression: 90,
  };
}
const battle = createStrategicCombatService(
  setup('side', [cannon], 'port'),
  setup('target', [turret], 'forward'),
  70,
  {
    width: 2200, height: 1400,
    attackerPosition: { x: 850, y: 700 },
    defenderPosition: { x: 1300, y: 700 },
  }
);
let snapshot = battle.getSnapshot();
for (let i = 0; i < 250; i += 1) snapshot = battle.tick(0.08);
assert(
  Number.isFinite(snapshot.attacker.headingRadians) &&
    Number.isFinite(snapshot.attacker.position.x),
  'broadside maneuver must remain numerically stable'
);
assert(
  battle.getCombatLog().some((entry) => entry.event === 'plan'),
  'broadside fight must evaluate strategic plans'
);
console.log('PASS combat tactical diversity and stalled plan detection');
