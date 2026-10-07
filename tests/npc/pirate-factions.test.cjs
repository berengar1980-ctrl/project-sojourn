'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const data = read('src/data/economy/sector-npc-economy.ts');
const pirateService = read('src/systems/npcs/pirate-npc-service.ts');
const engagements = read('src/systems/combat/star-map-engagement-service.ts');
const renderer = read('src/ui/map/npc-ship-map-renderer.ts');
const starModel = read('src/app/game-controller-star-map.ts');
const economy = read('src/systems/economy/npc-economy-service.ts');

for (const name of [
  'Azrael Crovus',
  'Borsk Dhal',
  'Cairn Eshkar',
  'Dagan Frayne',
  'Ezek Vargos',
  'Fenric Ghor',
  'Gideon Hrax',
  'Havel Jurn',
  'Ishar Krail',
]) {
  assert(data.includes(name), 'missing Voidbound pirate captain: ' + name);
}

assert(
  data.includes("index < 5") &&
    data.includes("'harrow-corsairs'") &&
    data.includes("'black-tide'"),
  'initial pirates must be split 5/4 across the two gangs'
);
assert(
  data.includes("pirateEmblem: firstGang ? 'harrow-claw' : 'black-cross'") &&
    data.includes("firstGang ? 'blackjaw-outpost' : 'gallows-anchor'"),
  'each gang must have a distinct emblem and home base'
);
assert(
  data.includes("const ship = patrolVariantShips[index % patrolVariantShips.length]!"),
  'pirates must temporarily use patrol hull variants'
);
assert(
  data.includes('aggression: 76 + ((index * 7) % 23)'),
  'pirates should inherit Voidbound-style high aggression'
);

const combatAi = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-combat-ai.ts'
);
const pirate = {
  id: 'pirate-test',
  pirate: true,
  job: 'patrol',
  hullHp: 100,
  hullMaxHp: 100,
  aggression: 90,
};
assert.equal(combatAi.npcMayInitiateAttack(pirate), true);
assert.equal(combatAi.npcLooksHostileToPatrol(pirate), true);

assert(
  pirateService.includes('chooseHuntZone') &&
    pirateService.includes('locationTraffic') &&
    pirateService.includes('pirateDensity') &&
    pirateService.includes('patrolPressure') &&
    pirateService.includes('Kampfschäden · Rückzug') &&
    pirateService.includes('maintainPopulation'),
  'pirate autonomy must preserve hunt zones, anti-clustering, patrol pressure, retreat and replacement'
);

assert(
  engagements.includes('startPirateAttackPlayer') &&
    engagements.includes("['freighter', 'miner', 'salvager']") &&
    engagements.includes('pirateLoot') &&
    engagements.includes('NOTSIGNAL > KORSARENÜBERFALL'),
  'pirates must intercept player/civilian prey and resolve raids through shared combat'
);

assert(
  renderer.includes("'harrow-claw'") &&
    renderer.includes("'black-cross'") &&
    renderer.includes("'black-tide'"),
  'the two gangs must have visibly distinct map insignia'
);
assert(
  starModel.includes('civilianTransponder: !npc.pirate') &&
    starModel.includes('npc.pirateFaction && npc.pirateEmblem'),
  'pirates must use shorter non-civilian contact ranges and reveal insignia only after identification'
);
assert(
  economy.includes("pirate?: boolean") && economy.includes('.pirate) continue'),
  'pirates must stay out of civilian trade/rest autonomy'
);

console.log('PASS Voidbound-style pirate factions, hunting, raids, recovery and insignia');
