'use strict';

const { readModuleSource } = require('../module-source.cjs');

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const shared = fs.readFileSync(
  path.join(root, 'src/ui/space/procedural-space-body-renderer.ts'),
  'utf8'
);
const textures = fs.readFileSync(
  path.join(root, 'src/ui/space/procedural-surface-textures.ts'),
  'utf8'
);
const local = readModuleSource(root, 'src/ui/local-space/local-space-renderer.ts');
const map = readModuleSource(root, 'src/ui/map/topdown-map-renderer.ts');

assert(shared.includes('class ProceduralSpaceBodyRenderer'), 'shared body renderer must exist');
assert(shared.includes('asteroidSurfaceCache'), 'asteroid surfaces must be cached by seed');
assert(
  shared.includes('context.drawImage(texture, -radius, -radius, size, size)') &&
    shared.includes('this.asteroidSpriteCache.set(key, canvas)'),
  'asteroid textures must be baked into cached sprites'
);
assert(shared.includes('asteroidSpriteCache'), 'complete asteroid surface sprites must be cached');
assert(shared.includes('planetTextureCache'), 'planet textures must be cached');
assert(shared.includes('drawSphereLight'), 'world-fixed volume lighting pass must be shared');
assert(textures.includes('function fbm('), 'surface generation must use layered coherent noise');
assert(textures.includes('createPlanetTexture'), 'planets must use generated terrain textures');
assert(
  textures.includes('polarCoast'),
  'planetary polar caps must use broad irregular coast noise'
);
assert(textures.includes('polarFjords'), 'planetary polar caps must add smaller coastline breakup');
assert(textures.includes('polarEdge'), 'polar cap edge must not be a straight latitude cutoff');
assert(
  shared.includes('drawStaticCraterRelief'),
  'crater relief must be pre-rendered into cached sprites'
);
assert(
  shared.includes('drawStaticFractures'),
  'fractures must be pre-rendered into cached sprites'
);
assert(
  shared.includes('context.drawImage(\n      sprite'),
  'per-frame asteroid drawing must reuse cached surface sprites'
);
assert(local.includes('ProceduralSpaceBodyRenderer'), 'local space must use shared body renderer');
assert(
  local.includes('light: { x: -0.72, y: -0.56 }'),
  'local asteroid light must stay world-fixed'
);
assert(
  map.includes('starPoint.x - point.x'),
  'map bodies must be lit from the actual star direction'
);
assert(
  map.includes('drawAsteroidField(location.id'),
  'map asteroid fields must use procedural bodies'
);
assert(map.includes('this.spaceBodies.drawPlanet'), 'map planets must use procedural rendering');

// Exercise the actual cache-miss and cache-hit paths, not just a field name.
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const texturePath = 'src/ui/space/procedural-surface-textures.ts';
const surfaceModule = loadStandaloneTypeScriptModule(root, texturePath);
let textureBuilds = 0;
const { ProceduralSpaceBodyRenderer } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/space/procedural-space-body-renderer.ts',
  {
    [texturePath]: {
      ...surfaceModule,
      createAsteroidTexture() {
        textureBuilds++;
        return {};
      },
    },
  }
);
const context = {
  save() {},
  restore() {},
  translate() {},
  beginPath() {},
  moveTo() {},
  quadraticCurveTo() {},
  closePath() {},
  clip() {},
  drawImage() {},
};
global.document = {
  createElement: () => ({ getContext: () => context }),
};
try {
  const renderer = new ProceduralSpaceBodyRenderer(context);
  const first = renderer.asteroidSprite('cache-test', 'debris', 'normal');
  assert.equal(textureBuilds, 1);
  assert.strictEqual(renderer.asteroidSprite('cache-test', 'debris', 'normal'), first);
  assert.equal(textureBuilds, 1, 'cache hit must not regenerate the texture');
  const near = renderer.asteroidSprite('cache-test', 'debris', 'near');
  assert.notStrictEqual(near, first);
  assert.equal(textureBuilds, 2);
  assert.strictEqual(renderer.asteroidSprite('cache-test', 'debris', 'near'), near);
  assert.notStrictEqual(renderer.asteroidSprite('other-seed', 'debris', 'normal'), first);
  assert.equal(textureBuilds, 3);
} finally {
  delete global.document;
}

console.log('PASS procedural planet and asteroid rendering contract');
