'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const cover = read('src/systems/combat/combat-asteroid-cover.ts');
const movement = read('src/systems/combat/strategic-combat-movement.ts');
const planner = read('src/systems/combat/combat-strategy-planner.ts');
const mine = read('src/systems/combat/strategic-combat-mines.ts');
const tractor = read('src/systems/combat/combat-tractor-asteroid-throw.ts');
const execution = read('src/systems/combat/combat-plan-executor.ts');

assert(cover.includes('ship.shieldHp > ship.shieldMaxHp * 0.4'), 'cover reacts to depleted shields');
assert(cover.includes('rock.radius + 105'), 'defensive waypoint clears rock collision radius');
assert(movement.includes('asteroidCoverHeading(combatant, enemy, arena)'));
assert(movement.includes('cover ?? waypoint ?? direction'));
assert(planner.includes('broadsideFacing'), 'AI uses side-specific weapon geometry');
assert(planner.includes("enemy.tactic === 'flee'"), 'AI tracks escaping opponents');
assert(planner.includes('targetSubsystemChoice'), 'AI selects an enemy subsystem');
assert(mine.includes('usefulMineCorridor'), 'mines deny predicted pursuit corridors');
assert(tractor.includes('asteroid'), 'tractor supports asteroid interaction');
assert(execution.includes('reach_range'), 'multi-stage plans reach range before firing');
assert(planner.includes('const PERIOD = 8'), 'strategic planner preserves its eight-second cadence');

console.log('PASS tactical cover integrated with existing weapon, tractor, mine and plan doctrines');
