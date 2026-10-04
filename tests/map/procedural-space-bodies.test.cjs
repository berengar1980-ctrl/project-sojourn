'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const shared = fs.readFileSync(
  path.join(root, 'src/ui/space/procedural-space-body-renderer.ts'),
  'utf8'
);
const local = fs.readFileSync(
  path.join(root, 'src/ui/local-space/local-space-renderer.ts'),
  'utf8'
);
const map = fs.readFileSync(path.join(root, 'src/ui/map/topdown-map-renderer.ts'), 'utf8');

assert(shared.includes('class ProceduralSpaceBodyRenderer'), 'shared body renderer must exist');
assert(shared.includes('asteroidCache'), 'asteroid surfaces must be cached by seed');
assert(shared.includes('planetTextureCache'), 'planet textures must be cached');
assert(shared.includes('drawWorldLight'), 'world-fixed lighting pass must be shared');
assert(
  shared.includes('Math.pow(1 - progress, 1.25)'),
  'fractures must taper instead of ending hard'
);
assert(shared.includes('5 + Math.floor(random() * 4)'), 'resource asteroids need several craters');
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

