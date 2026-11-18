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
  for (const kind of ['asteroid_field', 'scattered', 'scrap_field', 'scrap_scattered']) {
    const arena = createDuelArena(kind, seed);
    const snapshot = createStrategicCombatService(
      setup('A'),
      setup('B'),
      seed,
      arena
    ).getSnapshot();
    for (const side of ['attacker', 'defender']) {
      assert.equal(snapshot[side].shieldHp, 119);
      assert.equal(snapshot[side].shieldMaxHp, 119);
      assert.equal(snapshot[side].hullHp, 96);
      assert.equal(snapshot[side].hullMaxHp, 96);
      assert.deepEqual(snapshot[side].velocity, { x: 0, y: 0 });
      assert.equal(snapshot[side].headingRadians, side === 'attacker' ? 0 : Math.PI);
      assert.deepEqual(snapshot[side].position, arena[side + 'Position']);
    }
    assert.equal(snapshot.arena.asteroids.length, arena.asteroids.length);
    const cover = arena.asteroids.filter((body) => body.kind === 'resource');
    assert.deepEqual(
      arena.obstacles.map((obstacle) => obstacle.id),
      cover.map((body) => body.id)
    );
    assert.equal(new Set(arena.asteroids.map((rock) => rock.id)).size, arena.asteroids.length);
  }
}
const lobby = readModuleSource(root, 'src/ui/start/duel-lobby.ts');
const contacts = readModuleSource(root, 'src/systems/combat/combat-asteroid-contacts.ts');
const tractor = readModuleSource(root, 'src/systems/combat/combat-tractor-asteroid-throw.ts');
assert(!lobby.includes('tractorTestCheckbox') && !lobby.includes('shieldHp: 0'));
assert(lobby.includes('setups[0]!') && lobby.includes('setups[1]!'));
assert(contacts.includes('resolveShieldCollisions('));
assert(tractor.includes('const THROWN_OBJECT_SHIELD_DAMAGE = 130 / 3'));
assert(tractor.includes('const THROWN_OBJECT_HULL_DAMAGE = 95 / 3'));
console.log('PASS PvP map source and identical shields, hulls and collision rules');
