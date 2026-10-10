'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const scan = source('src/ui/salvage/salvage-distress-scan-effect.ts');
const renderer = source('src/ui/salvage/salvage-space-renderer.ts');
const tow = source('src/ui/salvage/distress-tow-renderer.ts');

assert(
  scan.includes('ship.nominalLengthMeters * pixelsPerMeter'),
  'distress ship must use its nominal ship length instead of wreck radius'
);
assert(
  renderer.includes('this.camera.scale(1)'),
  'salvage scene must pass camera scale to distress ship sprite'
);
assert(
  tow.includes('camera.scale(ship.nominalLengthMeters)'),
  'towed ship must retain real ship scale under zoom'
);
assert(!tow.includes('drawImage(image, -65'), 'towed ship must not use a fixed 130px sprite width');
console.log('PASS distress and towed ship use nominal length at the current camera scale');
