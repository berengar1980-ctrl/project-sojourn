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
assert(shared.includes('planetTextureCache'), 'planet textures must be cached');
assert(shared.includes('drawSphereLight'), 'world-fixed volume lighting pass must be shared');
assert(textures.includes('function fbm('), 'surface generation must use layered coherent noise');
assert(textures.includes('createPlanetTexture'), 'planets must use generated terrain textures');
assert(textures.includes('polarNoise'), 'planetary polar caps must use noise-distorted boundaries');
assert(textures.includes('polarEdge'), 'polar cap edge must not be a straight latitude cutoff');
assert(
  shared.includes('Math.pow(1 - progress, 1.35)'),
  'fractures must taper instead of ending hard'
);
assert(shared.includes('traceCraterShape'), 'craters must use irregular relief outlines');
assert(shared.includes('drawFractureSegment'), 'fractures must use tapered filled geometry');
assert(
  shared.includes('options.radius >= 14'),
  'small asteroids must skip expensive crater detail'
);
assert(shared.includes('options.radius >= 24'), 'fractures must use a higher-detail LOD threshold');
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
