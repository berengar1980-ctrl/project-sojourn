'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { evaluateExchangeOutcome } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-exchange-outcome.ts'
);
const { REACTIONS, advanceExchange, initialExchange } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-exchange-machine.ts'
);
const ship = (x, y, angle = 0) => ({
  position: { x, y },
  headingRadians: angle,
});
const geometry = {
  startingRange: 500,
  closestRange: 175,
  initiatorStart: { x: 0, y: 0 },
  reactorStart: { x: 500, y: 0 },
};
let count = 0;
for (const [action, reactions] of Object.entries(REACTIONS)) {
  for (const reaction of reactions) {
    const outcome = evaluateExchangeOutcome(
      action,
      reaction,
      ship(350, 0),
      ship(600, 0, Math.PI),
      geometry
    );
    assert.equal(typeof outcome.actionSucceeded, 'boolean', action + '/' + reaction);
    assert.equal(typeof outcome.reactionSucceeded, 'boolean', action + '/' + reaction);
    assert.equal(outcome.closestRange, 175);
    count += 1;
  }
}
assert.equal(count, 12);
assert.equal(
  evaluateExchangeOutcome('disengage_fire', 'pursue', ship(0, 0), ship(750, 0), geometry)
    .actionSucceeded,
  true,
  'range increase is observed'
);
assert.equal(
  evaluateExchangeOutcome('disengage_fire', 'pursue', ship(0, 0), ship(520, 0), geometry)
    .actionSucceeded,
  false,
  'time alone is not successful disengagement'
);
assert.equal(
  evaluateExchangeOutcome('frontal_pass', 'evade', ship(160, 0), ship(510, 0), {
    ...geometry,
    closestRange: 390,
  }).actionSucceeded,
  false,
  'pass requires actual close encounter'
);
const context = {
  frontWeapons: 2,
  broadsideWeapons: 0,
  guidedWeapons: 0,
  attackerDamage: 0,
  defenderDamage: 0,
  roll: () => 0.3,
};
const chosen = advanceExchange(initialExchange('attacker'), 0, context);
const resolved = advanceExchange(chosen, 20, context);
const attackerWins = advanceExchange(resolved, 0, {
  ...context,
  actionSucceeded: true,
  reactionSucceeded: false,
});
assert.equal(attackerWins.initiative, 'attacker');
const defenderWins = advanceExchange(resolved, 0, {
  ...context,
  actionSucceeded: false,
  reactionSucceeded: true,
});
assert.equal(defenderWins.initiative, 'defender');
console.log('PASS all twelve action/reaction outcome combinations and initiative feedback');
