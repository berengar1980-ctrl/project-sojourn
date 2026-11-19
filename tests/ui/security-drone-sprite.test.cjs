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
  const { drawLocalSecurityDrone, drawDroneShieldHits, localDroneShieldHits } = loadStandaloneTypeScriptModule(
    root,
    'src/ui/local-space/local-security-drone-visual.ts'
  );
  const calls = { angles: [], draws: [], translations: [], arcs: [] };
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    arc(...args) {
      calls.arcs.push(args);
    },
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
  drawLocalSecurityDrone(ctx, camera, drone, 900, 650, 8);
  drawLocalSecurityDrone(ctx, camera, drone, 900, 650, 16);
  assert.equal(calls.draws.length, 3, 'Sprite is drawn each frame');
  assert.deepEqual(
    calls.draws.map(({ x, y, width, height }) => [x, y, width, height]),
    [
      [-9, -9, 18, 18],
      [-9, -9, 18, 18],
      [-9, -9, 18, 18],
    ]
  );
  assert.equal(calls.draws[0].image.url, '/drones/security-drone-gc87r8.webp');
  relativeZoom = 2;
  drawLocalSecurityDrone(ctx, camera, drone, 900, 650, 17);
  assert.deepEqual(
    [calls.draws[3].x, calls.draws[3].y, calls.draws[3].width, calls.draws[3].height],
    [-18, -18, 36, 36],
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
  const shieldImpact = {
    id: 1,
    surfaceAnchor: { x: 0, y: 1 },
    ageSeconds: 0.1,
    lifetimeSeconds: 0.6,
    strength: 1,
  };
  assert.deepEqual(
    localDroneShieldHits([{ attacker: { id: 'pirate-1', shieldImpacts: [] }, defender: {
      id: 'security-drone:field-1', shieldImpacts: [shieldImpact],
    } }]),
    [shieldImpact],
    'Local NPC combat shield impacts must follow the drone rather than the world'
  );
  const beforeArcs = calls.arcs.length;
  drawDroneShieldHits(ctx, 120, 80, 11, [shieldImpact]);
  assert.equal(calls.arcs.length, beforeArcs + 1, 'A live shield hit paints a visible arc');
  assert.equal(calls.arcs.at(-1)[0], 120);
  assert.equal(calls.arcs.at(-1)[1], 80);
  drawDroneShieldHits(ctx, 120, 80, 11, [{ ...shieldImpact, ageSeconds: 0.7 }]);
  assert.equal(calls.arcs.length, beforeArcs + 1, 'Expired shield hits cannot linger');
  drawLocalSecurityDrone(ctx, camera, { ...drone, operational: false }, 900, 650, 4);
  assert.equal(calls.draws.length, 4, 'Destroyed drone is not rendered');
} finally {
  global.Image = originalImage;
}
console.log('PASS shared security drone sprite, 18px diameter, 16-second rotation and shield hits');
