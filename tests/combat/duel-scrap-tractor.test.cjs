'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');
const root = path.resolve(__dirname, '../..');
const { createDuelArena } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/duel-arena-presets.ts'
);
const { maybeLaunchTractorAsteroid, advanceThrownAsteroids } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-tractor-asteroid-throw.ts'
);
const { nativeCombatAsteroids } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-asteroid-motion.ts'
);
const scrapPresetSource = readModuleSource(root, 'src/systems/combat/duel-scrap-presets.ts');
assert(
  scrapPresetSource.includes("piece.kind === 'resource'"),
  'PvP obstacle and weapon-cover classification must match the asteroid map resource rule'
);

for (const seed of [1, 53, 415, 9001]) {
  const moderate = createDuelArena('scrap_scattered', seed);
  const dense = createDuelArena('scrap_field', seed);
  assert.deepEqual(
    createDuelArena('scrap_field', seed),
    dense,
    'same seed must produce identical scrap and wreck layouts'
  );
  assert(
    dense.asteroids.length > moderate.asteroids.length * 2,
    'dense map needs substantially more wrecks'
  );
  assert(
    moderate.asteroids.some((rock) => rock.sectionVariant),
    'moderate wreck field must contain recognizable large ship sections'
  );
  assert(
    dense.asteroids.some((rock) => rock.sectionVariant),
    'dense wreck field must contain large open 3D ship sections'
  );
  assert(
    dense.asteroids.filter((rock) => rock.debrisVariant).length >= 70,
    'dense field must preserve the eight procedural 3D fragment meshes'
  );
  assert(
    dense.asteroids.filter((rock) => rock.kind === 'resource').length >= 5,
    'several large wrecks must serve as actual cover and physical obstacles'
  );
  for (const map of [moderate, dense]) {
    // Compare the asteroid preset's built-in combat spawn convention. The
    // salvage arena used to start 0.35 / 0.65 instead of 0.28 / 0.72.
    assert.deepEqual(
      map.attackerPosition,
      {
        x: map.width * 0.28,
        y: map.height * 0.46,
      },
      'attacker starts at the same position fraction as the asteroid map'
    );
    assert.deepEqual(
      map.defenderPosition,
      {
        x: map.width * 0.72,
        y: map.height * 0.54,
      },
      'defender starts at the same position fraction as the asteroid map'
    );
    assert(
      map.asteroids.every(
        (rock) =>
          rock.position.x > rock.radius &&
          rock.position.x < map.width - rock.radius &&
          rock.position.y > rock.radius &&
          rock.position.y < map.height - rock.radius
      ),
      'all objects must spawn inside map bounds'
    );
    const ids = map.asteroids.map((rock) => rock.id);
    assert.equal(new Set(ids).size, ids.length, 'scrap model IDs must be unique');
    const physicalScrap = nativeCombatAsteroids(map);
    assert.equal(
      physicalScrap.length,
      map.asteroids.length,
      'every small scrap fragment remains a physical object in PvP'
    );
    assert(
      physicalScrap.some((rock) => rock.kind === 'debris' && !rock.routeBlocking),
      'small PvP scrap has collisions but never requests a navigation detour'
    );
    assert(
      physicalScrap.every((rock) =>
        rock.kind === 'resource' ? rock.routeBlocking : !rock.routeBlocking
      ),
      'only large ship sections are route blockers, even if small debris is physically solid'
    );
    assert(
      map.obstacles.every((obstacle) =>
        map.asteroids.some(
          (rock) =>
            rock.id === obstacle.id && rock.kind === 'resource' && rock.radius === obstacle.radius
        )
      ),
      'only large hull sections block routes'
    );
    for (const [side, spawn] of [
      ['attacker', map.attackerPosition],
      ['defender', map.defenderPosition],
    ]) {
      assert(spawn, 'actual duel ' + side + ' must have a known spawn location');
      const available = map.asteroids.filter(
        (rock) =>
          rock.debrisVariant &&
          rock.radius >= 5 &&
          rock.radius <= 35 &&
          Math.hypot(rock.position.x - spawn.x, rock.position.y - spawn.y) <= 450
      );
      assert(
        available.length >= 2,
        'each ship must start with multiple genuine throwable 3D fragments in tractor range'
      );
      assert(
        !map.obstacles.some(
          (obstacle) =>
            Math.hypot(obstacle.position.x - spawn.x, obstacle.position.y - spawn.y) <
            obstacle.radius + 145
        ),
        'heavy wrecks must respect the asteroid-map 145 m spawn clearance'
      );
    }
  }
}

const arena = createDuelArena('scrap_scattered', 4242);
const actor = {
  position: { ...arena.attackerPosition },
  velocity: { x: 0, y: 0 },
  shieldHp: 0,
  hullHp: 300,
  tactic: 'fight',
  subsystems: { tractor: 100 },
  setup: {
    name: 'PvP salvager',
    tractorRangeMeters: 500,
    shieldGeometry: { radiusX: 28, radiusY: 20 },
  },
};
const enemy = {
  ...actor,
  // Simulate reaching tractor engagement range AFTER the normal starts,
  // instead of assuming both ships spawn less than 1200 m apart.
  position: { x: actor.position.x + 650, y: actor.position.y },
  shieldHp: 80,
  hullHp: 300,
  velocity: { x: 0, y: 0 },
};
const runtime = {
  arena,
  attacker: actor,
  defender: enemy,
  thrownAsteroids: [],
  elapsedSeconds: 0,
  combatLog: [],
  impactSerial: 0,
};
const initialCount = arena.asteroids.length;
maybeLaunchTractorAsteroid(runtime, 'attacker', actor, enemy);
assert.equal(
  runtime.thrownAsteroids.length,
  1,
  'real seeded PvP scrap must be capturable by existing tractor mechanic'
);
assert.equal(
  arena.asteroids.length,
  initialCount - 1,
  'captured mesh must be removed from the drifting field exactly once'
);
const projectile = runtime.thrownAsteroids[0];
assert(
  projectile.debrisVariant || projectile.containerVariant || projectile.sectionVariant,
  'captured projectile must keep its original 3D wreck model, not turn into an asteroid sprite'
);
assert(
  projectile.rotation3d && typeof projectile.effectSeed === 'number',
  'rotation and visual damage seed must follow the captured wreck'
);
for (let frame = 0; frame < 9; frame++) advanceThrownAsteroids(runtime, 0.08);
assert.equal(runtime.thrownAsteroids[0].phase, 'charge');
for (let frame = 0; frame < 11; frame++) advanceThrownAsteroids(runtime, 0.08);
assert.equal(runtime.thrownAsteroids[0].phase, 'flight');

const visuals = readModuleSource(root, 'src/ui/combat/combat-scrap-renderer.ts');
const battlefield = readModuleSource(root, 'src/ui/combat/strategic-combat-renderer.ts');
const lobby = readModuleSource(root, 'src/ui/start/duel-lobby.ts');
assert(
  !lobby.includes('Traktor-Test: Startschilde deaktivieren') &&
    !lobby.includes('tractorTestCheckbox') &&
    !lobby.includes('setups.map((setup) => ({ ...setup, shieldHp: 0 }))'),
  'PvP wrecks must NEVER silently start either ship with 0 shields'
);
assert(
  lobby.includes('setups[0]!') && lobby.includes('setups[1]!'),
  'the asteroid and scrap maps must receive unmodified ship combat setups'
);
assert(
  visuals.includes('drawSalvageDebris3d') &&
    visuals.includes('drawSalvageSection3d') &&
    visuals.includes('drawSalvageContainer3d'),
  'PvP must reuse all existing salvage geometry, not draw generic rocks'
);
assert(
  /drawCombatScrap\s*\(\s*(?:this\.)?context\s*,/.test(battlefield),
  'tractor projectiles must render the captured 3D mesh during throw'
);
console.log(
  'PASS seeded PvP moderate/dense 3D scrap arenas and real tractor capture, charge and throw'
);
