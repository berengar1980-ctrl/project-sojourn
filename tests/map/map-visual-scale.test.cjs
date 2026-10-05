'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const renderer = fs.readFileSync(path.join(root, 'src/ui/map/topdown-map-renderer.ts'), 'utf8');

assert(
  renderer.includes(
    "if (location.kind === 'moon') return Math.min(12, Math.max(4, location.radius * 0.65));"
  ),
  'moon symbols must stay subordinate to planets'
);
assert(
  renderer.includes('return Math.min(30, Math.max(8, location.radius * 0.55));'),
  'planet symbols must stay compact while preserving size differences'
);

console.log('PASS star-map body size hierarchy');
