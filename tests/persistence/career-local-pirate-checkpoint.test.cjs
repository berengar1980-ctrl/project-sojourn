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
original.syncCombatPose(
  first.id,
  { x: 550, y: 675 },
  1.5,
  { x: -22, y: 17 },
  {
    turnRateRadiansPerSecond: 0.22,
    angularThrust: -0.3,
    lateralThrust: 0.4,
    longitudinalThrust: -0.5,
  }
);
assert.deepEqual(
  original.snapshot(pirates).find((ship) => ship.npcId === first.id).velocity,
  { x: -22, y: 17 },
  'combat return must preserve the full local drift vector'
);
assert.equal(original.exportState().ships[0].turnRateRadiansPerSecond, 0.22);
assert.equal(original.exportState().ships[0].angularThrust, -0.3);
assert.equal(original.exportState().ships[0].lateralThrust, 0.4);
assert.equal(original.exportState().ships[0].longitudinalThrust, -0.5);
const saved = original.exportState();
const fresh = LocalPirateTraffic.fromCheckpoint(3000, 3000, 42, pirates, saved);
assert.deepEqual(fresh.snapshot(pirates), original.snapshot(pirates));
fresh.syncCombatPose(first.id, { x: 700, y: 720 }, 1.2, { x: 11, y: -9 });
assert.equal(saved.ships.find((ship) => ship.npcId === first.id).position.x, 550);
assert.equal(original.snapshot(pirates).find((ship) => ship.npcId === first.id).position.x, 550);
const legacy = JSON.parse(JSON.stringify(saved));
for (const ship of legacy.ships) delete ship.velocity;
const migrated = LocalPirateTraffic.fromCheckpoint(3000, 3000, 42, pirates, legacy);
assert.deepEqual(
  migrated.snapshot(pirates).find((ship) => ship.npcId === first.id).velocity,
  {
    x: Math.cos(1.5) * saved.ships.find((ship) => ship.npcId === first.id).speed,
    y: Math.sin(1.5) * saved.ships.find((ship) => ship.npcId === first.id).speed,
  },
  'legacy scalar checkpoints migrate to their heading-aligned vector'
);

first.combatMovement = {
  mode: 'engaged',
  targetKind: 'player',
  targetId: 'player',
  position: { x: 550, y: 675 },
  velocity: { x: -22, y: 17 },
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
