'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);

const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { createFleetCareerLootSettlement } = load(
  'src/systems/combat/fleet-career-loot-settlement.ts'
);
const { transferPirateLoot } = load('src/systems/combat/npc-combatant-setup.ts');
const states = createSectorNpcEconomyStates();
const a = states.find((npc) => npc.id === 'pirate-01');
const b = states.find((npc) => npc.id === 'pirate-06');
const victim = states.find((npc) => npc.job === 'miner');
assert(a && b && victim && a.factionId !== b.factionId);
a.cargoCapacity = 30;
b.cargoCapacity = 30;
a.cargo = {};
b.cargo = {};
victim.cargo = { ferrite: 18, silicite: 3 };
const initialTotal = Object.values(victim.cargo).reduce((sum, count) => sum + count, 0);
const settlement = createFleetCareerLootSettlement([a, b, victim]);
const ships = (hp) => [
  { factionId: 'pirate-a', targetId: victim.id, ship: { id: a.id, hullHp: 100 } },
  { factionId: 'pirate-b', targetId: victim.id, ship: { id: b.id, hullHp: 100 } },
  { factionId: 'civilian', targetId: null, ship: { id: victim.id, hullHp: hp } },
];
const hits = [
  { sourceId: a.id, targetId: victim.id, shieldDamage: 15, hullDamage: 5 },
  { sourceId: b.id, targetId: victim.id, shieldDamage: 10, hullDamage: 5 },
];
assert.deepEqual(settlement.settle(ships(15), hits), [], 'damage does not settle before defeat');
const result = settlement.settle(ships(0), [
  { sourceId: a.id, targetId: victim.id, shieldDamage: 0, hullDamage: 15 },
]);
assert.equal(result.length, 1);
assert.equal(result[0].victimId, victim.id);
assert.deepEqual(result[0].pirateIds, [a.id, b.id], 'both hostile factions share the kill');
assert.equal(result[0].unitsTransferred, 10);
const count = (npc) => Object.values(npc.cargo).reduce((sum, value) => sum + value, 0);
assert.equal(count(a), 5);
assert.equal(count(b), 5);
assert.equal(count(victim), initialTotal - 10);
assert.equal(count(a) + count(b) + count(victim), initialTotal, 'cargo remains conserved');
assert.equal(a.activityId, 'raiding');
assert.equal(b.activityId, 'raiding');
assert.deepEqual(settlement.settle(ships(0), hits), [], 'defeat settles exactly once');
assert.equal(count(victim), initialTotal - 10);

const limitedA = { ...a, cargoCapacity: 1, cargo: {} };
const limitedB = { ...b, cargoCapacity: 12, cargo: {} };
const limitedVictim = { ...victim, cargo: { ferrite: 12 } };
const limited = createFleetCareerLootSettlement([limitedA, limitedB, limitedVictim]);
const limitedShips = [
  { ship: { id: limitedA.id, hullHp: 100 } },
  { ship: { id: limitedB.id, hullHp: 100 } },
  { ship: { id: limitedVictim.id, hullHp: 0 } },
];
const limitedResult = limited.settle(limitedShips, hits);
assert.equal(limitedResult[0].unitsTransferred, 10);
assert.equal(count(limitedA), 1, 'small career cargo hold must not overflow');
assert.equal(count(limitedB), 9, 'remaining share goes to available cargo capacity');
assert.equal(count(limitedVictim), 2);

const ignoredVictim = { ...victim, cargo: { ferrite: 14 } };
const ignoredPirate = { ...a, cargo: {} };
const empty = createFleetCareerLootSettlement([ignoredPirate, ignoredVictim]);
assert.deepEqual(
  empty.settle(
    [
      { ship: { id: ignoredPirate.id, hullHp: 100 } },
      { ship: { id: ignoredVictim.id, hullHp: 0 } },
    ],
    [{ sourceId: ignoredPirate.id, targetId: ignoredVictim.id, shieldDamage: 0, hullDamage: 0 }]
  ),
  [],
  'target selection or zero-damage hit cannot create loot'
);
assert.equal(count(ignoredVictim), 14);
// The original 1vs1 API keeps the same ten-unit default.
const oldPirate = { ...a, cargo: {} };
const oldVictim = { ...victim, cargo: { ferrite: 20 } };
assert.equal(transferPirateLoot(oldPirate, oldVictim), 10);
console.log('PASS fleet shared pirate loot: opposing factions, real cargo, idempotence');
