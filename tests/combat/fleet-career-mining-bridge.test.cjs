'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (filename) => loadStandaloneTypeScriptModule(root, filename);

const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { createNpcLocalMiningService } = load('src/systems/npcs/npc-local-mining-service.ts');
const { createFleetCareerNpcParticipant } = load('src/systems/combat/fleet-career-npc-adapter.ts');
const { createFleetCareerMiningBridge } = load('src/systems/combat/fleet-career-mining-bridge.ts');
const { createFleetCombatService } = load('src/systems/combat/fleet-combat-service.ts');

const npcs = createSectorNpcEconomyStates();
const miner = npcs.find((npc) => npc.job === 'miner');
const pirates = npcs.filter((npc) => npc.job === 'pirate').slice(0, 2);
assert(miner && pirates.length === 2);
const locationId = 'copper-crown-field';
miner.locationId = locationId;
miner.workLocationId = locationId;
miner.workResourceIds = ['ferrite'];
miner.autonomy = {
  phase: 'working',
  secondsRemaining: 0,
  lastLocationId: locationId,
  wasTravelling: false,
};
const asteroid = {
  id: 'ore-rock',
  kind: 'resource',
  routeBlocking: true,
  position: { x: 1100, y: 700 },
  radius: 50,
  rotation: 0,
  physics: {
    mass: 10000,
    centerOfMassOffset: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    angularVelocity: 0,
    momentOfInertia: 10000,
  },
  deposits: [
    {
      resourceId: 'ferrite',
      oreType: 'ferrite',
      oreRemaining: 300,
      oreCapacity: 300,
      identified: true,
    },
  ],
  scanLevel: 'unscanned',
};
const arena = { width: 2400, height: 1500, obstacles: [], asteroids: [] };
const mining = createNpcLocalMiningService({
  locationId,
  width: arena.width,
  height: arena.height,
  seed: 71,
  miners: [miner],
  getAsteroids: () => [asteroid],
  mine(npc, resourceId, requested) {
    const accepted = Math.min(
      requested,
      Math.max(
        0,
        npc.cargoCapacity - Object.values(npc.cargo).reduce((sum, amount) => sum + amount, 0)
      )
    );
    if (accepted > 0) npc.cargo[resourceId] = (npc.cargo[resourceId] ?? 0) + accepted;
    return accepted;
  },
  depart() {
    return true;
  },
});
assert.equal(mining.ships.length, 1, 'native career miner actually spawns');
const start = { ...mining.ships[0].position };
const bridge = createFleetCareerMiningBridge(mining, [miner]);
assert.equal(bridge.participants.length, 1);
const members = [
  ...bridge.participants,
  ...pirates.map((pirate, index) =>
    createFleetCareerNpcParticipant(
      pirate,
      { x: 2100, y: 1200 + index * 70 },
      {
        targetId: null,
      }
    )
  ),
];
let worldTicks = 0;
const world = {
  tickWorld(dt) {
    worldTicks++;
    bridge.world.tickWorld(dt);
  },
};
const fleet = createFleetCombatService(members, arena, world);
let sawScan = false;
let sawMining = false;
let moved = false;
let extracted = false;
for (let index = 0; index < 650; index++) {
  const state = fleet.tick(0.08);
  const local = mining.ships[0];
  assert(local, 'miner should remain present with sufficient cargo and ore');
  sawScan ||= local.phase === 'scanning';
  sawMining ||= local.phase === 'mining' && local.laserActive;
  moved ||= Math.hypot(local.position.x - start.x, local.position.y - start.y) > 80;
  extracted ||= (miner.cargo.ferrite ?? 0) > 0;
  const rendered = state.ships.find((item) => item.ship.id === miner.id);
  assert(rendered);
  assert.deepEqual(
    rendered.ship.position,
    local.position,
    'FleetCombat mirrors campaign-owned world pose, no second movement'
  );
  assert.equal(rendered.targetId, null, 'miner keeps working without a combat target');
  if (extracted && sawMining && moved) break;
}
assert(moved, 'real career route planner must move miner');
assert(sawScan, 'real career scanning phase must run');
assert(sawMining, 'real career mining laser must activate');
assert(extracted, 'real career ore cycle must credit NPC cargo');
assert(asteroid.deposits[0].oreRemaining < 300, 'ore is depleted by campaign miner');
assert.equal(
  worldTicks,
  Math.round(fleet.getSnapshot().elapsedSeconds / 0.08),
  'career service ticks exactly once per fleet interval, not per ship'
);

// A pirate selecting a working miner is a combat threat. The career defense
// policy must interrupt the real mining world before its next extraction tick.
const poseBeforeRaid = { ...mining.ships[0].position };
fleet.setTarget(pirates[0].id, miner.id);
let raid = fleet.tick(0.08);
assert.equal(miner.combatMovement?.targetId, pirates[0].id);
assert.equal(miner.combatMovement?.targetKind, 'npc');
assert.equal(
  miner.combatMovement?.mode,
  'flee',
  'unarmed career civilian uses native defensive retreat doctrine'
);
assert.equal(
  mining.ships[0].laserActive,
  false,
  'the career mining service must stop the laser when the raid begins'
);
assert.equal(
  raid.ships.find((item) => item.ship.id === miner.id)?.targetId,
  null,
  'fleeing miner must not shoot back'
);
const cargoAtRaid = miner.cargo.ferrite;
for (let index = 0; index < 24; index++) raid = fleet.tick(0.08);
assert.equal(
  miner.cargo.ferrite,
  cargoAtRaid,
  'no hidden extraction continues while a pirate is attacking'
);
const flightPose = raid.ships.find((item) => item.ship.id === miner.id).ship.position;
assert(
  Math.hypot(flightPose.x - poseBeforeRaid.x, flightPose.y - poseBeforeRaid.y) > 0.1,
  'shared strategic combat steering must physically move the fleeing miner'
);
assert.deepEqual(
  mining.ships[0].position,
  flightPose,
  'campaign miner pose must stay synchronized with the shared combat flight'
);
fleet.setTarget(pirates[0].id, null);
fleet.tick(0.08);
assert.equal(
  miner.combatMovement,
  undefined,
  'once the raid ends, the career NPC returns to its normal work authority'
);
const priorCareerCombat = {
  mode: 'engaged',
  targetKind: 'npc',
  targetId: pirates[1].id,
  position: { ...mining.ships[0].position },
  headingRadians: mining.ships[0].headingRadians,
  speed: 0,
};
miner.combatMovement = priorCareerCombat;
fleet.tick(0.08);
assert.equal(miner.combatMovement, priorCareerCombat,
  'FleetCombat bridge must never erase an engagement owned by the real campaign');
delete miner.combatMovement;
const cargoBefore = miner.cargo.ferrite;
miner.combatRecoverySeconds = 5;
fleet.tick(0.08);
assert.equal(miner.cargo.ferrite, cargoBefore, 'career recovery interrupts extraction');
assert.equal(mining.ships[0].laserActive, false, 'native miner service disables laser');
assert.equal(mining.ships[0].speed, 0, 'native miner service stops physical work');
// When the native career field despawns a departed miner, FleetCombat must
// remove the participant rather than leaving an untouchable ghost ship.
// Career dispatch changes the worker's autonomy phase before the ship leaves.
miner.autonomy.phase = 'thinking';
mining.ships.splice(0, 1);
fleet.tick(0.08);
assert.equal(
  fleet.getSnapshot().ships.some((item) => item.ship.id === miner.id),
  false
);
assert.equal(
  fleet.getSnapshot().pendingArrivals.some((item) => item.id === miner.id),
  false
);
fleet.tick(0.08);
assert.equal(
  fleet.getSnapshot().ships.some((item) => item.ship.id === miner.id),
  false,
  'departed miner must not respawn'
);
console.log(
  'PASS real career miner route, scan, extraction, cargo, interruption in shared FleetCombat'
);
