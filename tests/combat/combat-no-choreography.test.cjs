'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const service = fs.readFileSync(
  path.join(root, 'src/systems/combat/strategic-combat-step.ts'),
  'utf8'
);
assert(!service.includes('createActionExchange('), 'no seed-specific exchange planner is allowed');
assert(!service.includes('tickActionExchange('), 'all ships use one live tactical controller');
assert(!service.includes('seed === 1001'), 'seeds must not select alternative AI systems');
for (const file of [
  'combat-exchange-controller.ts',
  'combat-exchange-machine.ts',
  'combat-exchange-outcome.ts',
  'combat-exchange-pilot.ts',
  'combat-exchange-reactions.ts',
  'combat-exchange-tactics.ts',
]) {
  assert.equal(
    fs.existsSync(path.join(root, 'src/systems/combat', file)),
    false,
    file + ' must not survive as dormant combat choreography'
  );
}
console.log('PASS no choreographed runtime or dormant legacy control paths remain');
