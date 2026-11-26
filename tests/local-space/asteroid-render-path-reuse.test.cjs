'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { ProceduralSpaceBodyRenderer } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/space/procedural-space-body-renderer.ts'
);
const { createAsteroidSurface } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/space/procedural-surface-textures.ts'
);

let currentPath = [];
const clips = [];
const strokes = [];
let depth = 0;
let clipActive = false;
let gradientCount = 0;
const saved = [];
const gradient = () => {
  gradientCount++;
  return { addColorStop() {} };
};
const context = {
  save() {
    saved.push(clipActive);
    depth++;
  },
  restore() {
    clipActive = saved.pop();
    depth--;
  },
  translate() {},
  rotate() {},
  drawImage() {},
  beginPath() {
    currentPath = [];
  },
  moveTo(...args) {
    currentPath.push(args);
  },
  quadraticCurveTo(...args) {
    currentPath.push(args);
  },
  closePath() {},
  clip() {
    clipActive = true;
    clips.push(currentPath);
  },
  stroke() {
    assert.equal(clipActive, false, 'rim must not be clipped');
    strokes.push(currentPath);
  },
  createLinearGradient: gradient,
  createRadialGradient: gradient,
  fillRect() {},
};

const renderer = new ProceduralSpaceBodyRenderer(context);
const options = {
  id: 'render-parity',
  kind: 'resource',
  x: 120,
  y: 80,
  radius: 20,
  rotation: 0.7,
  light: { x: -0.72, y: -0.56 },
};
// Seed the baked sprite cache: only the dynamic draw path is under test.
renderer.asteroidSpriteCache.set('render-parity:resource:normal', {});
renderer.asteroidSpriteCache.set('render-parity:resource:far', {});
function expectedPath(rotation) {
  const outline = createAsteroidSurface(options.id, options.kind).outline.map((point) => ({
    x: point.x * Math.cos(rotation) - point.y * Math.sin(rotation),
    y: point.x * Math.sin(rotation) + point.y * Math.cos(rotation),
  }));
  const first = outline[0];
  const last = outline.at(-1);
  const radius = options.radius;
  return [
    [(first.x + last.x) * 0.5 * radius, (first.y + last.y) * 0.5 * radius],
    ...outline.map((point, index) => {
      const next = outline[(index + 1) % outline.length];
      return [
        point.x * radius,
        point.y * radius,
        (point.x + next.x) * 0.5 * radius,
        (point.y + next.y) * 0.5 * radius,
      ];
    }),
  ];
}

for (const rotation of [0, 0.7, Math.PI]) {
  renderer.drawAsteroid({ ...options, rotation });
  assert.deepEqual(clips.at(-1), expectedPath(rotation));
  assert.strictEqual(strokes.at(-1), clips.at(-1), 'one contour must serve clip and stroke');
  assert.equal(depth, 0);
}
assert.equal(clips.length, 3);
assert.equal(strokes.length, 3);
assert.equal(gradientCount, 6);
renderer.drawAsteroid({ ...options, radius: 4 });
assert.equal(clips.length, 3, 'tiny debris LOD must stay unlit');
assert.equal(gradientCount, 6);
assert.equal(depth, 0);
console.log('PASS shared asteroid renderer reuses exact contours and preserves lighting passes');
