'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { DUEL_MAPS, createDuelArena } = loadStandaloneTypeScriptModule(
  root, 'src/systems/combat/duel-arena-presets.ts'
);
assert.deepEqual(DUEL_MAPS.map((entry) => entry.id), ['empty', 'scattered', 'asteroid_field']);
const empty = createDuelArena('empty', 1001);
const sparse = createDuelArena('scattered', 1001);
const dense = createDuelArena('asteroid_field', 1001);
assert.equal(empty.obstacles.length, 0, 'empty map stays clear');
assert(sparse.obstacles.length > 5, 'scattered map contains obstacles');
assert(dense.obstacles.length > sparse.obstacles.length, 'dense map has more asteroids');
assert.deepEqual(createDuelArena('asteroid_field', 1001), dense, 'seed makes layouts reproducible');
for (const map of [sparse, dense]) {
  for (const asteroid of map.obstacles) {
    assert(asteroid.radius > 0);
    assert(asteroid.position.x > asteroid.radius);
    assert(asteroid.position.y > asteroid.radius);
    for (const spawn of [0.35, 0.65]) {
      assert(
        Math.hypot(asteroid.position.x - map.width * spawn, asteroid.position.y - map.height / 2) >
          asteroid.radius + 340,
        'ship spawns have clearance'
      );
    }
  }
}
const lobby = fs.readFileSync(path.join(root, 'src/ui/start/duel-lobby.ts'), 'utf8');
assert(lobby.includes('mapSelect.value as DuelMapKind'), 'selected map reaches simulation');
console.log('PASS three selectable deterministic PvP combat maps');
