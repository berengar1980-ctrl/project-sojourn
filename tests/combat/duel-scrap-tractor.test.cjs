'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');
const root = path.resolve(__dirname, '../..');
const { createDuelArena } = loadStandaloneTypeScriptModule(
  root, 'src/systems/combat/duel-arena-presets.ts');
const { maybeLaunchTractorAsteroid, advanceThrownAsteroids } = loadStandaloneTypeScriptModule(
  root, 'src/systems/combat/combat-tractor-asteroid-throw.ts');

for (const seed of [1, 53, 415, 9001]) {
  const moderate = createDuelArena('scrap_scattered', seed);
  const dense = createDuelArena('scrap_field', seed);
  assert.deepEqual(createDuelArena('scrap_field', seed), dense,
    'same seed must produce identical scrap and wreck layouts');
  assert(dense.asteroids.length > moderate.asteroids.length * 2,
    'dense map needs substantially more wrecks');
  assert(moderate.asteroids.some((rock) => rock.sectionVariant),
    'moderate wreck field must contain recognizable large ship sections');
  assert(dense.asteroids.some((rock) => rock.sectionVariant),
    'dense wreck field must contain large open 3D ship sections');
  assert(dense.asteroids.filter((rock) => rock.debrisVariant).length >= 70,
    'dense field must preserve the eight procedural 3D fragment meshes');
  assert(dense.asteroids.filter((rock) => rock.kind === 'resource').length >= 5,
    'several large wrecks must serve as actual cover and physical obstacles');
  for (const map of [moderate, dense]) {
    assert(map.asteroids.every((rock) =>
      rock.position.x > rock.radius && rock.position.x < map.width - rock.radius &&
      rock.position.y > rock.radius && rock.position.y < map.height - rock.radius
    ), 'all objects must spawn inside map bounds');
    const ids = map.asteroids.map((rock) => rock.id);
    assert.equal(new Set(ids).size, ids.length, 'scrap model IDs must be unique');
    assert(map.obstacles.every((obstacle) =>
      map.asteroids.some((rock) => rock.id === obstacle.id &&
        rock.kind === 'resource' && rock.radius === obstacle.radius)
    ), 'only large hull sections block routes');
    for (const [side, spawn] of [
      ['attacker', map.attackerPosition],
      ['defender', map.defenderPosition],
    ]) {
      assert(spawn, 'actual duel ' + side + ' must have a known spawn location');
      const available = map.asteroids.filter((rock) =>
        rock.debrisVariant &&
        rock.radius >= 5 && rock.radius <= 35 &&
        Math.hypot(rock.position.x-spawn.x, rock.position.y-spawn.y) <= 450
      );
      assert(available.length >= 2,
        'each ship must start with multiple genuine throwable 3D fragments in tractor range');
      assert(!map.obstacles.some((obstacle) =>
        Math.hypot(obstacle.position.x-spawn.x, obstacle.position.y-spawn.y)
          < obstacle.radius+145),
        'heavy wrecks may not obstruct ship spawn immediately');
    }
  }
}

const arena = createDuelArena('scrap_scattered', 4242);
const actor = {
  position: { ...arena.attackerPosition },
  velocity: {x:0,y:0},
  shieldHp: 0,
  hullHp: 300,
  tactic: 'fight',
  subsystems: {tractor:100},
  setup: {name:'PvP salvager',tractorRangeMeters:500,shieldGeometry:{radiusX:28,radiusY:20}},
};
const enemy = {
  ...actor,
  position: { ...arena.defenderPosition },
  shieldHp: 80,
  hullHp: 300,
  velocity: {x:0,y:0},
};
const runtime = {
  arena, attacker:actor, defender:enemy, thrownAsteroids:[],
  elapsedSeconds:0, combatLog:[], impactSerial:0,
};
const initialCount = arena.asteroids.length;
maybeLaunchTractorAsteroid(runtime, 'attacker', actor, enemy);
assert.equal(runtime.thrownAsteroids.length, 1,
  'real seeded PvP scrap must be capturable by existing tractor mechanic');
assert.equal(arena.asteroids.length, initialCount-1,
  'captured mesh must be removed from the drifting field exactly once');
const projectile = runtime.thrownAsteroids[0];
assert(projectile.debrisVariant,
  'captured projectile must keep original 3D wreck model, not turn into an asteroid sprite');
assert(projectile.rotation3d && typeof projectile.effectSeed === 'number',
  'rotation and visual damage seed must follow the captured wreck');
for (let frame=0; frame<9;frame++) advanceThrownAsteroids(runtime,0.08);
assert.equal(runtime.thrownAsteroids[0].phase,'charge');
for (let frame=0; frame<11;frame++) advanceThrownAsteroids(runtime,0.08);
assert.equal(runtime.thrownAsteroids[0].phase,'flight');

const visuals = readModuleSource(root,'src/ui/combat/combat-scrap-renderer.ts');
const battlefield = readModuleSource(root,'src/ui/combat/strategic-combat-renderer.ts');
const lobby = readModuleSource(root, 'src/ui/start/duel-lobby.ts');
assert(lobby.includes('Traktor-Test: Startschilde deaktivieren') &&
  lobby.includes('scrapSelected && tractorTestCheckbox.checked') &&
  lobby.includes('shieldHp: 0'),
  'optional PvP practice mode must permit immediate throws without altering campaign shields');
assert(visuals.includes('drawSalvageDebris3d') &&
       visuals.includes('drawSalvageSection3d') &&
       visuals.includes('drawSalvageContainer3d'),
  'PvP must reuse all existing salvage geometry, not draw generic rocks');
assert(battlefield.includes('drawCombatScrap(context, {'),
  'tractor projectiles must render the captured 3D mesh during throw');
console.log('PASS seeded PvP moderate/dense 3D scrap arenas and real tractor capture, charge and throw');
