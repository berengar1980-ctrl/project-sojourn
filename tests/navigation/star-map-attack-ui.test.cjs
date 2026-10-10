'use strict';

const { readModuleSource } = require('../module-source.cjs');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const panel = fs.readFileSync(path.join(root, 'src/ui/map/star-map-panel.ts'), 'utf8');
const input = fs.readFileSync(path.join(root, 'src/ui/map/star-map-input.ts'), 'utf8');
const renderer = readModuleSource(root, 'src/ui/map/topdown-map-renderer.ts');
const controller = readModuleSource(root, 'src/app/game-controller.ts');

assert(panel.includes('ANGREIFEN'), 'selected NPC contacts must expose an attack action');
assert(panel.includes('onAttackNpc'), 'star map panel must dispatch NPC attack actions');
assert(input.includes('pickContact'), 'star map input must select moving ship contacts');
assert(
  input.includes('event.clientX - rect.left') && input.includes('Math.hypot'),
  'star map click handling must tolerate small pointer jitter and use canvas-relative coordinates'
);
assert(renderer.includes("kind: 'npc'"), 'NPC ship sprites must own hit areas');
assert(
  renderer.includes("filter((area) => area.kind === 'npc')"),
  'NPC hit areas must win over overlapping planets, stations and fields'
);
assert(renderer.includes('drawPursuitLine'), 'active pursuit must be visible on the star map');
assert(
  controller.includes('createStarMapEngagementService') && controller.includes('mountCombatScene'),
  'controller must connect pursuit contact to combat scene'
);

console.log('PASS star map NPC selection, attack UI and combat transition wiring');
