'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const cover = read('src/systems/combat/combat-asteroid-cover.ts');
const movement = read('src/systems/combat/strategic-combat-movement.ts');
const planner = read('src/systems/combat/combat-strategy-planner.ts');
const mine = read('src/systems/combat/strategic-combat-mines.ts');
const tractor = read('src/systems/combat/combat-tractor-asteroid-throw.ts');
const execution = read('src/systems/combat/combat-plan-executor.ts');
const exchange = read('src/systems/combat/combat-exchange-controller.ts');

assert(
  cover.includes('ship.shieldHp > ship.shieldMaxHp * 0.4'),
  'cover reacts to depleted shields'
);
assert(cover.includes('rock.radius + 105'), 'defensive waypoint clears rock collision radius');
assert(movement.includes('asteroidCoverHeading(combatant, enemy, arena)'));
assert(movement.includes('cover ?? waypoint ?? direction'));
const { resolveExchangeFlightGoals } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-exchange-goals.ts'
);
assert(exchange.includes('resolveExchangeFlightGoals('), 'exchange delegates flight priority');
const planned = {
  initiatorGoal: { x: 1100, y: 400 },
  reactorGoal: { x: 250, y: 900 },
};
const fighting = { tactic: 'fight' };
assert.deepEqual(
  resolveExchangeFlightGoals(planned, fighting, fighting, undefined, null, null)
    .initiatorGoal,
  planned.initiatorGoal,
  'ordinary defensive cover cannot override a committed exchange passage'
);
assert.deepEqual(
  resolveExchangeFlightGoals(
    planned, fighting, fighting, undefined, { x: 500, y: 500 }, null
  ).initiatorGoal,
  { x: 500, y: 500 },
  'a critical safety reaction temporarily overrides the committed passage'
);
assert(planner.includes('broadsideFacing'), 'AI uses side-specific weapon geometry');
assert(planner.includes("enemy.tactic === 'flee'"), 'AI tracks escaping opponents');
assert(planner.includes('targetSubsystemChoice'), 'AI selects an enemy subsystem');
assert(mine.includes('usefulMineCorridor'), 'mines deny predicted pursuit corridors');
assert(tractor.includes('asteroid'), 'tractor supports asteroid interaction');
assert(execution.includes('reach_range'), 'multi-stage plans reach range before firing');
assert(
  planner.includes('const PERIOD = 8'),
  'strategic planner preserves its eight-second cadence'
);

const plannerSource = read('src/systems/combat/combat-strategy-planner.ts');
assert(
  plannerSource.includes('weapon.combatShieldDamage ?? weapon.shieldDamage'),
  'planner uses effective native combat damage rather than legacy catalog score'
);
assert(plannerSource.includes('weapon.combatHullDamage ?? weapon.hullDamage'));
const coverModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-asteroid-cover.ts'
);
const ship = {
  position: { x: 700, y: 650 },
  shieldHp: 15,
  shieldMaxHp: 100,
  tactic: 'fight',
  setup: { aiControlled: true },
};
const enemy = { position: { x: 200, y: 500 } };
const arena = {
  width: 1600,
  height: 1000,
  obstacles: [{ id: 'rock', radius: 90, position: { x: 500, y: 500 } }],
};
const heading = coverModule.asteroidCoverHeading(ship, enemy, arena);
assert(heading, 'damaged AI uses a nearby rock between itself and the enemy');
assert(heading.x < 0 && heading.y < 0, 'defensive steering seeks the far side of the rock');
assert.equal(
  coverModule.asteroidCoverHeading({ ...ship, shieldHp: 90 }, enemy, arena),
  null,
  'healthy shields do not interrupt the normal weapon posture'
);
assert.equal(coverModule.asteroidCoverHeading(ship, enemy, { ...arena, obstacles: [] }), null);
assert.equal(
  coverModule.asteroidCoverHeading({ ...ship, setup: { aiControlled: false } }, enemy, arena),
  null
);
console.log(
  'PASS tactical cover integrated with existing weapon, tractor, mine and plan doctrines'
);
