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
const ai = loadStandaloneTypeScriptModule(root, 'src/systems/npcs/npc-combat-ai.ts');
const engagementsModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/star-map-engagement-service.ts'
);
const components = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-component-service.ts'
);
const ships = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-registry.ts');

const playerShip = ships.getShipDefinition('patrol-60m-variant-01');
assert(playerShip);
const navigation = navigationModule.createNavigationService(
  mapModule.narrowsSector,
  mapModule.narrowsSector.startLocationId,
  playerShip.navigation.cruiseSpeed * 1.4
);

const npcs = data.createSectorNpcEconomyStates();
const target = npcs.find((npc) => npc.job === 'freighter');
assert(target);
target.locationId = mapModule.narrowsSector.startLocationId;
target.aggression = 100;

const sector = sectorModule.createNpcSectorService(mapModule.narrowsSector, npcs, {
  getPlayerPosition: () => navigation.getSnapshot().currentPosition,
});

assert.equal(ai.npcDefenseReaction(target), 'fight');
target.aggression = 5;
assert.equal(ai.npcDefenseReaction(target), 'flee');
target.aggression = 100;

const weapon = components.getShipComponent('weapon', 'weapon1');
assert(weapon?.weapon);

const logs = [];
const engagements = engagementsModule.createStarMapEngagementService({
  navigation,
  sectorNpcs: sector,
  getPlayerShip: () => playerShip,
  getPlayerCombatant: () => ({
    id: 'player',
    name: playerShip.name,
    shipId: playerShip.id,
    shieldHp: 120,
    hullHp: 120,
    weapons: [weapon, weapon, weapon],
    hitChance: 0.95,
    dodgeChance: 0,
    damageMultiplier: 1.2,
    criticalChance: 0,
    cycleTimeMultiplier: 0.8,
  }),
  log: (message) => logs.push(message),
});

assert.equal(engagements.attackNpc(target.id), true);
assert.equal(navigation.getSnapshot().isPursuing, true);
assert.equal(sector.combatMode(target), 'pursue');

for (let step = 0; step < 800 && !engagements.activePlayerCombat(); step += 1) {
  sector.tick(0.1);
  engagements.syncPlayerPursuitTarget();
  navigation.tick(0.1);
  engagements.tick(0.1);
}

assert(engagements.activePlayerCombat(), 'interception must transition into strategic combat');
assert.equal(sector.combatMode(target), 'engaged');
assert(logs.some((entry) => entry.includes('KAMPF BEGINNT')));

const combat = engagements.activePlayerCombat();
for (let step = 0; step < 1000 && !combat.getSnapshot().winner; step += 1) {
  engagements.tick(0.1);
}
assert(combat.getSnapshot().winner, 'strategic combat must resolve using mounted ship weapons');

engagements.finishPlayerCombat();
const localTarget = npcs.find((npc) => npc.id !== target.id && npc.hullHp > 0);
assert(localTarget, 'test requires a second live NPC for direct local-space engagement');
assert.equal(
  engagements.engageNpcNow(localTarget.id),
  true,
  'local-space attack must enter combat immediately without a star-map pursuit'
);
assert(engagements.activePlayerCombat(), 'direct local-space engagement must create combat');

console.log('PASS pursuit, direct local engagement, NPC reaction and strategic combat start');
