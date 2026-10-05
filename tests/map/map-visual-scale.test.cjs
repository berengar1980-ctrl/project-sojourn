'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const renderer = fs.readFileSync(path.join(root, 'src/ui/map/topdown-map-renderer.ts'), 'utf8');

assert(
  renderer.includes(
    "if (location.kind === 'moon') return Math.min(20, Math.max(5, location.radius * 0.9));"
  ),
  'moon symbols must preserve visibly different body sizes'
);
assert(
  renderer.includes("return Math.min(70, Math.max(12, location.radius * 0.75));"),
  'planet symbols must preserve strong visual size differences'
);

console.log('PASS star-map body size hierarchy');
