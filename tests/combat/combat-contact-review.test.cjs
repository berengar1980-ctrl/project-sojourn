'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { reviewShipContact } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-contact-review.ts'
);
const attacker = { position: { x: 100, y: 100 }, nextStrategyReviewAt: 8 };
const defender = { position: { x: 180, y: 100 }, nextStrategyReviewAt: 12 };
const runtime = { attacker, defender, elapsedSeconds: 1 };
let reviews = 0;
reviewShipContact(runtime, () => { reviews += 1; });
assert.equal(reviews, 2, 'both combatants review immediately on hull contact');
assert.equal(attacker.nextStrategyReviewAt, 1);
assert.equal(defender.nextStrategyReviewAt, 1);
runtime.elapsedSeconds = 1.5;
reviewShipContact(runtime, () => { reviews += 1; });
assert.equal(reviews, 2, 'contact does not trigger a new plan on every frame');
defender.position.x = 500;
runtime.elapsedSeconds = 3;
reviewShipContact(runtime, () => { reviews += 1; });
assert.equal(reviews, 2, 'distant ships do not receive contact-triggered reviews');
console.log('PASS contact-triggered strategy review and throttling');
