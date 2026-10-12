'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(root, 'src/systems/combat/combat-asteroid-contacts.ts'),
  'utf8'
);
assert(source.includes('hit.impactSpeed - 7'), 'damage scales with closing speed');
assert(source.includes('Math.min(14,'), 'individual impacts have a small cap');
assert(!source.includes('damageFromImpactEnergy('), 'mass-scaled global formula is excluded from combat');
console.log('PASS combat asteroid damage follows closing speed, not inflated asteroid mass');
