'use strict';

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
const local = fs.readFileSync(
  path.join(root, 'src/ui/local-space/local-space-renderer.ts'),
  'utf8'
);
const map = fs.readFileSync(path.join(root, 'src/ui/map/topdown-map-renderer.ts'), 'utf8');

assert(shared.includes('class ProceduralSpaceBodyRenderer'), 'shared body renderer must exist');
assert(shared.includes('asteroidSurfaceCache'), 'asteroid surfaces must be cached by seed');
assert(shared.includes('asteroidTextureCache'), 'asteroid textures must be cached');
assert(shared.includes('asteroidSpriteCache'), 'complete asteroid surface sprites must be cached');
assert(shared.includes('planetTextureCache'), 'planet textures must be cached');
assert(shared.includes('drawSphereLight'), 'world-fixed volume lighting pass must be shared');
assert(textures.includes('function fbm('), 'surface generation must use layered coherent noise');
assert(textures.includes('createPlanetTexture'), 'planets must use generated terrain textures');
assert(textures.includes('polarNoise'), 'planetary polar caps must use noise-distorted boundaries');
assert(textures.includes('polarEdge'), 'polar cap edge must not be a straight latitude cutoff');
assert(shared.includes('drawStaticCraterRelief'), 'crater relief must be pre-rendered into cached sprites');
assert(shared.includes('drawStaticFractures'), 'fractures must be pre-rendered into cached sprites');
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

console.log('PASS procedural planet and asteroid rendering contract');
