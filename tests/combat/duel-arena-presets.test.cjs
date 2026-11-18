'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (p) => loadStandaloneTypeScriptModule(root, p);

const { DUEL_MAPS, createDuelArena } = load('src/systems/combat/duel-arena-presets.ts');
const { generateMiningSpace } = load('src/systems/local-space/local-space-generator.ts');
const { generateSalvageField } = load('src/systems/salvage/salvage-field-generator.ts');

assert.deepEqual(
  DUEL_MAPS.map((entry) => entry.id),
  ['empty', 'scattered', 'asteroid_field', 'scrap_scattered', 'scrap_field']
);
const empty = createDuelArena('empty', 1001);
assert.deepEqual(empty.asteroids, []);
assert.deepEqual(empty.obstacles, []);
assert.equal(
  fs.existsSync(path.join(root, 'src/systems/combat/duel-scrap-presets.ts')),
  false,
  'standalone PvP map generator has been removed'
);

function verifySpawns(arena) {
  assert(arena.attackerPosition && arena.defenderPosition);
  const distance = Math.hypot(
    arena.attackerPosition.x - arena.defenderPosition.x,
    arena.attackerPosition.y - arena.defenderPosition.y
  );
  assert(distance >= 900, 'starting combatants must be separated');
  for (const point of [arena.attackerPosition, arena.defenderPosition]) {
    for (const rock of arena.asteroids) {
      assert(
        Math.hypot(point.x - rock.position.x, point.y - rock.position.y) >=
          rock.radius + (rock.kind === 'resource' ? 145 : 65),
        'spawn clearance must not change the existing map'
      );
    }
  }
}

function verifyMining(kind, seed, density) {
  const field = generateMiningSpace('duel', seed, undefined, density);
  const arena = createDuelArena(kind, seed);
  assert.equal(arena.width, field.width);
  assert.equal(arena.height, field.height);
  assert.equal(arena.backdropSeed, field.seed);
  assert.equal(arena.asteroids.length, field.asteroids.length);
  for (const [i, rock] of field.asteroids.entries()) {
    const visual = arena.asteroids[i];
    assert.equal(visual.id, rock.id);
    assert.deepEqual(visual.position, rock.position);
    assert.equal(visual.radius, rock.radius);
    assert.equal(visual.rotation, rock.rotation);
    assert.deepEqual(visual.velocity, rock.physics.velocity);
    assert.equal(visual.collisionRadius, rock.collisionRadius);
  }
  assert.deepEqual(
    arena.obstacles.map((obstacle) => obstacle.id),
    field.asteroids.filter((rock) => rock.routeBlocking).map((rock) => rock.id)
  );
  verifySpawns(arena);
  assert.deepEqual(createDuelArena(kind, seed), arena);
  return arena;
}

function verifySalvage(kind, seed, density) {
  const field = generateSalvageField('duel', seed, 2, density);
  const arena = createDuelArena(kind, seed);
  assert.equal(arena.width, field.width);
  assert.equal(arena.height, field.height);
  assert.equal(arena.backdropSeed, field.seed);
  assert.equal(arena.asteroids.length, field.wrecks.length + field.debris.length);
  const byId = new Map(arena.asteroids.map((rock) => [rock.id, rock]));
  assert.equal(byId.size, arena.asteroids.length);
  for (const part of [...field.wrecks, ...field.debris]) {
    const visual = byId.get(part.id);
    assert(visual, 'missing native map object ' + part.id);
    assert.deepEqual(visual.position, part.position);
    assert.equal(visual.radius, part.radius);
    assert.deepEqual(visual.velocity, part.driftVelocity);
    assert.equal(visual.rotation, part.rotation3d.z);
    assert.equal(visual.debrisVariant, part.debrisVariant ?? part.variant);
    assert.equal(visual.sectionVariant, part.sectionVariant);
    assert.equal(visual.containerVariant, part.containerVariant);
    assert.equal(visual.effectSeed, part.effectSeed);
    assert(visual.collisionRadius > 0);
  }
  assert(
    arena.obstacles.every((obstacle) => byId.get(obstacle.id)?.sectionVariant),
    'only large structural hulls obstruct routes'
  );
  verifySpawns(arena);
  assert.deepEqual(createDuelArena(kind, seed), arena);
  return arena;
}

for (const seed of [1, 53, 415, 1001, 4242, 9001]) {
  const scattered = verifyMining('scattered', seed, 'sparse');
  const dense = verifyMining('asteroid_field', seed, 'standard');
  assert(dense.asteroids.length > scattered.asteroids.length * 3);
  const moderate = verifySalvage('scrap_scattered', seed, 'moderate');
  const wrecks = verifySalvage('scrap_field', seed, 'standard');
  assert(wrecks.asteroids.length > moderate.asteroids.length * 2);
  assert(moderate.asteroids.some((rock) => rock.debrisVariant));
  assert(wrecks.asteroids.some((rock) => rock.sectionVariant));
}
assert.deepEqual(
  generateMiningSpace('duel', 1001),
  generateMiningSpace('duel', 1001, undefined, 'standard')
);
assert.deepEqual(
  generateSalvageField('duel', 1001, 2),
  generateSalvageField('duel', 1001, 2, 'standard')
);
const lobby = fs.readFileSync(path.join(root, 'src/ui/start/duel-lobby.ts'), 'utf8');
assert(lobby.includes('mapSelect.value as DuelMapKind'));
console.log('PASS native campaign mining and salvage maps in all five duel presets');
