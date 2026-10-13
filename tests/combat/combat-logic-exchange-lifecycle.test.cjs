'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const exchange = loadStandaloneTypeScriptModule(
  path.resolve(__dirname, '../..'), 'src/systems/combat/combat-exchange-machine.ts'
);
const context = {
  frontWeapons: 3, broadsideWeapons: 1, guidedWeapons: 0,
  attackerDamage: 0, defenderDamage: 0, roll: () => 0.5,
};
const initial = exchange.initialExchange('attacker');
assert.equal(initial.phase, 'choose');
const executing = exchange.advanceExchange(initial, 0, context);
assert.equal(executing.duration, 10, 'ordinary exchange lasts ten seconds');
assert.equal(executing.elapsed, 0);
const midway = exchange.advanceExchange(executing, 4, context);
assert.equal(midway.phase, 'execute', 'four seconds must not cause replanning');
assert.equal(midway.action, executing.action, 'action is committed throughout exchange');
assert.equal(midway.reaction, executing.reaction, 'reaction is committed throughout exchange');
const late = exchange.advanceExchange(midway, 5.9, context);
assert.equal(late.phase, 'execute');
const resolving = exchange.advanceExchange(late, 0.1, context);
assert.equal(resolving.phase, 'resolve', 'exchange resolves at its time boundary');
assert.equal(resolving.elapsed, 10);
const attackerSuccess = exchange.advanceExchange(resolving, 0, {
  ...context, actionSucceeded: true, reactionSucceeded: false,
  attackerDamage: 0, defenderDamage: 100,
});
assert.equal(attackerSuccess.initiative, 'attacker',
  'successful initiator geometry beats opposite damage advantage');
const defenderSuccess = exchange.advanceExchange(resolving, 0, {
  ...context, actionSucceeded: false, reactionSucceeded: true,
  attackerDamage: 100, defenderDamage: 0,
});
assert.equal(defenderSuccess.initiative, 'defender',
  'successful reactor geometry beats opposite damage advantage');
const damageAdvantage = exchange.advanceExchange(resolving, 0, {
  ...context, actionSucceeded: false, reactionSucceeded: false,
  attackerDamage: 0, defenderDamage: 10,
});
assert.equal(damageAdvantage.initiative, 'defender');
const flanking = exchange.advanceExchange(initial, 0, {
  ...context, frontWeapons: 0, broadsideWeapons: 0, guidedWeapons: 0,
});
assert.equal(flanking.action, 'flanking_pass');
assert.equal(flanking.duration, 14, 'flanking maneuver has its separate duration');
console.log('PASS committed exchange duration, reaction continuity and geometry-based initiative');
