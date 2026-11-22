'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createDynamicFleetCombat } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/dynamic-fleet-combat.ts'
);
const { createConflictManager } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/fleet-conflict-manager.ts'
);

function ship(id, team) {
  return {
    id,
    team,
    setup: {
      id,
      name: id,
      shipId: 'patrol-60m',
      shieldHp: 500,
      hullHp: 800,
      weapons: [],
      hitChance: 0.7,
      dodgeChance: 0.1,
      damageMultiplier: 1,
      criticalChance: 0,
      cycleTimeMultiplier: 1,
      combatSpeed: 120,
      preferredTactic: 'fight',
    },
  };
}
const arena = { width: 4200, height: 2600, obstacles: [], asteroids: [] };
const manager = createConflictManager([
  { id: 'player', role: 'player' },
  { id: 'civilian', role: 'npc' },
  { id: 'drone', role: 'drone' },
  { id: 'pirate-a', role: 'pirate', pirateGroup: 'a' },
  { id: 'pirate-b', role: 'pirate', pirateGroup: 'b' },
  { id: 'pirate-c', role: 'pirate', pirateGroup: 'c' },
]);
manager.recordAttack({
  attackerId: 'player',
  victimId: 'civilian',
  witnessedBy: ['drone'],
});
const roster = [
  ship('player', 'player'),
  ship('civilian', 'civilian'),
  ship('drone', 'security'),
  ship('pirate-a', 'pirates-a'),
  ship('pirate-b', 'pirates-b'),
];
const ids = new Map(roster.map((entry) => [entry.id, entry.id]));
const fleet = createDynamicFleetCombat(roster, arena, 2301, manager.hostility(), ids);
assert.equal(fleet.duels.length, 1);
assert.equal(fleet.supporters.length, 3);
assert.equal(fleet.getSnapshot().finished, false);
const actors = [
  ...fleet.duels.flatMap((service) => [
    service.getParallelActor('attacker'),
    service.getParallelActor('defender'),
  ]),
  ...fleet.supporters.map((service) => service.getParallelActor('attacker')),
];
assert.equal(new Set(actors).size, 5, 'each ship has a single physical actor');
assert.equal(fleet.addShip(ship('player', 'player'), 'player'), false, 'duplicate ship rejected');
for (const actor of actors) actor.tractorThrowCooldown = 2;
fleet.tick(0.08);
for (const actor of actors) {
  assert(
    Math.abs(actor.tractorThrowCooldown - 1.92) < 1e-9,
    actor.setup.id + ' must advance its cooldown exactly once'
  );
}
// An additional faction joins the same combat while it is already running.
const newcomer = ship('pirate-c', 'pirates-c');
assert.equal(fleet.addShip(newcomer, 'pirate-c'), true);
assert.equal(fleet.supporters.length, 4);
const extraActor = fleet.supporters[3].getParallelActor('attacker');
extraActor.tractorThrowCooldown = 2;
fleet.tick(0.08);
assert(Math.abs(extraActor.tractorThrowCooldown - 1.92) < 1e-9);
assert.equal(fleet.getSnapshot().finished, false);

// Remaining active participants are no longer hostile: battle is over.
for (const actor of actors) {
  if (actor.setup.id !== 'player' && actor.setup.id !== 'civilian') actor.hullHp = 0;
}
extraActor.hullHp = 0;
assert.equal(fleet.getSnapshot().finished, false, 'player is still hostile to civilian');
actors.find((actor) => actor.setup.id === 'civilian').hullHp = 0;
fleet.tick(0.08);
assert.equal(fleet.getSnapshot().finished, true);
console.log('PASS dynamic native fleet: five factions, joining, unique ownership and completion');
