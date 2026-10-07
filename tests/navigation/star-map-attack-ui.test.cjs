'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const panel = fs.readFileSync(path.join(root, 'src/ui/map/star-map-panel.ts'), 'utf8');
const input = fs.readFileSync(path.join(root, 'src/ui/map/star-map-input.ts'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/ui/map/topdown-map-renderer.ts'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');

assert(panel.includes('ANGREIFEN'), 'selected NPC contacts must expose an attack action');
assert(panel.includes('onAttackNpc'), 'star map panel must dispatch NPC attack actions');
assert(input.includes('pickContact'), 'star map input must select moving ship contacts');
assert(renderer.includes("kind: 'npc'"), 'NPC ship sprites must own hit areas');
assert(renderer.includes('drawPursuitLine'), 'active pursuit must be visible on the star map');
assert(
  controller.includes('createStarMapEngagementService') &&
    controller.includes('mountControllerCombat'),
  'controller must connect pursuit contact to combat scene'
);

console.log('PASS star map NPC selection, attack UI and combat transition wiring');
