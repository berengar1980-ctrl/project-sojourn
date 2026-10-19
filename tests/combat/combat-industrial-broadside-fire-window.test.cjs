'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (name) => loadStandaloneTypeScriptModule(root, name);
const { createCombatant } = load('src/systems/combat/strategic-combat-geometry.ts');
const { moveCombatant } = load('src/systems/combat/strategic-combat-movement.ts');
const { weaponInArc } = load('src/systems/combat/combat-weapon-geometry.ts');
const { SHIP_COMPONENT_CATALOG } = load('src/data/ships/ship-component-catalog.ts');

const ion = SHIP_COMPONENT_CATALOG.weapon.find(
  (item) => item.id === 'weapon-ion-cannon-1'
);
assert(ion?.weapon);
const arena = { width: 4200, height: 2600, obstacles: [] };
const makeShip = (id, x) =>
  createCombatant(
    {
      id,
      name: id,
      shipId: 'salvage-100m-variant-03',
      shieldHp: 200,
      hullHp: 250,
      weapons: [ion],
      weaponMounts: [{ slotIndex: 0, x: 0, y: -15, facing: 'port', arcDegrees: 90 }],
      hitChance: 0.8,
      dodgeChance: 0,
      damageMultiplier: 1,
      criticalChance: 0,
      cycleTimeMultiplier: 1,
      combatSpeed: 95,
      accelerationMetersPerSecond2: 28,
      turnRateRadiansPerSecond: 0.45,
      aiControlled: true,
      aiAggression: 90,
    },
    'attacker',
    {
      ...arena,
      attackerPosition: { x, y: 1300 },
      defenderPosition: { x: 1600, y: 1300 },
    }
  );

const enemy = makeShip('enemy', 1510);
const incoming = makeShip('incoming', 900);
incoming.strategy = {
  kind: 'broadside',
  focus: 'broadside',
  broadsideFacing: 'port',
  desiredRange: 480,
  phase: 'reach_range',
  score: 1,
  reason: 'test firing opportunity',
};
incoming.headingRadians = 0;
assert(!weaponInArc(incoming, enemy.position, 0, ion.weapon));
const before = Math.hypot(
  enemy.position.x - incoming.position.x,
  enemy.position.y - incoming.position.y
);
assert(before < ion.weapon.rangeMeters && before > 480 * 1.2);
moveCombatant(incoming, enemy, 'attacker', 0.08, arena, []);
assert(
  incoming.angularThrust > 0.5,
  'port battery should start turning toward a shootable target during range approach'
);
assert(incoming.velocity.x > 0, 'RCS must still advance toward the opponent');

const distant = makeShip('distant', 650);
distant.strategy = { ...incoming.strategy };
distant.headingRadians = 0;
assert(Math.hypot(enemy.position.x - distant.position.x, enemy.position.y - distant.position.y) >
  ion.weapon.rangeMeters * 1.2);
moveCombatant(distant, enemy, 'attacker', 0.08, arena, []);
assert(
  Math.abs(distant.angularThrust) < 0.1,
  'out-of-range ship must keep normal approach facing rather than premature side aim'
);
console.log('PASS civilian broadside alignment during a real firing opportunity');
