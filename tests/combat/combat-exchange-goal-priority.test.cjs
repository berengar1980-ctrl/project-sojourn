'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { resolveExchangeFlightGoals } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-exchange-goals.ts'
);

const flight = {
  initiatorGoal: { x: 900, y: 650 },
  reactorGoal: { x: 300, y: 400 },
  initiatorHeading: 0,
  reactorHeading: Math.PI,
};
const fighter = { tactic: 'fight' };
const fleeing = { tactic: 'flee' };
const exit = { x: 120, y: 140 };
const hazard = { x: 670, y: 800 };
const original = resolveExchangeFlightGoals(flight, fighter, fighter, exit, null, null);
assert.deepEqual(original, flight, 'ordinary flight retains committed choreography');

const dangerous = resolveExchangeFlightGoals(flight, fighter, fighter, exit, hazard, null);
assert.deepEqual(dangerous.initiatorGoal, hazard, 'safety temporarily overrides choreography');
assert.deepEqual(dangerous.reactorGoal, flight.reactorGoal, 'other ship retains its own order');

const escaped = resolveExchangeFlightGoals(flight, fleeing, fighter, exit, hazard, null);
assert.deepEqual(escaped.initiatorGoal, exit, 'escape outranks hazard and choreography');
assert.deepEqual(escaped.reactorGoal, flight.reactorGoal);
assert.deepEqual(flight.initiatorGoal, { x: 900, y: 650 }, 'source plan remains immutable');

const resumed = resolveExchangeFlightGoals(flight, fighter, fighter, exit, null, null);
assert.deepEqual(resumed, flight, 'choreographed flight resumes after safety correction');

console.log('PASS choreography, safety, and escape flight-order priority');
