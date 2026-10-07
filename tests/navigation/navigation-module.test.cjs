'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const index = fs.readFileSync(path.join(root, 'src/systems/navigation/index.ts'), 'utf8');
const service = fs.readFileSync(
  path.join(root, 'src/systems/navigation/navigation-service.ts'),
  'utf8'
);

assert(index.includes('createNavigationService'), 'navigation public API missing');
assert(index.includes('planRoute'), 'route planner must remain part of navigation');
assert(service.includes('setCruiseSpeed'), 'navigation must support switching ship cruise stats');
assert(
  service.includes('recoverToNearestDock'),
  'defeated player ships must recover to a dock instead of dying'
);
assert(!service.includes('document.'), 'navigation must not depend on DOM');
assert(!service.includes('Canvas'), 'navigation must not depend on renderer');

console.log('PASS navigation module boundary');
