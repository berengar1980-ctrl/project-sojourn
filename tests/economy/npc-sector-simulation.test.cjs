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
assert.equal(
  npcs.filter((npc) => !npc.pirate).length,
  24,
  'Voidbound civilian population size must be preserved'
);
assert.equal(
  npcs.filter((npc) => npc.pirate).length,
  9,
  'Voidbound pirate population must be ported'
);
assert.deepEqual(
  new Set(npcs.filter((npc) => !npc.pirate).map((npc) => npc.job)),
  new Set(['freighter', 'miner', 'salvager', 'patrol']),
  'all four civilian jobs must exist'
);
assert.deepEqual(
  Object.fromEntries(
    ['pirates', 'pirates2'].map((faction) => [
      faction,
      npcs.filter((npc) => npc.pirate && npc.factionId === faction).length,
    ])
  ),
  { pirates: 5, pirates2: 4 },
  'the two Voidbound pirate gangs must keep their 5/4 population split'
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
assert.notDeepEqual(
  movedPosition,
  firstPosition,
  'NPC ship must physically advance along its route'
);
assert(freighter.fuel < startFuel, 'physical NPC travel must consume fuel');

for (let step = 0; step < 1000 && service.isTravelling(freighter); step += 1) service.tick(0.25);
assert.equal(freighter.locationId, destination, 'NPC must arrive at its actual destination');
assert.equal(service.isTravelling(freighter), false);

const patrol = npcs.find((npc) => npc.job === 'patrol');
assert(patrol);
service.tick(0.1);
assert.equal(
  service.isTravelling(patrol),
  false,
  'sector service alone must not bypass patrol rest and autonomy timing'
);
assert.equal(
  service.requestPatrol(patrol),
  true,
  'autonomy must be able to request a patrol route'
);
assert(service.isTravelling(patrol));

const pirate = npcs.find((npc) => npc.pirate);
assert(pirate);
delete pirate.travel;
delete pirate.combatMovement;
assert.equal(
  service.requestPatrol(pirate),
  true,
  'pirate autonomy must choose and travel toward a hunt zone'
);
assert(service.isTravelling(pirate));
assert(pirate.pirateHuntZoneId, 'pirate hunt-zone choice must persist on the NPC state');

delete freighter.travel;
service.markEngaged(freighter, 'npc', pirate.id, 'Recovery-Test');
freighter.hullHp = 0;
assert.equal(
  service.recoverFromCombat(freighter, 'Kampfunfähig'),
  true,
  'a defeated NPC must be recovered instead of permanently removed'
);
assert(freighter.hullHp > 0, 'recovered NPC must retain a damaged but operational hull');
assert((freighter.combatRecoverySeconds ?? 0) > 0, 'defeated NPC must enter a repair cooldown');
const recoveredId = freighter.id;
for (let step = 0; step < 600 && (freighter.combatRecoverySeconds ?? 0) > 0; step += 1) {
  service.tick(0.25);
}
assert.equal(
  freighter.id,
  recoveredId,
  'combat recovery must keep the same persistent NPC identity'
);
assert.equal(freighter.hullHp, freighter.hullMaxHp, 'NPC hull must be restored after repair');
assert.equal(freighter.combatRecoverySeconds, undefined);

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

const controllerSource = fs.readFileSync(
  path.join(root, 'src/app/game-controller-star-map.ts'),
  'utf8'
);
const rendererSource = fs.readFileSync(
  path.join(root, 'src/ui/map/topdown-map-renderer.ts'),
  'utf8'
);
assert(
  controllerSource.includes('economy.sectorNpcs.livePosition(npc)') &&
    rendererSource.includes('NpcShipMapRenderer') &&
    rendererSource.includes('this.npcShips'),
  'physical NPC traffic must be exposed on the live star map'
);

console.log(
  'PASS physical NPC ships, nonlethal recovery, pirate factions, hunt routing, upgrades and map presence'
);
