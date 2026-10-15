'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const controller = fs.readFileSync(
  path.join(root, 'src/systems/combat/combat-exchange-controller.ts'),
  'utf8'
);

const goals = controller.slice(
  controller.indexOf('function resolveExchangeFlightGoals('),
  controller.indexOf('function flyExchange(')
);
assert.match(goals, /initiatorOverride\s*\?\?\s*state\.flight\.initiatorGoal/);
assert.match(goals, /opponentOverride\s*\?\?\s*state\.flight\.reactorGoal/);
assert.doesNotMatch(goals, /coverGoal|exchangeTacticalGoal|pursuitManeuver/);
assert.match(goals, /initiator\.tactic === 'flee'/);
assert.match(goals, /opponent\.tactic === 'flee'/);

const reactions = controller.slice(
  controller.indexOf('function reactToCombatEvents('),
  controller.indexOf('function resolveExchangeFlightGoals(')
);
assert.match(reactions, /const safetyEvent = event\?\.critical \? event : null;/);
assert.match(reactions, /commitReactiveDecision\(memory, safetyEvent,/);
assert.match(reactions, /state\.reactiveGoals\[side\] = safetyEvent\.goal/);
assert.doesNotMatch(reactions, /state\.reactiveGoals\[side\] = event\.goal/);
console.log('PASS exchange choreography owns flight goals; safety and escape override');
