'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { DUEL_MAPS, createDuelArena } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/duel-arena-presets.ts'
);
assert.deepEqual(
  DUEL_MAPS.map((entry) => entry.id),
  ['empty', 'scattered', 'asteroid_field', 'scrap_scattered', 'scrap_field']
);
const empty = createDuelArena('empty', 1001);
const sparse = createDuelArena('scattered', 1001);
const dense = createDuelArena('asteroid_field', 1001);
const scrapModerate = createDuelArena('scrap_scattered', 1001);
const scrapDense = createDuelArena('scrap_field', 1001);
assert(
  scrapModerate.asteroids.length >= 25 && scrapModerate.asteroids.length < 65,
  'moderate scrap map offers a manageable number of drifting 3D parts'
);
assert(
  scrapDense.asteroids.length > scrapModerate.asteroids.length * 2,
  'dense scrap map has at least twice the moderate number of parts'
);
assert(
  scrapDense.asteroids.some((part) => part.sectionVariant),
  'dense scrap field includes full-size modular 3D ship wrecks'
);
assert(
  scrapModerate.asteroids.some((part) => part.debrisVariant),
  'moderate scrap field includes 3D tractor-throwable fragments'
);
assert(
  scrapDense.asteroids.filter((part) => part.kind === 'resource').length >= 5,
  'dense map provides several heavy large-section obstacles'
);
assert.deepEqual(
  createDuelArena('scrap_field', 1001),
  scrapDense,
  'PvP wreck field must be deterministic per seed'
);
assert.equal(empty.obstacles.length, 0, 'empty map stays clear');
assert.equal(empty.asteroids.length, 0, 'empty map contains no drawn asteroids');
assert(
  dense.asteroids.some((rock) => rock.kind === 'debris'),
  'dense field includes native debris'
);
assert(
  dense.asteroids.some((rock) => rock.kind === 'resource'),
  'dense field includes native mining rocks'
);
assert(dense.asteroids.length > dense.obstacles.length, 'small debris is visual only');
assert(sparse.obstacles.length > 5, 'scattered map contains obstacles');
assert(
  dense.obstacles.length > sparse.obstacles.length * 3,
  'dense map contains substantially more native rocks'
);
assert(
  dense.width * dense.height < sparse.width * sparse.height * 0.6,
  'dense preset packs native asteroids into a smaller playable region'
);
const middleRocks = dense.obstacles.filter(
  (rock) => rock.position.x > dense.width * 0.4 && rock.position.x < dense.width * 0.6
);
assert(middleRocks.length >= 10, 'dense asteroid field must fill the central corridor');
assert.deepEqual(createDuelArena('asteroid_field', 1001), dense, 'seed makes layouts reproducible');
for (const map of [sparse, dense]) {
  for (const asteroid of map.obstacles) {
    assert(asteroid.radius > 0);
    assert(asteroid.position.x > asteroid.radius);
    assert(asteroid.position.y > asteroid.radius);
    for (const spawn of [0.35, 0.65]) {
      assert(
        Math.hypot(asteroid.position.x - map.width * spawn, asteroid.position.y - map.height / 2) >
          asteroid.radius + (map === dense ? 145 : 340),
        'ship spawns have clearance'
      );
    }
  }
}
const arenaSource = fs.readFileSync(
  path.join(root, 'src/systems/combat/duel-arena-presets.ts'),
  'utf8'
);
const asteroidRenderer = fs.readFileSync(
  path.join(root, 'src/ui/combat/combat-asteroid-renderer.ts'),
  'utf8'
);
assert(arenaSource.includes('generateMiningSpace'), 'reuse mining field generator');
assert(asteroidRenderer.includes('ProceduralSpaceBodyRenderer'), 'reuse real asteroid renderer');
const lobby = fs.readFileSync(path.join(root, 'src/ui/start/duel-lobby.ts'), 'utf8');
assert(lobby.includes('mapSelect.value as DuelMapKind'), 'selected map reaches simulation');
console.log('PASS five deterministic PvP combat maps including moderate and dense 3D scrap');
