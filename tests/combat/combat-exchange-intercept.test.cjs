'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { planExchangeFlight } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-exchange-pilot.ts'
);
const initiator = { position: { x: 100, y: 200 }, velocity: { x: 0, y: 70 } };
const reactor = { position: { x: 500, y: 200 }, velocity: { x: 0, y: 0 }, setup: { combatSpeed: 120 } };
const plan = planExchangeFlight(initiator, reactor, 'flanking_pass', 'intercept', 'success');
assert(plan.reactorGoal.y > initiator.position.y + 100, 'interceptor leads moving enemy along its velocity');
assert(plan.reactorGoal.x === initiator.position.x, 'intercept does not inherit the flanking lane');
console.log('PASS intercept uses predicted enemy motion, not flanking offset');
