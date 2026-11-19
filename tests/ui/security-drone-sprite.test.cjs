'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const spritePath = path.join(root, 'public/drones/security-drone-gc87r8.webp');
assert(fs.existsSync(spritePath), 'Drone sprite must be bundled as a public asset');
assert(fs.statSync(spritePath).size > 100, 'Drone sprite must contain image bytes');

const originalImage = global.Image;
class StubImage {
  complete = true;
  naturalWidth = 64;
  set src(url) {
    this.url = url;
  }
}
global.Image = StubImage;
try {
  const { drawLocalSecurityDrone } = loadStandaloneTypeScriptModule(
    root,
    'src/ui/local-space/local-security-drone-visual.ts'
  );
  const calls = { angles: [], draws: [], translations: [] };
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    arc() {},
    stroke() {},
    fill() {},
    setLineDash() {},
    translate(x, y) {
      calls.translations.push([x, y]);
    },
    rotate(angle) {
      calls.angles.push(angle);
    },
    drawImage(image, x, y, width, height) {
      calls.draws.push({ image, x, y, width, height });
    },
  };
  let relativeZoom = 1;
  const camera = {
    getRelativeZoom() {
      return relativeZoom;
    },
    worldToScreen() {
      return { x: 120, y: 80 };
    },
    scale(distance) {
      return distance;
    },
  };
  const drone = { operational: true, position: { x: 400, y: 200 }, scanRadius: 460 };
  drawLocalSecurityDrone(ctx, camera, drone, 900, 650, 0);
  drawLocalSecurityDrone(ctx, camera, drone, 900, 650, 4);
  drawLocalSecurityDrone(ctx, camera, drone, 900, 650, 8);
  assert.equal(calls.draws.length, 3, 'Sprite is drawn each frame');
  assert.deepEqual(
    calls.draws.map(({ x, y, width, height }) => [x, y, width, height]),
    [
      [-13, -13, 26, 26],
      [-13, -13, 26, 26],
      [-13, -13, 26, 26],
    ]
  );
  assert.equal(calls.draws[0].image.url, '/drones/security-drone-gc87r8.webp');
  relativeZoom = 2;
  drawLocalSecurityDrone(ctx, camera, drone, 900, 650, 9);
  assert.deepEqual(
    [calls.draws[3].x, calls.draws[3].y, calls.draws[3].width, calls.draws[3].height],
    [-26, -26, 52, 52],
    'Sprite must scale with viewport zoom'
  );
  assert(Math.abs(calls.angles[0]) < 1e-9);
  assert(Math.abs(calls.angles[1] - Math.PI) < 1e-9);
  assert(Math.abs(calls.angles[2] - Math.PI * 2) < 1e-9);
  assert.deepEqual(calls.translations.slice(0, 3), [
    [120, 80],
    [120, 80],
    [120, 80],
  ]);
  drawLocalSecurityDrone(ctx, camera, { ...drone, operational: false }, 900, 650, 4);
  assert.equal(calls.draws.length, 4, 'Destroyed drone is not rendered');
} finally {
  global.Image = originalImage;
}
console.log('PASS shared security drone sprite, 26px diameter and 8-second rotation');
