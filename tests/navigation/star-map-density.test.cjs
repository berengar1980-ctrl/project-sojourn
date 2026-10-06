'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { narrowsSector } = loadStandaloneTypeScriptModule(
  root,
  'src/data/maps/narrows-sector.ts'
);

const count = (kind) => narrowsSector.locations.filter((location) => location.kind === kind).length;

assert.equal(count('planet'), 20, 'The Narrows should match Voidbound-scale planetary density');
assert.equal(count('moon'), 8, 'The Narrows should have eight moons like the Voidbound system');
assert.equal(
  count('asteroid-field'),
  8,
  'The Narrows should have eight asteroid fields like the Voidbound system'
);
assert.equal(count('station'), 15, 'The Narrows should carry a comparable station/shipyard density');
assert(
  narrowsSector.locations.filter((location) => location.kind === 'planet' && location.showOrbit)
    .length >= 10,
  'enough planetary orbits must remain visible to give the system spatial structure'
);

const xs = narrowsSector.locations.map((location) => location.position.x);
const ys = narrowsSector.locations.map((location) => location.position.y);
const aspect = (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys));
assert(
  aspect > 1.5,
  'top-down system layout should use a wide organic footprint instead of a tall compact cluster'
);

const cameraSource = fs.readFileSync(path.join(root, 'src/ui/map/map-camera.ts'), 'utf8');
const scaleSource = fs.readFileSync(path.join(root, 'src/ui/map/map-visual-scale.ts'), 'utf8');
const shipSource = fs.readFileSync(path.join(root, 'src/ui/map/player-ship-renderer.ts'), 'utf8');
const rendererSource = fs.readFileSync(
  path.join(root, 'src/ui/map/topdown-map-renderer.ts'),
  'utf8'
);

assert(
  cameraSource.includes('MIN_RELATIVE_ZOOM = 0.96') &&
    rendererSource.includes('this.contentBounds()'),
  'fully zoomed-out view must frame the actual system instead of shrinking it into empty space'
);
assert(
  scaleSource.includes("Math.pow(relativeZoom, 0.45)") &&
    shipSource.includes('BASE_SHIP_WIDTH = 15'),
  'strategic ship scale must remain much smaller than planets at close zoom'
);
assert(
  rendererSource.includes('drawLocationLabel') &&
    rendererSource.includes('roundRect'),
  'dense system labels must remain readable against the physical map'
);

console.log('PASS Voidbound-scale star-map density, framing and zoom proportions');
