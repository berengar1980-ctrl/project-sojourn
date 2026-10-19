'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');

const root = path.resolve(__dirname, '../..');
const load = (p) => loadStandaloneTypeScriptModule(root, p);
const { createDuelArena } = load('src/systems/combat/duel-arena-presets.ts');
const { createStrategicCombatService } = load('src/systems/combat/strategic-combat-service.ts');
const setup = (id) => ({
  id,
  name: id,
  shipId: 'patrol-v1',
  shieldHp: 119,
  hullHp: 96,
  weapons: [],
  mines: [],
  hitChance: 0.68,
  dodgeChance: 0,
  damageMultiplier: 1,
  criticalChance: 0,
  cycleTimeMultiplier: 1,
  tractorRangeMeters: 400,
  preferredTactic: 'fight',
});

for (const seed of [11, 106, 173, 1001, 4242]) {
  const asteroidArena = createDuelArena('asteroid_field', seed);
  const scrapArena = createDuelArena('scrap_field', seed);
  const moderateArena = createDuelArena('scrap_scattered', seed);
  const reference = createStrategicCombatService(
    setup('A'),
    setup('B'),
    seed,
    asteroidArena
  ).getSnapshot();

  for (const [name, arena] of [
    ['dense scrap', scrapArena],
    ['moderate scrap', moderateArena],
  ]) {
    const snapshot = createStrategicCombatService(
      setup('A'),
      setup('B'),
      seed,
      arena
    ).getSnapshot();
    for (const side of ['attacker', 'defender']) {
      assert.equal(
        snapshot[side].shieldHp,
        reference[side].shieldHp,
        name + ' must start with identical shield HP to asteroid duel'
      );
      assert.equal(
        snapshot[side].shieldMaxHp,
        reference[side].shieldMaxHp,
        name + ' must retain the same maximum shield HP'
      );
      assert.equal(
        snapshot[side].hullHp,
        reference[side].hullHp,
        name + ' must start with identical hull HP'
      );
      assert.equal(
        snapshot[side].hullMaxHp,
        reference[side].hullMaxHp,
        name + ' must retain the same hull maximum'
      );
      assert.deepEqual(
        snapshot[side].velocity,
        reference[side].velocity,
        name + ' must preserve initial velocity'
      );
      assert.equal(
        snapshot[side].headingRadians,
        reference[side].headingRadians,
        name + ' must use unchanged initial heading'
      );
      const fraction = side === 'attacker' ? { x: 0.28, y: 0.46 } : { x: 0.72, y: 0.54 };
      assert(
        Math.abs(
          snapshot[side].position.x / arena.width - reference[side].position.x / asteroidArena.width
        ) < 0.0001 &&
          Math.abs(
            snapshot[side].position.y / arena.height -
              reference[side].position.y / asteroidArena.height
          ) < 0.0001,
        name + ' must use same relative starting location as asteroid field'
      );
      assert(Math.abs(snapshot[side].position.x - arena.width * fraction.x) < 0.01);
      assert(Math.abs(snapshot[side].position.y - arena.height * fraction.y) < 0.01);
    }

    // Both maps use the same object classification for the ONLY structures
    // that block the AI and the weapon line of sight. Small debris still
    // participates in the shared shield collision solver.
    const expectedCover = arena.asteroids.filter((body) => body.kind === 'resource');
    assert.equal(
      arena.obstacles.length,
      expectedCover.length,
      name + ' must share asteroid kind=resource cover rules'
    );
    assert.deepEqual(
      arena.obstacles.map((obstacle) => obstacle.id),
      expectedCover.map((body) => body.id),
      name + ' cannot include small flying debris as cover/detour objects'
    );
    const ids = arena.asteroids.map((body) => body.id);
    assert.equal(
      new Set(ids).size,
      ids.length,
      name + ' must assign unique body identifiers across ALL generated layers'
    );
    for (const body of arena.asteroids) {
      const isPracticePiece = body.id.includes('practice-scrap-');
      if (isPracticePiece) continue;
      assert(
        [arena.attackerPosition, arena.defenderPosition].every(
          (spawn) =>
            Math.hypot(body.position.x - spawn.x, body.position.y - spawn.y) >= body.radius + 145
        ),
        name + ' must protect ship spawns by the same 145 m radius as the asteroid field'
      );
    }
  }
}

const lobby = readModuleSource(root, 'src/ui/start/duel-lobby.ts');
const hits = readModuleSource(root, 'src/systems/combat/combat-asteroid-contacts.ts');
const throwLogic = readModuleSource(root, 'src/systems/combat/combat-tractor-asteroid-throw.ts');
assert(
  !lobby.includes('tractorTestCheckbox') && !lobby.includes('shieldHp: 0'),
  'choosing a scrap map must never silently remove its normal starting shields'
);
assert(
  lobby.includes('setups[0]!') && lobby.includes('setups[1]!'),
  'all PvP maps must receive the same ship configurations'
);
assert(
  hits.includes('resolveShieldCollisions('),
  'both maps must use one asteroid physics impulse and damage resolver'
);
assert(
  throwLogic.includes('const THROWN_OBJECT_SHIELD_DAMAGE = 130 / 3') &&
    throwLogic.includes('const THROWN_OBJECT_HULL_DAMAGE = 95 / 3') &&
    throwLogic.includes('Math.min(enemy.shieldHp, THROWN_OBJECT_SHIELD_DAMAGE)'),
  'asteroid and wreck maps must share the reduced tractor impact damage model'
);

console.log('PASS PvP asteroid/scrap shield, hull, spawn, cover, and physics parity');
