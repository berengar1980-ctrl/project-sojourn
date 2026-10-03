'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const background = fs.readFileSync(
  path.join(root, 'src/ui/space/space-background-renderer.ts'),
  'utf8'
);
const starMap = fs.readFileSync(path.join(root, 'src/ui/map/topdown-map-renderer.ts'), 'utf8');
const localSpace = fs.readFileSync(
  path.join(root, 'src/ui/local-space/local-space-renderer.ts'),
  'utf8'
);
const camera = fs.readFileSync(path.join(root, 'src/ui/map/map-camera.ts'), 'utf8');

assert(background.includes('drawMilkyWay'), 'space background must render a milky-way layer');
assert(background.includes('drawNebulae'), 'space background must render drifting nebulae');
assert(background.includes('NebulaLobe'), 'nebulae must be layered irregular cloud clusters');
assert(background.includes('globalCompositeOperation'), 'nebula lobes must blend into one cloud');
assert(
  !background.includes('context.ellipse'),
  'space nebula renderer must not draw obvious ellipse clouds'
);
assert(background.includes('0.24'), 'mid-star layer must have visible parallax separation');
assert(background.includes('cameraCenter'), 'background must respond to camera position');
assert(background.includes('timeSeconds'), 'background must support slow time-based drift');
assert(starMap.includes('SpaceBackgroundRenderer'), 'star map must use shared space background');
assert(
  localSpace.includes('SpaceBackgroundRenderer'),
  'local space must use shared space background'
);
assert(camera.includes('getCenter'), 'camera must expose read-only center for parallax rendering');
assert(starMap.includes('Math.sin(timeSeconds * 1.25)'), 'star-map sun must pulse slowly');

console.log('PASS stronger parallax stars and layered nebula cloud rendering');
