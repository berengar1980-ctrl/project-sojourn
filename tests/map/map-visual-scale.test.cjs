'use strict';

const { readModuleSource } = require('../module-source.cjs');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const renderer = readModuleSource(root, 'src/ui/map/topdown-map-renderer.ts');
const scale = readModuleSource(root, 'src/ui/map/map-visual-scale.ts');
const camera = fs.readFileSync(path.join(root, 'src/ui/map/map-camera.ts'), 'utf8');

assert(scale.includes("location.kind === 'moon'"), 'moon symbols must stay subordinate to planets');
assert(
  scale.includes('Math.min(30, Math.max(8, location.radius * 0.55))'),
  'planet symbols must stay compact while preserving size differences'
);
assert(
  renderer.includes('mapLocationVisualRadius(location, this.camera.getRelativeZoom())'),
  'planet rendering and ship-ring projection must share exactly the same symbol radius'
);
assert(
  camera.includes('const MAX_RELATIVE_ZOOM = 4.6;') &&
    camera.includes('this.maximumZoom = fitZoom * MAX_RELATIVE_ZOOM;'),
  'star-map zoom must stop before spacing changes outlive useful symbol growth'
);
assert(
  renderer.includes("'rgba(129, 151, 174, .026)'") &&
    renderer.includes("'rgba(129, 151, 174, .12)'"),
  'orbit guides must stay faint except for the selected or current world'
);

console.log('PASS star-map body size hierarchy and useful zoom range');
