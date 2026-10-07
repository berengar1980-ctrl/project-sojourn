'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const lighting = fs.readFileSync(
  path.join(root, 'src/ui/ships/ship-lighting-renderer.ts'),
  'utf8'
);
const local = fs.readFileSync(
  path.join(root, 'src/ui/local-space/local-space-renderer.ts'),
  'utf8'
);
const salvage = fs.readFileSync(
  path.join(root, 'src/ui/salvage/salvage-space-renderer.ts'),
  'utf8'
);
const combat = fs.readFileSync(
  path.join(root, 'src/ui/combat/strategic-combat-renderer.ts'),
  'utf8'
);
const playerMap = fs.readFileSync(
  path.join(root, 'src/ui/map/player-ship-renderer.ts'),
  'utf8'
);
const npcMap = fs.readFileSync(
  path.join(root, 'src/ui/map/npc-ship-map-renderer.ts'),
  'utf8'
);

assert(lighting.includes('directionalStrength?: number'));
assert(lighting.includes('options.directionalStrength ?? 1'));
assert(local.match(/directionalStrength: 2\.05/g)?.length >= 2);
assert(salvage.match(/directionalStrength: 2\.05/g)?.length >= 2);
assert(combat.includes('directionalStrength: 2.05'));
assert(!playerMap.includes('directionalStrength: 2.05'));
assert(!npcMap.includes('directionalStrength: 2.05'));

console.log('PASS stronger ship lighting is limited to local/salvage/combat maps');
