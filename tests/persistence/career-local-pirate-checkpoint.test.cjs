'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { LocalPirateTraffic } = load('src/systems/npcs/npc-local-pirate-service.ts');
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');

const npcs = createSectorNpcEconomyStates();
const pirates = npcs.filter((npc) => npc.pirate);
const first = pirates[0];
assert(first);
const original = new LocalPirateTraffic(3000, 3000, 42);
original.reconcile(pirates);
const start = original.snapshot(pirates).find((contact) => contact.npcId === first.id);
assert(start);
original.syncCombatPose(first.id, { x: 550, y: 675 }, 1.5);
const saved = original.exportState();
const fresh = LocalPirateTraffic.fromCheckpoint(3000, 3000, 42, pirates, saved);
assert.deepEqual(fresh.snapshot(pirates), original.snapshot(pirates));
fresh.syncCombatPose(first.id, { x: 700, y: 720 }, 1.2);
assert.equal(saved.ships.find((ship) => ship.npcId === first.id).position.x, 550);
assert.equal(original.snapshot(pirates).find((ship) => ship.npcId === first.id).position.x, 550);

first.combatMovement = {
  mode: 'engaged',
  targetKind: 'player',
  targetId: 'player',
  position: { x: 550, y: 675 },
  headingRadians: 1.5,
  speed: 0,
};
original.reconcile(pirates);
const inCombat = original.exportState();
assert(
  inCombat.ships.some((ship) => ship.npcId === first.id),
  'active combat pirates retain their local ship in the checkpoint'
);
const loaded = LocalPirateTraffic.fromCheckpoint(3000, 3000, 42, pirates, inCombat);
delete first.combatMovement;
loaded.reconcile(pirates);
const returned = loaded.snapshot(pirates).find((ship) => ship.npcId === first.id);
assert.deepEqual(returned.position, { x: 550, y: 675 });

const duplicate = JSON.parse(JSON.stringify(saved));
duplicate.ships.push({ ...duplicate.ships[0] });
assert.throws(
  () => LocalPirateTraffic.fromCheckpoint(3000, 3000, 42, pirates, duplicate),
  /Piraten-Kennungen/
);
const badPosition = JSON.parse(JSON.stringify(saved));
badPosition.ships[0].position.x = -5;
assert.throws(
  () => LocalPirateTraffic.fromCheckpoint(3000, 3000, 42, pirates, badPosition),
  /Piratenzustände/
);
assert.throws(
  () => LocalPirateTraffic.fromCheckpoint(3000, 3000, 99, pirates, saved),
  /Asteroidenkarte/
);
console.log('PASS local pirate checkpoint: detached poses, combat returns, invalid saves');
