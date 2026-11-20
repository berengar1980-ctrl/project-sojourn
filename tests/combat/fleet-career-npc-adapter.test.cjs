'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createSectorNpcEconomyStates } = loadStandaloneTypeScriptModule(
  root, 'src/data/economy/sector-npc-economy.ts'
);
const { npcCombatant } = loadStandaloneTypeScriptModule(
  root, 'src/systems/combat/npc-combatant-setup.ts'
);
const { createFleetCareerNpcParticipant } = loadStandaloneTypeScriptModule(
  root, 'src/systems/combat/fleet-career-npc-adapter.ts'
);
const { createFleetCombatService } = loadStandaloneTypeScriptModule(
  root, 'src/systems/combat/fleet-combat-service.ts'
);

const npcs = createSectorNpcEconomyStates();
const miner = npcs.find((npc) => npc.job === 'miner');
const piratesA = npcs.find((npc) => npc.job === 'pirate' && npc.factionId === 'pirates');
const piratesB = npcs.find((npc) => npc.job === 'pirate' && npc.factionId === 'pirates2');
assert(miner && piratesA && piratesB, 'real career roster must include a miner and both pirates');

const minerPosition = { x: 850, y: 600 };
const minerParticipant = createFleetCareerNpcParticipant(miner, minerPosition, { targetId: null });
const a = createFleetCareerNpcParticipant(piratesA, { x: 1250, y: 620 }, { targetId: miner.id });
const b = createFleetCareerNpcParticipant(piratesB, { x: 1400, y: 650 }, {
  targetId: piratesA.id,
  spawnAtSeconds: 9,
});
assert.equal(minerParticipant.factionId, 'civilian');
assert.equal(a.factionId, 'pirate-a');
assert.equal(b.factionId, 'pirate-b');
assert.equal(b.spawnAtSeconds, 9);
assert.deepEqual(minerParticipant.position, minerPosition);
assert.notEqual(minerParticipant.position, minerPosition, 'world position copied, not aliased');
assert.equal(minerParticipant.setup.id, miner.id);
assert.equal(minerParticipant.setup.shipId, miner.shipId);
assert.equal(a.setup.shipId, piratesA.shipId);
assert.equal(b.setup.shipId, piratesB.shipId);
assert.equal(minerParticipant.setup.hullHp, Math.min(miner.hullMaxHp, miner.hullHp));
assert.equal(minerParticipant.setup.preferredTactic, npcCombatant(miner).preferredTactic);
assert.deepEqual(
  a.setup.weapons.map((item) => item.id),
  npcCombatant(piratesA).weapons.map((item) => item.id),
  'FleetCombat must use the identical installed weapons as campaign combat'
);
assert.deepEqual(
  b.setup.mines.map((item) => item.id),
  npcCombatant(piratesB).mines.map((item) => item.id),
  'FleetCombat must use the identical career mine loadout'
);

const arena = { width: 2600, height: 1800, asteroids: [], obstacles: [] };
const fleet = createFleetCombatService([minerParticipant, a, b], arena);
assert.deepEqual(
  fleet.getSnapshot().ships.map((entry) => entry.ship.id),
  [miner.id, piratesA.id],
  'delayed career pirate has not yet entered'
);
assert.equal(fleet.getSnapshot().pendingArrivals[0].id, piratesB.id);
assert.equal(
  fleet.getSnapshot().ships.find((ship) => ship.ship.id === miner.id).targetId,
  null,
  'working miner must stay uninvolved until an explicit reaction'
);
assert.throws(
  () => createFleetCareerNpcParticipant(miner, { x: NaN, y: 0 }),
  /Invalid career NPC local position/
);
assert.equal(miner.job, 'miner');
assert.equal(miner.activityId, miner.activityId, 'adapter does not simulate or replace mining');
console.log('PASS real career miner and two pirate factions use shared NPC combatant equipment and fleet arrival');
