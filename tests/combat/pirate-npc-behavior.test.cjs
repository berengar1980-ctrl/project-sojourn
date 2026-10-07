'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const data = loadStandaloneTypeScriptModule(root, 'src/data/economy/sector-npc-economy.ts');
const mapModule = loadStandaloneTypeScriptModule(root, 'src/data/maps/narrows-sector.ts');
const navigationModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/navigation/navigation-service.ts'
);
const sectorModule = loadStandaloneTypeScriptModule(root, 'src/systems/npcs/npc-sector-service.ts');
const engagementModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/star-map-engagement-service.ts'
);
const ships = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-registry.ts');
const components = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-component-service.ts'
);
const combatAi = loadStandaloneTypeScriptModule(root, 'src/systems/npcs/npc-combat-ai.ts');

const npcs = data.createSectorNpcEconomyStates();
const pirates = npcs.filter((npc) => npc.pirate);
assert.equal(pirates.length, 9);
assert.deepEqual(
  new Set(pirates.map((npc) => npc.pirateMark)),
  new Set(['broken-spear', 'black-tide']),
  'two pirate gangs must expose distinct insignia'
);
assert(pirates.every((npc) => npc.job === 'pirate' && npc.aggression >= 75));
assert(
  pirates.every((npc) => ships.getShipDefinition(npc.shipId)?.role === 'patrol'),
  'pirates must temporarily use patrol hulls'
);

const pirate = pirates[0];
const prey = npcs.find((npc) => !npc.pirate && npc.job === 'freighter');
const patrol = npcs.find((npc) => !npc.pirate && npc.job === 'patrol');
assert(pirate && prey && patrol);
assert.equal(combatAi.npcIsPiratePrey(prey), true);
assert.equal(combatAi.npcLooksHostileToPatrol(pirate), true);

const playerShip = ships.getShipDefinition('patrol-60m-variant-01');
assert(playerShip);
const navigation = navigationModule.createNavigationService(
  mapModule.narrowsSector,
  mapModule.narrowsSector.startLocationId,
  playerShip.navigation.cruiseSpeed
);
const destination = mapModule.narrowsSector.locations.find(
  (location) => location.id !== mapModule.narrowsSector.startLocationId
);
assert(destination);
navigation.selectDestination(destination.id);
navigation.startTravel();

pirate.locationId = mapModule.narrowsSector.startLocationId;
delete pirate.travel;
delete pirate.combatMovement;

const sector = sectorModule.createNpcSectorService(mapModule.narrowsSector, npcs, {
  getPlayerPosition: () => navigation.getSnapshot().currentPosition,
});
const weapon = components.getShipComponent('weapon', 'weapon1');
assert(weapon?.weapon);
const logs = [];
const engagements = engagementModule.createStarMapEngagementService({
  navigation,
  sectorNpcs: sector,
  getPlayerShip: () => playerShip,
  getPlayerCombatant: () => ({
    id: 'player',
    name: playerShip.name,
    shipId: playerShip.id,
    shieldHp: 100,
    hullHp: 100,
    weapons: [weapon],
    hitChance: 0.8,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
  }),
  log: (message) => logs.push(message),
});

engagements.tick(1.1);
assert.equal(
  engagements.activePlayerEnemy()?.id,
  pirate.id,
  'a nearby pirate must physically intercept a travelling player'
);
assert(
  logs.some((entry) => entry.includes('KORSAREN-ABFANGKURS')),
  'pirate interception must be visible in the system log'
);

const renderer = fs.readFileSync(
  path.join(root, 'src/ui/map/npc-ship-map-renderer.ts'),
  'utf8'
);
assert(
  renderer.includes("npc.pirateMark === 'broken-spear'") &&
    renderer.includes("'black-tide'"),
  'star-map renderer must draw different marks for both pirate gangs'
);

console.log('PASS Voidbound-equivalent pirate factions, prey logic, player intercept and insignia');
