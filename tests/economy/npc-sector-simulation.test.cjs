'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const data = loadStandaloneTypeScriptModule(root, 'src/data/economy/sector-npc-economy.ts');
const sector = loadStandaloneTypeScriptModule(root, 'src/systems/npcs/npc-sector-service.ts');
const mapModule = loadStandaloneTypeScriptModule(root, 'src/data/maps/narrows-sector.ts');
const ships = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-registry.ts');

const npcs = data.createSectorNpcEconomyStates();
assert.equal(npcs.length, 24, 'Voidbound civilian population size must be preserved');
assert.deepEqual(
  new Set(npcs.map((npc) => npc.job)),
  new Set(['freighter', 'miner', 'salvager', 'patrol']),
  'all four civilian jobs must exist'
);

for (const npc of npcs) {
  const ship = ships.getShipDefinition(npc.shipId);
  assert(ship, 'every NPC must own a real Sojourn ship definition');
  const expected =
    npc.job === 'freighter'
      ? 'freighter'
      : npc.job === 'miner'
        ? 'mining'
        : npc.job === 'salvager'
          ? 'salvage'
          : 'patrol';
  assert.equal(ship.role, expected, 'NPC job and hull role must stay compatible');
}

const freighter = npcs.find((npc) => npc.job === 'freighter');
assert(freighter);
const service = sector.createNpcSectorService(mapModule.narrowsSector, npcs);
const origin = freighter.locationId;
const destination = origin === 'haven' ? 'karth-industrial' : 'haven';
const startFuel = freighter.fuel;

assert.equal(service.requestTravel(freighter, destination, 'Testflug'), true);
assert(service.isTravelling(freighter));
const firstPosition = service.livePosition(freighter);
service.tick(1);
const movedPosition = service.livePosition(freighter);
assert.notDeepEqual(movedPosition, firstPosition, 'NPC ship must physically advance along its route');
assert(freighter.fuel < startFuel, 'physical NPC travel must consume fuel');

for (let step = 0; step < 1000 && service.isTravelling(freighter); step += 1) service.tick(0.25);
assert.equal(freighter.locationId, destination, 'NPC must arrive at its actual destination');
assert.equal(service.isTravelling(freighter), false);

const patrol = npcs.find((npc) => npc.job === 'patrol');
assert(patrol);
service.tick(0.1);
assert(service.isTravelling(patrol), 'idle patrol ships must autonomously begin a security route');

const upgrader = npcs.find((npc) => npc.job === 'freighter' && npc.id !== freighter.id);
assert(upgrader);
upgrader.locationId = 'helix-shipyards';
upgrader.successfulRuns = 8;
upgrader.credits = 4000000;
delete upgrader.travel;
service.tick(0.1);
assert.equal(upgrader.componentUpgradeCount, 1, 'experienced NPCs must invest in ship components');
assert(upgrader.installedComponents, 'NPC component loadout must persist on the ship state');
service.tick(0.1);
assert.equal(
  upgrader.componentUpgradeCount,
  1,
  'NPC component upgrades must respect a completed-run cooldown'
);

const controllerSource = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');
const rendererSource = fs.readFileSync(
  path.join(root, 'src/ui/map/topdown-map-renderer.ts'),
  'utf8'
);
assert(
  controllerSource.includes('economy.sectorNpcs.livePosition(npc)') &&
    rendererSource.includes('drawNpcShips'),
  'physical NPC traffic must be exposed on the live star map'
);

console.log(
  'PASS physical NPC ships, jobs, fuel, travel, patrol routing, upgrades and map presence'
);
