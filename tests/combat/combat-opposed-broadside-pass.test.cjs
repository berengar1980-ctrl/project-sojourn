'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createCombatant } = load('src/systems/combat/strategic-combat-geometry.ts');
const { reviewCombatStrategy } = load('src/systems/combat/combat-strategy-planner.ts');
const { chooseCombatFlightIntent } = load('src/systems/combat/combat-flight-intent.ts');
const { weaponInArc } = load('src/systems/combat/combat-weapon-geometry.ts');
const { SHIP_COMPONENT_CATALOG } = load('src/data/ships/ship-component-catalog.ts');

function weapon(id) {
  const found = SHIP_COMPONENT_CATALOG.weapon.find((component) => component.id === id);
  assert(found, 'expected real weapon ' + id);
  return found;
}
const ion = weapon('weapon-ion-cannon-1');
const autocannon = weapon('weapon-autocannon-1');
const arena = {
  width: 3600,
  height: 2600,
  attackerPosition: { x: 1000, y: 1150 },
  defenderPosition: { x: 1470, y: 1150 },
  obstacles: [],
};
function build(id, side, weapons, facings) {
  const setup = {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 180,
    hullHp: 220,
    weapons,
    weaponMounts: facings.map((facing, slotIndex) => ({
      slotIndex,
      facing,
      x: 0,
      y: facing === 'port' ? -14 : 14,
      arcDegrees: 90,
    })),
    hitChance: 0.9,
    dodgeChance: 0,
    criticalChance: 0,
    damageMultiplier: 1,
    cycleTimeMultiplier: 1,
    combatSpeed: 120,
    turnRateRadiansPerSecond: 1.1,
    accelerationMetersPerSecond2: 45,
    preferredTactic: 'fight',
    aiControlled: true,
  };
  return createCombatant(setup, side, arena);
}
const left = build('left', 'attacker', [autocannon, ion], ['port', 'starboard']);
const right = build('right', 'defender', [ion, autocannon], ['port', 'starboard']);
reviewCombatStrategy(left, right, 'attacker', 0);
reviewCombatStrategy(right, left, 'defender', 4);
assert.equal(left.strategy.focus, 'broadside');
assert.equal(left.strategy.broadsideFacing, 'starboard', 'left needs shield-facing starboard');
assert.equal(right.strategy.focus, 'broadside');
assert.equal(right.strategy.broadsideFacing, 'port', 'right needs shield-facing port');
left.velocity = { x: 85, y: 0 };
right.velocity = { x: -85, y: 0 };
const intent = (ship, target) =>
  chooseCombatFlightIntent(ship, target, ship.strategy.desiredRange, arena, 0.08, false);

assert.notEqual(intent(left, right).kind, 'pass', 'a turret may not start an unaligned passage');
assert.notEqual(intent(right, left).kind, 'pass', 'an unaligned port gun must not start a pass');

left.headingRadians = -Math.PI / 2;
right.headingRadians = -Math.PI / 2;
assert(weaponInArc(left, right.position, 1, ion.weapon));
assert(weaponInArc(right, left.position, 0, ion.weapon));
const leftIntent = intent(left, right);
const rightIntent = intent(right, left);
assert.equal(leftIntent.kind, 'pass');
assert.equal(rightIntent.kind, 'pass');
assert(leftIntent.direction.y < -0.85 && rightIntent.direction.y < -0.85);
const parallel =
  leftIntent.direction.x * rightIntent.direction.x +
  leftIntent.direction.y * rightIntent.direction.y;
assert(parallel > 0.93, 'opposite desired sides should produce parallel flyby headings');
assert(
  Math.abs(left.flightPass.destination.x - left.position.x) < 200 &&
    Math.abs(right.flightPass.destination.x - right.position.x) < 200,
  'broadside waypoints follow the own firing lane, not through the opponent'
);

right.shieldHp = 0;
reviewCombatStrategy(left, right, 'attacker', 8);
assert.equal(left.strategy.broadsideFacing, 'port', 're-plan onto hull gun after shield break');
console.log('PASS shield-phase opposite broadsides align then commit to parallel firing lanes');
