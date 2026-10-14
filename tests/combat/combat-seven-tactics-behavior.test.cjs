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

const ship = (x, y) => ({
  position: { x, y }, velocity: { x: 0, y: 0 },
  headingRadians: 0, hullHp: 100, hullMaxHp: 100,
  shieldHp: 50, shieldMaxHp: 100, tactic: 'fight',
  mineStock: [], strategy: null,
  subsystems: { engine: 100, tractor: 100 },
  setup: { aiControlled: true, combatSpeed: 120, weapons: [], tractorRangeMeters: 420 },
});
const first = ship(360, 500);
const second = ship(800, 500);
second.tactic = 'flee';
second.velocity.y = 90;
const pursuit = moves.pursuitManeuver(first, second);
assert(pursuit && pursuit.direction.y > 0, 'pursuit leads the moving target instead of its last position');
assert.equal(moves.pursuitManeuver({ ...first, tactic: 'flee' }, second), null);

first.tactic = 'minefield';
first.mineStock = [{ id: 'test' }];
second.tactic = 'fight';
const bait = moves.mineBaitManeuver(first, second);
assert(bait && bait.direction.x < 0, 'minelayer runs from approaching ship to lay a chase corridor');
assert.equal(moves.mineBaitManeuver({ ...first, mineStock: [] }, second), null);

first.tactic = 'fight';
first.strategy = { kind: 'broadside', focus: 'broadside', broadsideFacing: 'port', desiredRange: 500 };
const broadside = moves.broadsideOrbitManeuver(first, second, 500);
assert(broadside && Math.abs(broadside.direction.y) > 0.8, 'broadside circles at weapon range');
first.velocity.x = 100;
const brake = moves.interceptBrakeManeuver(first, second, 500);
assert(brake && brake.direction.y > 0, 'relative braking accounts for enemy lateral velocity');
assert.equal(moves.interceptBrakeManeuver({ ...first, strategy: { ...first.strategy, phase: 'align_weapons' } }, second, 500), null);

first.shieldHp = 10;
const arena = {
  width: 1600, height: 1000,
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
assert.equal(planner.targetSubsystem(first, second), 'tractor', 'shieldless threatened ship disables nearby tractor');
first.shieldHp = 100;
assert.equal(planner.targetSubsystem(first, second), 'hull', 'safe ship focuses hull');
first.strategy = { kind: 'broadside', focus: 'broadside', desiredRange: 500, phase: 'fire' };
first.position.x = 700;
assert.equal(executor.executeCombatPlan(first, second), 'regroup', 'overshoot triggers reposition phase');
first.position.x = 100;
assert.equal(executor.executeCombatPlan(first, second), 'reach_range', 'moving out of range re-enters approach');
console.log('PASS seven-doctrine tactical decisions with real geometry and phase transitions');
