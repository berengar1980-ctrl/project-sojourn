'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (path) => loadStandaloneTypeScriptModule(root, path);
const moves = load('src/systems/combat/combat-tactical-maneuvers.ts');
const planner = load('src/systems/combat/combat-strategy-planner.ts');
const executor = load('src/systems/combat/combat-plan-executor.ts');
const cover = load('src/systems/combat/combat-asteroid-cover.ts');
const tractor = load('src/systems/combat/combat-tractor-pulse.ts');
const exchangeTactics = load('src/systems/combat/combat-exchange-tactics.ts');
const geometry = load('src/systems/combat/strategic-combat-geometry.ts');
const movement = load('src/systems/combat/strategic-combat-movement.ts');
const { createStrategicCombatService } = load('src/systems/combat/strategic-combat-service.ts');

const ship = (x, y) => ({
  position: { x, y },
  velocity: { x: 0, y: 0 },
  headingRadians: 0,
  hullHp: 100,
  hullMaxHp: 100,
  shieldHp: 50,
  shieldMaxHp: 100,
  tactic: 'fight',
  mineStock: [],
  strategy: null,
  subsystems: { engine: 100, tractor: 100 },
  setup: { aiControlled: true, combatSpeed: 120, weapons: [], tractorRangeMeters: 420 },
});
const first = ship(360, 500);
const second = ship(800, 500);
second.tactic = 'flee';
second.velocity.y = 90;
const pursuit = moves.pursuitManeuver(first, second);
assert(
  pursuit && pursuit.direction.y > 0,
  'pursuit leads the moving target instead of its last position'
);
assert.equal(moves.pursuitManeuver({ ...first, tactic: 'flee' }, second), null);
const exchangeLead = exchangeTactics.exchangeTacticalGoal(first, second);
assert(
  exchangeLead && exchangeLead.y > first.position.y,
  'exchange battles also lead escaping targets rather than chasing their old position'
);

first.tactic = 'minefield';
first.mineStock = [{ id: 'test' }];
second.tactic = 'fight';
const bait = moves.mineBaitManeuver(first, second);
assert(
  bait && bait.direction.x < 0,
  'minelayer runs from approaching ship to lay a chase corridor'
);
assert.equal(moves.mineBaitManeuver({ ...first, mineStock: [] }, second), null);
const exchangeBait = exchangeTactics.exchangeTacticalGoal(first, second);
assert(
  exchangeBait && exchangeBait.x < first.position.x,
  'exchange minelayers bait the chase corridor'
);

first.tactic = 'fight';
first.strategy = {
  kind: 'broadside',
  focus: 'broadside',
  broadsideFacing: 'port',
  desiredRange: 500,
};
const broadside = moves.broadsideOrbitManeuver(first, second, 500);
assert(broadside && Math.abs(broadside.direction.y) > 0.8, 'broadside circles at weapon range');
assert(broadside.direction.y > 0, 'port guns remain exposed on the correct orbit side');
const starboard = moves.broadsideOrbitManeuver(
  { ...first, strategy: { ...first.strategy, broadsideFacing: 'starboard' } },
  second,
  500
);
assert(starboard && starboard.direction.y < 0, 'starboard guns orbit on the opposite side');
first.velocity.x = 100;
const brake = moves.interceptBrakeManeuver(first, second, 500);
assert(brake && brake.direction.y > 0, 'relative braking accounts for enemy lateral velocity');
assert.equal(
  moves.interceptBrakeManeuver(
    { ...first, strategy: { ...first.strategy, phase: 'align_weapons' } },
    second,
    500
  ),
  null
);

first.shieldHp = 10;
const arena = {
  width: 1600,
  height: 1000,
  obstacles: [{ id: 'rock', radius: 90, position: { x: 500, y: 500 } }],
};
const hiding = cover.asteroidCoverHeading(first, second, arena);
assert(hiding, 'low-shield ship takes cover behind real obstacle');
assert.equal(cover.asteroidCoverHeading({ ...first, shieldHp: 100 }, second, arena), null);

first.shieldHp = 0;
second.shieldHp = 0;
second.tactic = 'flee';
assert.equal(planner.targetSubsystem(first, second), 'engine', 'fleeing targets lose engine first');
second.tactic = 'fight';
second.setup.tractorRangeMeters = 420;
first.position.x = 520;
assert.equal(
  planner.targetSubsystem(first, second),
  'tractor',
  'shieldless threatened ship disables nearby tractor'
);
first.shieldHp = 100;
assert.equal(planner.targetSubsystem(first, second), 'hull', 'safe ship focuses hull');
first.strategy = { kind: 'broadside', focus: 'broadside', desiredRange: 500, phase: 'fire' };
first.position.x = 700;
assert.equal(
  executor.executeCombatPlan(first, second),
  'regroup',
  'overshoot triggers reposition phase'
);
first.position.x = 100;
assert.equal(
  executor.executeCombatPlan(first, second),
  'reach_range',
  'moving out of range re-enters approach'
);
first.position.x = 360;
first.strategy.phase = 'reach_range';
assert.equal(
  executor.executeCombatPlan(first, second),
  'align_weapons',
  'range reached before broadside alignment'
);
first.headingRadians = Math.PI / 2;
first.strategy.phase = 'align_weapons';
assert.equal(
  executor.executeCombatPlan(first, second),
  'fire',
  'firing follows correct side alignment'
);
first.position.x = 700;
first.strategy.phase = 'fire';
assert.equal(
  executor.executeCombatPlan(first, second),
  'regroup',
  'excessively close after firing starts disengage'
);
first.strategy.phase = 'regroup';
assert.equal(
  executor.executeCombatPlan(first, second),
  'regroup',
  'disengage persists until safe separation'
);
first.position.x = 360;
assert.equal(executor.executeCombatPlan(first, second), 'fire', 'regroup rejoins the firing cycle');

const space = {
  width: 2400,
  height: 1200,
  attackerPosition: { x: 700, y: 500 },
  defenderPosition: { x: 1200, y: 500 },
};
const actorSetup = (id) => ({
  id,
  name: id,
  shipId: 'patrol',
  shieldHp: 100,
  hullHp: 200,
  weapons: [],
  hitChance: 0.7,
  dodgeChance: 0.1,
  damageMultiplier: 1,
  criticalChance: 0,
  cycleTimeMultiplier: 1,
  aiControlled: true,
  combatSpeed: 120,
  turnRateRadiansPerSecond: 1,
  accelerationMetersPerSecond2: 30,
});
for (const [facing, expected] of [
  ['port', 1],
  ['starboard', -1],
]) {
  const orbitShip = geometry.createCombatant(actorSetup('orbit-' + facing), 'attacker', space);
  const orbitTarget = geometry.createCombatant(actorSetup('target'), 'defender', space);
  orbitShip.strategy = {
    kind: 'broadside',
    focus: 'broadside',
    broadsideFacing: facing,
    desiredRange: 500,
    score: 1,
    reason: 'side weapons',
  };
  movement.moveCombatant(orbitShip, orbitTarget, 'attacker', 0.08, space, []);
  assert(
    orbitShip.headingRadians * expected > 0,
    facing + ' orbit drives the actual ship rotation in the correct direction'
  );
}
for (const lateralSpeed of [80, -80]) {
  const chase = createStrategicCombatService(
    { ...actorSetup('pursuer'), preferredTactic: 'fight' },
    { ...actorSetup('evader'), preferredTactic: 'flee' },
    202,
    {
      width: 2500,
      height: 1200,
      attackerPosition: { x: 500, y: 600 },
      defenderPosition: { x: 1200, y: 600 },
      defenderVelocity: { x: 0, y: lateralSpeed },
      exitPoint: { x: 2300, y: 600 },
    }
  );
  const oneFrame = chase.tick(0.08);
  assert(
    oneFrame.attacker.headingRadians * lateralSpeed > 0,
    'real pursuer adjusts heading towards the moving target lead'
  );
}
const pulseRuntime = () => ({
  elapsedSeconds: 2,
  combatLog: [],
  beams: [],
  beamSerial: 0,
  lastEvent: '',
});
const tug = ship(300, 500);
const target = ship(530, 500);
tug.shieldHp = 0;
tug.tactic = 'flee';
target.velocity.x = -90;
const repelRuntime = pulseRuntime();
tractor.pulseCombatTractor(repelRuntime, 'attacker', tug, target, 0.08);
assert(target.velocity.x > -90, 'fleeing tractor ship repels an approaching pursuer');
assert.equal(repelRuntime.beams.length, 1);
assert(repelRuntime.combatLog[0].detail.includes('ABWEHR'));
tug.tactic = 'fight';
tug.tractorPulseCooldown = 0;
target.velocity.x = 90;
tractor.pulseCombatTractor(pulseRuntime(), 'attacker', tug, target, 0.08);
assert(target.velocity.x < 90, 'tractor interceptor brakes a separating target');
tug.shieldHp = 20;
tug.tractorPulseCooldown = 0;
target.velocity.x = 90;
tractor.pulseCombatTractor(pulseRuntime(), 'attacker', tug, target, 0.08);
assert.equal(target.velocity.x, 90, 'own shields still block tractor use');
console.log('PASS seven-doctrine tactical decisions with real geometry and phase transitions');
