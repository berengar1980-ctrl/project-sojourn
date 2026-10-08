'use strict';

const { readModuleSource } = require('../module-source.cjs');

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const background = fs.readFileSync(
  path.join(root, 'src/ui/space/space-background-renderer.ts'),
  'utf8'
);
const starMap = readModuleSource(root, 'src/ui/map/topdown-map-renderer.ts');
const localSpace = readModuleSource(root, 'src/ui/local-space/local-space-renderer.ts');
const camera = fs.readFileSync(path.join(root, 'src/ui/map/map-camera.ts'), 'utf8');

assert(background.includes('drawMilkyWay'), 'space background must render a milky-way layer');
assert(background.includes('drawNebulae'), 'space background must render drifting nebulae');
assert(background.includes('NebulaLobe'), 'nebulae must be layered irregular cloud clusters');
assert(background.includes('globalCompositeOperation'), 'nebula lobes must blend into one cloud');
assert(
  !background.includes('context.ellipse'),
  'space nebula renderer must not draw obvious ellipse clouds'
);
assert(
  background.includes('nearStars') && background.includes('view, 0.62'),
  'shared background must include a strongly separated near-star parallax layer'
);
assert(
  background.includes('view, 0.36') && background.includes('const parallax = 0.24'),
  'mid stars and nebulae must move visibly during camera panning'
);
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
