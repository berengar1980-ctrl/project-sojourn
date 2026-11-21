'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { createCombatant } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-geometry.ts'
);
const { createFleetCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/fleet-combat-service.ts'
);

function setup(id) {
  return {
    id,
    name: id,
    shipId: 'patrol-test',
    shieldHp: 180,
    hullHp: 260,
    weapons: [],
    hitChance: 0.5,
    dodgeChance: 0.1,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
  };
}
const arena = { width: 3000, height: 2000, obstacles: [], asteroids: [] };
const existing = createCombatant(setup('career-npc'), 'defender', {
  ...arena,
  defenderPosition: { x: 1200, y: 750 },
  defenderVelocity: { x: 13, y: -7 },
  defenderHeadingRadians: 1.7,
});
existing.shieldHp = 19;
existing.hullHp = 64;
existing.subsystems.engine = 24;
existing.mineCooldown = 4.2;
existing.nextStrategyReviewAt = 13;
existing.tactic = 'flee';

const handoff = {
  setup: existing.setup,
  factionId: 'civilian',
  position: { ...existing.position },
  liveCombatant: existing,
  targetId: null,
};
const fleet = createFleetCombatService(
  [
    handoff,
    { setup: setup('player'), factionId: 'player', position: { x: 150, y: 150 } },
    { setup: setup('pirate'), factionId: 'pirate-a', position: { x: 2600, y: 1500 } },
  ],
  arena
);
const imported = fleet.getSnapshot().ships.find((ship) => ship.ship.id === 'career-npc').ship;
assert.deepEqual(imported.position, { x: 1200, y: 750 });
assert.deepEqual(imported.velocity, { x: 13, y: -7 });
assert.equal(imported.headingRadians, 1.7);
assert.equal(imported.shieldHp, 19);
assert.equal(imported.hullHp, 64);
assert.equal(imported.subsystems.engine, 24);
assert.equal(imported.tactic, 'flee');
assert.equal(imported.nextStrategyReviewAt, 13);

fleet.tick(0.08);
assert.equal(existing.hullHp, 64, 'live campaign combatant remains original authority');
assert.equal(existing.shieldHp, 19, 'ship is not reinitialized during ticks');
assert.equal(existing.mineCooldown, 4.2, 'non-combat civilian preserves mine state');
assert.equal(existing.subsystems.engine, 24);

assert.throws(
  () =>
    createFleetCombatService(
      [
        { ...handoff, position: { x: 1199, y: 750 } },
        { setup: setup('player'), factionId: 'player', position: { x: 150, y: 150 } },
        { setup: setup('pirate'), factionId: 'pirate-a', position: { x: 2600, y: 1500 } },
      ],
      arena
    ),
  /position mismatch/,
  'invalid world handoffs must not silently teleport a career NPC'
);
assert.throws(
  () =>
    createFleetCombatService(
      [
        { ...handoff, setup: setup('other') },
        { setup: setup('player'), factionId: 'player', position: { x: 150, y: 150 } },
        { setup: setup('pirate'), factionId: 'pirate-a', position: { x: 2600, y: 1500 } },
      ],
      arena
    ),
  /ID mismatch/,
  'invalid handoffs cannot silently replace an existing career entity'
);
assert.throws(
  () =>
    createFleetCombatService(
      [
        { ...handoff, setup: { ...existing.setup } },
        { setup: setup('player'), factionId: 'player', position: { x: 150, y: 150 } },
        { setup: setup('pirate'), factionId: 'pirate-a', position: { x: 2600, y: 1500 } },
      ],
      arena
    ),
  /loadout authority mismatch/,
  'a copied PvP loadout must not override the live campaign loadout'
);
console.log('PASS FleetCombat adopts live career combatants without state reset or teleport');
