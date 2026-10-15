'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { pilotCombatFlight } = load('src/systems/combat/combat-flight-controller.ts');
const { createCombatant } = load('src/systems/combat/strategic-combat-geometry.ts');
const { reviewCombatStrategy } = load('src/systems/combat/combat-strategy-planner.ts');
const { executeCombatPlan } = load('src/systems/combat/combat-plan-executor.ts');
const { combatRouteHeading } = load('src/systems/combat/combat-asteroid-routing.ts');
const { SHIP_COMPONENT_CATALOG } = load('src/data/ships/ship-component-catalog.ts');
const gun = SHIP_COMPONENT_CATALOG.weapon.find((entry) => entry.id === 'weapon-railgun-1');
const setup = {
  id: 'pilot',
  name: 'pilot',
  shipId: 'patrol',
  hullHp: 100,
  shieldHp: 100,
  weapons: [gun],
  hitChance: 1,
  dodgeChance: 0,
  damageMultiplier: 1,
  criticalChance: 0,
  cycleTimeMultiplier: 1,
  combatSpeed: 120,
  accelerationMetersPerSecond2: 30,
  turnRateRadiansPerSecond: 1,
  preferredTactic: 'fight',
};
const arena = {
  width: 3000,
  height: 2000,
  attackerPosition: { x: 800, y: 1000 },
  defenderPosition: { x: 1500, y: 1000 },
};
const ship = createCombatant(setup, 'attacker', arena);
const enemy = createCombatant({ ...setup, id: 'enemy' }, 'defender', arena);
ship.nextStrategyReviewAt = 0;
reviewCombatStrategy(ship, enemy, 'attacker', 0);
ship.strategy.phase = 'fire';
reviewCombatStrategy(ship, enemy, 'attacker', 8);
assert.equal(
  ship.strategy.phase,
  'fire',
  'a review of the same doctrine preserves its execution state'
);
const range = ship.strategy.desiredRange;
for (let i = 0; i < 100; i += 1) {
  enemy.position.x = ship.position.x + range * (i % 2 ? 1.11 : 1.09);
  ship.strategy.phase = executeCombatPlan(ship, enemy);
  assert.equal(
    ship.strategy.phase,
    'fire',
    'geometric hysteresis prevents boundary chatter without a timer'
  );
}
ship.headingRadians = Math.PI / 2;
ship.velocity = { x: 40, y: 0 };
const before = { ...ship.velocity };
pilotCombatFlight(ship, { velocity: { x: -80, y: 0 }, heading: Math.PI / 2 }, arena, 0.08);
assert.equal(
  ship.headingRadians,
  Math.PI / 2,
  'braking must not rotate the bow off its weapon bearing'
);
assert(
  ship.velocity.x < before.x && ship.velocity.x > 0,
  'RCS brakes real momentum without instant reversal'
);
assert(Math.hypot(ship.velocity.x - before.x, ship.velocity.y - before.y) <= 30 * 0.08 + 1e-9);
ship.subsystems.engine = 0;
const disabled = { position: { ...ship.position }, velocity: { ...ship.velocity } };
pilotCombatFlight(ship, { velocity: { x: 100, y: 100 }, heading: 0 }, arena, 0.08);
assert.deepEqual(ship.velocity, disabled.velocity, 'disabled engine preserves drift');
assert(Math.abs(ship.position.x - disabled.position.x - disabled.velocity.x * 0.08) < 1e-8);
// Opposing goals must invalidate a cached detour immediately, without waiting 0.75 seconds.
const blocked = {
  ...arena,
  obstacles: [
    { id: 'right', position: { x: 1100, y: 1000 }, radius: 100 },
    { id: 'left', position: { x: 500, y: 1000 }, radius: 100 },
  ],
};
ship.position = { x: 800, y: 1000 };
ship.velocity = { x: 0, y: 0 };
combatRouteHeading(ship, { x: 1800, y: 1000 }, blocked, 0.08);
const route = combatRouteHeading(ship, { x: 200, y: 1000 }, blocked, 0.08);
assert(route.x < 0, 'new flight objective owns navigation even during cached route lifetime');
console.log(
  'PASS flight ownership, phase continuity, acceleration bounds, disabled drift and route invalidation'
);

const { moveCombatant } = load('src/systems/combat/strategic-combat-movement.ts');
const holding = createCombatant(setup, 'attacker', arena);
const stationaryTarget = createCombatant({ ...setup, id: 'stationary' }, 'defender', arena);
holding.strategy = {
  kind: 'frontal',
  focus: 'forward',
  desiredRange: 700,
  score: 1,
  reason: 'test',
  phase: 'fire',
};
const nearbyRock = {
  ...arena,
  obstacles: [{ id: 'nearby', position: { x: 800, y: 1120 }, radius: 40 }],
};
moveCombatant(holding, stationaryTarget, 'attacker', 0.08, nearbyRock, []);
assert(
  holding.speed > 0,
  'safety correction must translate a stationary ship, not merely rotate it'
);
