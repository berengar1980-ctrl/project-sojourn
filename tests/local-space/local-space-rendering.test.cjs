'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const renderer = fs.readFileSync(
  path.join(root, 'src/ui/local-space/local-space-renderer.ts'),
  'utf8'
);
const panel = fs.readFileSync(path.join(root, 'src/ui/local-space/local-space-panel.ts'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');

assert(renderer.includes('drawMiningLasers'), 'local space must render mining lasers');
assert(renderer.includes('drawTractorFields'), 'local space must render tractor collection');
assert(renderer.includes('drawChunks'), 'local space must render broken asteroid chunks');
assert(renderer.includes('hardpoints.miningLasers'), 'mining lasers must use ship hardpoints');
assert(renderer.includes('hardpoints.engines'), 'engine glow must use ship hardpoints');
assert(panel.includes('ZUR STERNKARTE'), 'local space must provide return to star map');
assert(panel.includes('MINING'), 'asteroid selection must expose mining action');
assert(
  controller.includes("currentLocationId === 'greyrock-belt'"),
  'Greyrock arrival must enter local space'
);
assert(controller.includes('runSceneZoomTransition'), 'scene switch must use zoom transition');

console.log('PASS local-space UI, hardpoint rendering and transition contract');
