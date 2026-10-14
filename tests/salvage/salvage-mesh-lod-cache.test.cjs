'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const lod = loadStandaloneTypeScriptModule(root, 'src/ui/salvage/salvage-mesh-lod-cache.ts');
const originalDocument = global.document;

let created = 0;
const draws = [];
const rotations = [];
function fakeContext() {
  return {
    translate() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    save() {},
    restore() {},
    rotate(angle) {
      rotations.push(angle);
    },
    drawImage(canvas) {
      draws.push(canvas);
    },
  };
}
global.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas');
    created += 1;
    return {
      width: 0,
      height: 0,
      getContext(type) {
        assert.equal(type, '2d');
        return fakeContext();
      },
    };
  },
};

const mesh = [
  {
    points: [
      [-1.5, -0.7, 0.2],
      [0.9, -0.7, 0.2],
      [0.9, 0.5, 0.2],
      [-1.5, 0.5, 0.2],
    ],
    normal: [0, 0, 1],
    color: [110, 130, 140],
  },
];
const scene = fakeContext();
try {
  assert(lod.drawCachedSalvageMesh(scene, 'corridor', mesh, 12, { x: 0.2, y: 0.1, z: 0.3 }, 192));
  assert.equal(created, 1);
  assert.equal(draws.length, 1);

  lod.drawCachedSalvageMesh(scene, 'corridor', mesh, 8, { x: 0.2, y: 0.1, z: 1.25 }, 192);
  assert.equal(created, 1, 'Z rotation and size changes must reuse one 3D view');
  assert.equal(draws[0], draws[1], 'same actual mesh raster is reused across objects');

  lod.drawCachedSalvageMesh(scene, 'corridor', mesh, 12, { x: 1.3, y: 0.1, z: 0 }, 192);
  assert.equal(created, 2, 'changed tumble tilt needs a new accurate mesh projection');

  lod.drawCachedSalvageMesh(scene, 'truss', mesh, 12, { x: 0.2, y: 0.1, z: 0 }, 192);
  assert.equal(created, 3, 'different shipwreck variants must never share one silhouette');

  lod.drawCachedSalvageMesh(scene, 'section:bridge', mesh, 12, { x: 0.2, y: 0.1, z: 0 }, 256);
  assert.equal(created, 4, 'large ship-room sections use a higher-resolution cached mesh');

  assert(
    rotations.some((rotation) => Math.abs(rotation + 1.25) < 0.001),
    'canvas rotates in the correct opposite screen-space direction'
  );
  assert.equal(draws.length, 5, 'every object must draw after the cache lookup');
} finally {
  global.document = originalDocument;
}

console.log('PASS salvage mesh LOD reuses actual type-specific 3D geometry at multiple angles');
