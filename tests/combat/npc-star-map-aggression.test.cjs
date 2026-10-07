'use strict';

const assert = require('node:assert/strict');
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

const playerShip = ships.getShipDefinition('patrol-60m-variant-01');
assert(playerShip);
const navigation = navigationModule.createNavigationService(
  mapModule.narrowsSector,
  mapModule.narrowsSector.startLocationId,
  playerShip.navigation.cruiseSpeed
);

const npcs = data.createSectorNpcEconomyStates();
const attacker = npcs.find((npc) => npc.job === 'patrol');
const defender = npcs.find((npc) => npc.job === 'freighter');
assert(attacker && defender);

attacker.locationId = mapModule.narrowsSector.startLocationId;
defender.locationId = mapModule.narrowsSector.startLocationId;
attacker.aggression = 95;
defender.aggression = 90;

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
  sector.combatMode(attacker),
  'engaged',
  'aggressive patrol must autonomously intercept a hostile NPC contact'
);
assert.equal(
  sector.combatMode(defender),
  'engaged',
  'attacked NPC must enter the resulting encounter'
);
assert(
  logs.some((entry) => entry.includes('NPC COMBAT')),
  'autonomous NPC attacks must be visible in the system log'
);

console.log('PASS autonomous NPC star-map attack and encounter start');
