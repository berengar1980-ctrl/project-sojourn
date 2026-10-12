'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const pilot = fs.readFileSync(
  path.join(root, 'src/systems/combat/combat-exchange-pilot.ts'),
  'utf8'
);
const controller = fs.readFileSync(
  path.join(root, 'src/systems/combat/combat-exchange-controller.ts'),
  'utf8'
);
assert(
  pilot.includes("action === 'frontal_pass' ? 0 : separation"),
  'frontal approach avoids flanking offset'
);
assert(controller.includes('forwardSpeed >= 0'), 'boost refuses reversed velocity');
assert(controller.includes('aligned > range * 0.92'), 'boost requires forward orientation');
console.log('PASS frontal approach alignment guards');
