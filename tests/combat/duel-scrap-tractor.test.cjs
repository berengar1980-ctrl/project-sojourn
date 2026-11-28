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
const scrapPresetSource = readModuleSource(root, 'src/systems/combat/field-combat-arena.ts');
assert(
  scrapPresetSource.includes('.filter((asteroid) => asteroid.routeBlocking)'),
  'PvP obstacle classification must use the field body routeBlocking property'
);

for (const seed of [1, 53, 415, 9001]) {
  const moderate = createDuelArena('scrap_scattered', seed);
  const dense = createDuelArena('scrap_field', seed);
  assert.deepEqual(createDuelArena('scrap_field', seed), dense);
  assert(dense.asteroids.length > moderate.asteroids.length * 2);
  for (const map of [moderate, dense]) {
    assert(map.asteroids.some((rock) => rock.sectionVariant));
    assert(map.asteroids.some((rock) => rock.debrisVariant));
    assert.equal(new Set(map.asteroids.map((rock) => rock.id)).size, map.asteroids.length);
    const physical = nativeCombatAsteroids(map);
    assert.equal(physical.length, map.asteroids.length);
    assert(physical.some((rock) => rock.kind === 'debris' && !rock.routeBlocking));
    assert(
      physical.every(
        (rock) =>
          rock.routeBlocking === map.asteroids.find((entry) => entry.id === rock.id).routeBlocking
      )
    );
    assert(
      map.obstacles.every((obstacle) =>
        map.asteroids.some(
          (rock) =>
            rock.id === obstacle.id &&
            rock.routeBlocking &&
            (rock.collisionRadius ?? rock.radius) === obstacle.radius
        )
      )
    );
  }
}

const arena = createDuelArena('scrap_scattered', 4242);
const throwable = arena.asteroids.find(
  (rock) => rock.debrisVariant && rock.radius >= 5 && rock.radius <= 35
);
assert(throwable, 'native salvage field must supply throwable debris');
const actor = {
  // Approach a real fragment; the duel generator must not add practice objects.
  position: { x: throwable.position.x - 180, y: throwable.position.y },
  velocity: { x: 0, y: 0 },
  shieldHp: 0,
  hullHp: 300,
  tactic: 'fight',
  subsystems: { tractor: 100 },
  setup: {
    name: 'PvP salvager',
    tractorRangeMeters: 500,
    tractorCanManipulateObjects: true,
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
const battlefield = readModuleSource(root, 'src/ui/combat/combat-native-weapon-painters.ts');
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
  /drawCombatScrap\s*\(\s*ctx\s*,/.test(battlefield),
  'tractor projectiles must render the captured 3D mesh during throw'
);
console.log(
  'PASS seeded PvP moderate/dense 3D scrap arenas and real tractor capture, charge and throw'
);
