'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/systems/navigation/route-planner.ts'), 'utf8');

assert(source.includes('export function planRoute'), 'route planner API missing');
assert(source.includes('Math.hypot'), 'route distance must derive from world coordinates');
assert(!source.includes('Canvas'), 'navigation must be renderer-independent');
assert(!source.includes('document.'), 'navigation must not depend on DOM');

console.log('PASS route-planner boundary');
