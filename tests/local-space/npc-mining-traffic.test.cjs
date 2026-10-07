'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const localMining = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-local-mining-service.ts'
);

const miner = {
  id: 'npc-miner-test',
  name: 'Acastus Avern',
  role: 'miner',
  job: 'miner',
  shipId: 'miner-80m-variant-01',
  locationId: 'test-field',
  credits: 3000000,
  cargoCapacity: 20,
  normalCargoCapacity: 7,
  cargo: {},
  workResourceIds: ['ferrite'],
  workLocationId: 'test-field',
  fuel: 145,
  fuelCapacity: 145,
  fuelUse: 0.86,
  hullHp: 72,
  hullMaxHp: 72,
  aggression: 20,
  autonomy: {
    phase: 'working',
    secondsRemaining: 0,
    lastLocationId: 'test-field',
    wasTravelling: false,
  },
  activityId: 'dock',
  activity: 'Wartet',
  successfulRuns: 0,
};

const asteroid = {
  id: 'rock',
  kind: 'resource',
  routeBlocking: true,
  position: { x: 500, y: 400 },
  radius: 35,
  rotation: 0,
  physics: {
    mass: 100,
    centerOfMassOffset: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    angularVelocity: 0,
    momentOfInertia: 100,
  },
  deposits: [
    {
      resourceId: 'ferrite',
      oreType: 'Ferrite',
      oreRemaining: 100,
      oreCapacity: 100,
      identified: false,
    },
  ],
  scanLevel: 'unscanned',
};

let departed = false;
const restingMiner = {
  ...miner,
  id: 'npc-miner-resting',
  cargo: {},
  autonomy: {
    phase: 'resting',
    secondsRemaining: 10,
    lastLocationId: 'test-field',
    wasTravelling: false,
  },
};

const service = localMining.createNpcLocalMiningService({
  locationId: 'test-field',
  width: 1000,
  height: 800,
  miners: [miner, restingMiner],
  getAsteroids: () => [asteroid],
  mine: (npc, resourceId, requested) => {
    const free = npc.cargoCapacity - Object.values(npc.cargo).reduce((sum, value) => sum + value, 0);
    const accepted = Math.min(requested, free);
    npc.cargo[resourceId] = (npc.cargo[resourceId] ?? 0) + accepted;
    return accepted;
  },
  depart: () => {
    departed = true;
    return true;
  },
});

assert.equal(
  service.ships.length,
  1,
  'only NPCs in the shared working phase may enter the mining field'
);
const first = { ...service.ships[0].position };
assert(
  first.x <= 18 || first.x >= 982 || first.y <= 18 || first.y >= 782,
  'NPC miner must enter from the field perimeter rather than appear in the middle'
);

let sawFlight = false;
let sawScan = false;
let sawMining = false;
let sawExit = false;
for (let step = 0; step < 10000 && !departed; step += 1) {
  service.tick(0.08);
  const ship = service.ships[0];
  if (!ship) continue;
  if (ship.phase === 'approaching') sawFlight = true;
  if (ship.phase === 'scanning' && ship.scanProgress > 0) sawScan = true;
  if (ship.phase === 'mining' && ship.laserActive) sawMining = true;
  if (ship.phase === 'exiting') sawExit = true;
}

assert(sawFlight, 'NPC miner must visibly fly from the perimeter to an asteroid');
assert(sawScan, 'NPC miner must complete a visible scan before extraction');
assert(sawMining, 'NPC miner must visibly enter an active laser-mining phase');
assert(sawExit, 'loaded NPC miner must fly back out through the field perimeter');
assert(departed, 'NPC miner must hand back to sector travel after leaving local space');
assert.equal(service.ships.length, 0, 'exited miner must disappear only after crossing the boundary');
assert.equal(miner.cargo.ferrite, 20, 'local mining must fill the NPC cargo completely');
assert(asteroid.deposits[0].oreRemaining < 100, 'local NPC mining must deplete the visible asteroid');

console.log('PASS NPC miners enter, scan, mine until full and leave asteroid fields');
