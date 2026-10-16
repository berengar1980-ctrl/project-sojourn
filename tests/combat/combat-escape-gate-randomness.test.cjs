'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { buildCombatArena } = loadStandaloneTypeScriptModule(
  path.resolve(__dirname, '../..'),
  'src/systems/combat/strategic-combat-arena.ts'
);

const fighter = { preferredTactic: 'fight' };
const arena = { width: 2600, height: 1500, obstacles: [] };
const margin = 160;
const sides = new Set();
const points = new Set();
for (let seed = 1; seed <= 256; seed += 1) {
  const first = buildCombatArena(fighter, fighter, seed, arena).exitPoint;
  const second = buildCombatArena(fighter, fighter, seed, arena).exitPoint;
  assert.deepEqual(first, second, 'same seed produces the same physical exit');
  assert(first, 'arena must provide an escape point');
  assert(first.x >= margin && first.x <= arena.width - margin);
  assert(first.y >= margin && first.y <= arena.height - margin);
  if (first.x === margin) sides.add('left');
  if (first.x === arena.width - margin) sides.add('right');
  if (first.y === margin) sides.add('top');
  if (first.y === arena.height - margin) sides.add('bottom');
  points.add(first.x.toFixed(3) + ':' + first.y.toFixed(3));
}
assert.equal(sides.size, 4, 'all four edges can generate an escape destination');
assert(points.size > 200, 'the exit is not restricted to a few fixed positions');

const preferred = { x: 160, y: 550 };
assert.deepEqual(
  buildCombatArena(fighter, fighter, 20, { ...arena, exitPoint: preferred }).exitPoint,
  preferred,
  'an explicitly supplied gate is never randomised'
);
const avoided = buildCombatArena(fighter, fighter, 30, {
  ...arena,
  obstacles: [{ id: 'entire-top', position: { x: 1300, y: 160 }, radius: 1000 }],
}).exitPoint;
assert(
  Math.hypot(avoided.x - 1300, avoided.y - 160) >= 1085,
  'seeded spawn retries avoid occupied escape points'
);
console.log('PASS deterministic random gates cover all four edges without relocating them');
