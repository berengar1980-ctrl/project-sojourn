'use strict';

const { readModuleSource } = require('../module-source.cjs');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const lighting = fs.readFileSync(path.join(root, 'src/ui/ships/ship-lighting-renderer.ts'), 'utf8');
const local = readModuleSource(root, 'src/ui/local-space/local-space-renderer.ts');
const salvage = readModuleSource(root, 'src/ui/salvage/salvage-space-renderer.ts');
const combat = fs.readFileSync(
  path.join(root, 'src/ui/combat/fleet-native-combat-renderer.ts'),
  'utf8'
);
const combatDetails = fs.readFileSync(
  path.join(root, 'src/ui/combat/combat-ship-detail-renderer.ts'),
  'utf8'
);
const playerMap = fs.readFileSync(path.join(root, 'src/ui/map/player-ship-renderer.ts'), 'utf8');
const npcMap = fs.readFileSync(path.join(root, 'src/ui/map/npc-ship-map-renderer.ts'), 'utf8');

assert(lighting.includes('directionalStrength?: number'));
assert(lighting.includes('options.directionalStrength ?? 1'));
const fieldShip = readModuleSource(root, 'src/ui/ships/field-ship-sprite.ts');
for (const field of [local, salvage]) {
  assert(field.includes('directionalStrength: 2.05'), 'field player lighting');
  assert(field.includes('drawFieldShipSprite('), 'field NPC lighting uses the shared painter');
}
assert(fieldShip.includes('directionalStrength: 2.05'));
assert(combat.includes('drawCombatShipBody('));
assert(combatDetails.includes('directionalStrength: 2.05'));
assert(!playerMap.includes('directionalStrength: 2.05'));
assert(!npcMap.includes('directionalStrength: 2.05'));

console.log('PASS stronger ship lighting is limited to local/salvage/combat maps');
