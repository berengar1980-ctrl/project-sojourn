'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const geometry = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-geometry.ts'
);
const targeting = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-subsystem-targeting.ts'
);
const damage = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-damage.ts'
);
const planner = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-strategy-planner.ts'
);
const movement = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-movement.ts'
);

const railgun = {
  id: 'test-rail',
  name: 'Railgun',
  weapon: {
    family: 'railgun',
    mount: 'forward',
    rangeMeters: 1550,
    hullDamage: 120,
    shieldDamage: 70,
    cooldownSeconds: 7.2,
  },
};
const cannon = {
  id: 'test-cannon',
  name: 'Cannon',
  weapon: {
    family: 'autocannon',
    mount: 'broadside',
    rangeMeters: 560,
    hullDamage: 35,
    shieldDamage: 45,
    cooldownSeconds: 2.2,
  },
};
function setup(id, weapons, mounts) {
  return {
    id,
    name: id,
    shipId: 'patrol-test',
    shieldHp: 0,
    hullHp: 100,
    weapons,
    weaponMounts: mounts,
    hitChance: 1,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed: 100,
    accelerationMetersPerSecond2: 30,
    turnRateRadiansPerSecond: 1,
    tractorRangeMeters: 500,
  };
}
const arena = {
  width: 1800,
  height: 1100,
  attackerPosition: { x: 500, y: 550 },
  defenderPosition: { x: 900, y: 550 },
  exitPoint: { x: 160, y: 500 },
};
const first = geometry.createCombatant(
  setup(
    'a',
    [railgun, cannon, cannon],
    [
      { slotIndex: 0, x: 10, y: 0, facing: 'forward' },
      { slotIndex: 1, x: 0, y: -10, facing: 'port' },
      { slotIndex: 2, x: 0, y: 10, facing: 'starboard' },
    ]
  ),
  'attacker',
  arena
);
const second = geometry.createCombatant(
  setup('b', [cannon], [{ slotIndex: 0, x: 0, y: 10, facing: 'starboard' }]),
  'defender',
  arena
);
assert.equal(first.subsystems.maximum, first.hullMaxHp);
assert.equal(first.subsystems.engine, first.hullMaxHp);
assert.equal(first.subsystems.tractor, first.hullMaxHp);
const detached = geometry.snapshot(first);
detached.subsystems.engine = -10;
assert.equal(first.subsystems.engine, 100, 'snapshots must be detached');

planner.reviewCombatStrategy(first, second, 'attacker', 0);
assert(first.strategy);
assert.equal(first.nextStrategyReviewAt, 8);
const initial = first.strategy.kind;
planner.reviewCombatStrategy(first, second, 'attacker', 2);
assert.equal(first.strategy.kind, initial, 'no strategy thrashing before next review');

second.headingRadians = 0;
second.tactic = 'flee';
planner.reviewCombatStrategy(first, second, 'attacker', 8);
assert.equal(
  first.strategy.kind,
  'tractor_lock',
  'intact tractor can intercept an unshielded escaping target'
);
assert.equal(
  first.strategy.targetSubsystem,
  'engine',
  'escape makes enemy engines the preferred subsystem'
);
assert.equal(targeting.canEngagePreferredSubsystem(first, second), true);
assert.equal(
  targeting.effectiveTargetSubsystem(first, second),
  'engine',
  'shoot fleeing engines from the side or behind'
);
first.position = { x: 1100, y: 550 };
assert.equal(
  targeting.canEngagePreferredSubsystem(first, second),
  true,
  'fire on the hull when a fleeing ship hides its engine instead of freezing all weapons'
);
assert.equal(
  targeting.effectiveTargetSubsystem(first, second),
  'hull',
  'engine cannot be shot from the front'
);

first.position = { x: 500, y: 550 };
second.shieldHp = 0;
const engineBefore = second.subsystems.engine;
const hit = damage.applyDamage(
  second,
  0,
  1000,
  first,
  false,
  first.position,
  'laser',
  1,
  undefined,
  'engine'
);
assert.equal(hit.layer, 'hull');
assert.equal(second.subsystems.engine, 0);
assert.equal(second.hullHp, 100, 'subsystem destruction does not destroy the hull');
assert(engineBefore > 0);
const priorPosition = { ...second.position };
const priorHeading = second.headingRadians;
second.velocity = { x: 8, y: 0 };
movement.moveCombatant(second, first, 'defender', 0.08, arena, []);
assert(second.position.x !== priorPosition.x, 'engine-dead ships still coast');
assert(second.headingRadians !== priorHeading, 'RCS still rotates an engine-dead ship');
assert.equal(second.subsystems.tractor, 100);
damage.applyDamage(second, 0, 1000, first, false, first.position, 'laser', 2, undefined, 'tractor');
assert.equal(second.subsystems.tractor, 0);
assert.equal(second.hullHp, 100);
damage.applyDamage(second, 0, 1000, first, false, first.position, 'laser', 3);
assert.equal(second.hullHp, 0, 'only hull destruction means destruction defeat');
console.log('PASS subsystem targeting, flank exposure, independent HP, engine drift and RCS');
