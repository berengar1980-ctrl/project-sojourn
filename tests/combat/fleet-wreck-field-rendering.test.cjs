'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const painter = read('src/ui/combat/fleet-field-wreck-renderer.ts');
const renderer = read('src/ui/combat/fleet-native-combat-renderer.ts');
const mesh = read('src/ui/salvage/combat-wreck-mesh.ts');

assert.match(
  painter,
  /body\.id\.startsWith\('fleet-wreck:'\)/,
  'custom fields draw only physical native fleet wrecks'
);
assert.match(
  painter,
  /Boolean\(body\.combatWreckVariant\)/,
  'custom fields use genuine combat hull geometry'
);
assert.match(
  painter,
  /drawCombatAsteroids\(renderer, fleetWrecks, scale, project, context, timeSeconds\)/,
  'custom fields reuse the existing asteroid/salvage painter'
);
assert.match(
  renderer,
  /this\.drawField\(width, height, timeSeconds\);\s*drawFleetFieldWrecks\(/,
  'custom FleetCombat backdrop paints newly destroyed ships as wrecks'
);
assert.match(
  renderer,
  /else this\.drawArena\(width, height, timeSeconds\)/,
  'ordinary combat maps retain the original single wreck painting pass'
);
assert.match(
  mesh,
  /const visibleRadius = radius \* \(2 \/ 3\)/,
  'only displayed hulls and fragments shrink; collision radii remain unchanged'
);
console.log('PASS FleetCombat wreck visibility and two-thirds visual scale');
