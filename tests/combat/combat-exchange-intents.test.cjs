'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { updateExchangeIntents } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-exchange-intents.ts'
);

const attacker = { tactic: 'fight', combatIntent: 'FRONTALANFLUG' };
const defender = { tactic: 'fight', combatIntent: 'GEGENFEUER' };
updateExchangeIntents(attacker, defender, { action: null, reaction: null, phase: 'choose' });
assert.equal(attacker.combatIntent, 'FRONTALANFLUG', 'phase gap keeps prior action');
assert.equal(defender.combatIntent, 'GEGENFEUER', 'phase gap keeps prior reaction');

updateExchangeIntents(attacker, defender, {
  action: 'broadside_pass',
  reaction: 'cross_pass',
  phase: 'execute',
});
assert.equal(attacker.combatIntent, 'BREITSEITENPASSAGE');
assert.equal(defender.combatIntent, 'KREUZEN');

defender.tactic = 'flee';
updateExchangeIntents(attacker, defender, {
  action: 'flanking_pass',
  reaction: 'turn_to_face',
  phase: 'execute',
});
assert.equal(attacker.combatIntent, 'FLANKIEREN');
assert.equal(defender.combatIntent, 'FLIEHEN', 'escape takes priority over reaction label');
console.log('PASS choreography intent labels remain stable across exchange phase gaps');
