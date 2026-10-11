'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const module = loadStandaloneTypeScriptModule(
  path.resolve(__dirname, '../..'),
  'src/systems/combat/combat-exchange-machine.ts'
);

for (const [action, reactions] of Object.entries(module.REACTIONS)) {
  assert.equal(reactions.length, 3, action + ' must have three responses');
  assert.equal(new Set(reactions).size, 3, action + ' responses must differ');
}
const context = {
  frontWeapons: 2,
  broadsideWeapons: 1,
  guidedWeapons: 0,
  attackerDamage: 0,
  defenderDamage: 0,
  roll: () => 0.7,
};
const first = module.advanceExchange(module.initialExchange('attacker'), 0, context);
assert.equal(first.phase, 'execute');
assert.equal(first.action, 'frontal_pass');
assert(module.REACTIONS[first.action].includes(first.reaction));
const second = module.advanceExchange(first, 15, context);
assert.equal(second.phase, 'resolve');
const third = module.advanceExchange(second, 0, context);
assert.equal(third.initiative, 'defender', 'tied exchanges hand over initiative');
const next = module.advanceExchange(third, 0, context);
assert.notEqual(next.action, first.action, 'previous action receives repeat penalty');
const winning = module.advanceExchange(second, 0, {
  ...context,
  attackerDamage: 30,
  defenderDamage: 0,
});
assert.equal(winning.initiative, 'attacker', 'tactical advantage retains initiative');
console.log('PASS exchange initiative, three reactions and varied maneuver selection');
