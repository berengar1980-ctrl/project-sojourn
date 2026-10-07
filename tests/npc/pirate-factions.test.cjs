'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const data = loadStandaloneTypeScriptModule(
  root,
  'src/data/economy/sector-npc-economy.ts'
);
const combatAi = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-combat-ai.ts'
);

const npcs = data.createSectorNpcEconomyStates();
const pirates = npcs.filter((npc) => npc.pirate);

assert.equal(pirates.length, 9, 'Sojourn should start with the Voidbound-equivalent pirate population');
assert.equal(
  pirates.filter((npc) => npc.pirateFaction === 'harrow-corsairs').length,
  5,
  'Harrow Corsairs should have five initial ships'
);
assert.equal(
  pirates.filter((npc) => npc.pirateFaction === 'black-tide').length,
  4,
  'Black Tide should have four initial ships'
);
assert(
  pirates.every((npc) => npc.job === 'patrol' && npc.shipId.startsWith('patrol-60m-variant-')),
  'pirates must temporarily use patrol hulls'
);
assert(
  pirates.every((npc) => npc.aggression >= 75),
  'pirates should inherit Voidbound-style high aggression'
);
assert(
  pirates
    .filter((npc) => npc.pirateFaction === 'harrow-corsairs')
    .every(
      (npc) =>
        npc.pirateHomeLocationId === 'blackjaw-outpost' &&
        npc.pirateEmblem === 'harrow-claw'
    ),
  'Harrow Corsairs need their own base and insignia'
);
assert(
  pirates
    .filter((npc) => npc.pirateFaction === 'black-tide')
    .every(
      (npc) =>
        npc.pirateHomeLocationId === 'gallows-anchor' &&
        npc.pirateEmblem === 'black-cross'
    ),
  'Black Tide needs its own base and insignia'
);

const pirate = pirates[0];
assert(pirate);
assert.equal(combatAi.npcMayInitiateAttack(pirate), true);
assert.equal(combatAi.npcLooksHostileToPatrol(pirate), true);

const pirateService = fs.readFileSync(
  path.join(root, 'src/systems/npcs/pirate-npc-service.ts'),
  'utf8'
);
const engagements = fs.readFileSync(
  path.join(root, 'src/systems/combat/star-map-engagement-service.ts'),
  'utf8'
);
const renderer = fs.readFileSync(
  path.join(root, 'src/ui/map/npc-ship-map-renderer.ts'),
  'utf8'
);
const economy = fs.readFileSync(
  path.join(root, 'src/systems/economy/npc-economy-service.ts'),
  'utf8'
);

assert(
  pirateService.includes('chooseHuntZone') &&
    pirateService.includes('locationTraffic') &&
    pirateService.includes('pirateDensity') &&
    pirateService.includes('patrolPressure') &&
    pirateService.includes('Kampfschäden · Rückzug') &&
    pirateService.includes('maintainPopulation'),
  'pirate autonomy must preserve Voidbound hunt-zone, anti-clustering, patrol-pressure, retreat and replacement behavior'
);

assert(
  engagements.includes('startPirateAttackPlayer') &&
    engagements.includes("['freighter', 'miner', 'salvager']") &&
    engagements.includes('pirateLoot') &&
    engagements.includes('NOTSIGNAL > KORSARENÜBERFALL'),
  'pirates must intercept the player and civilian prey and resolve raids through shared combat'
);

assert(
  renderer.includes("'harrow-claw'") &&
    renderer.includes("'black-cross'") &&
    renderer.includes("'black-tide'"),
  'the two pirate gangs must have visibly distinct map insignia'
);

assert(
  economy.includes("pirate?: boolean") && economy.includes('.pirate) continue'),
  'pirates must stay out of civilian trade/rest autonomy'
);

console.log('PASS Voidbound-style pirate factions, hunting, raids, recovery and insignia');
