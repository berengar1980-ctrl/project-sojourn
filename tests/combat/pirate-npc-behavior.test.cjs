'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const data = read('src/data/economy/sector-npc-economy.ts');
const sector = read('src/systems/npcs/npc-sector-service.ts');
const engagement = read('src/systems/combat/star-map-engagement-service.ts');
const starModel = read('src/app/game-controller-star-map.ts');
const mapRenderer = read('src/ui/map/npc-ship-map-renderer.ts');
const combatRenderer = read('src/ui/combat/strategic-combat-renderer.ts');
const insignia = read('src/ui/ships/pirate-insignia-renderer.ts');
const combatAi = loadStandaloneTypeScriptModule(root, 'src/systems/npcs/npc-combat-ai.ts');

assert(
  data.includes('const PIRATE_NAMES = [') &&
    data.includes("const PIRATE_HOMES = {") &&
    data.includes("pirates: 'blackjaw-outpost'") &&
    data.includes("pirates2: 'gallows-anchor'"),
  'pirate population must have two persistent gang homes'
);
assert(
  data.includes("const factionId = index < 5 ? 'pirates' : 'pirates2'") &&
    data.includes("job: 'pirate'") &&
    data.includes('patrolVariantShips[index % patrolVariantShips.length]') &&
    data.includes('aggression: 75 +'),
  'nine high-aggression pirates must temporarily use patrol hulls with a 5/4 faction split'
);
assert(
  data.includes("pirateMark: factionId === 'pirates' ? 'broken-spear' : 'black-tide'"),
  'the two gangs must carry different insignia ids'
);

const prey = {
  id: 'prey',
  name: 'Prey',
  role: 'freighter',
  job: 'freighter',
  shipId: 'x',
  locationId: 'haven',
  credits: 0,
  cargoCapacity: 10,
  cargo: {},
  workResourceIds: [],
  fuel: 1,
  fuelCapacity: 1,
  fuelUse: 1,
  hullHp: 100,
  hullMaxHp: 100,
  aggression: 5,
  workRiskPreference: 'safe',
  activityId: 'dock',
  activity: 'dock',
  successfulRuns: 0,
};
const pirate = {
  ...prey,
  id: 'pirate',
  job: 'pirate',
  role: 'patrol',
  pirate: true,
  aggression: 90,
};
assert.equal(combatAi.npcIsPiratePrey(prey), true);
assert.equal(combatAi.npcLooksHostileToPatrol(pirate), true);
assert.equal(combatAi.npcMayInitiateAttack(pirate), true);

assert(
  sector.includes('function pirateHuntDestination(') &&
    sector.includes('traffic * 2.4') &&
    sector.includes('density * 3.4') &&
    sector.includes('patrolPressure * 0.85') &&
    sector.includes("'Auf Beutezug · Jagdrevier'") &&
    sector.includes('PIRATE_POPULATION_TARGET = 9') &&
    sector.includes('schedulePirateRespawns') &&
    sector.includes('deployDuePirateRespawns'),
  'pirates must choose traffic-rich hunt zones, avoid clustering/patrol pressure and replenish losses'
);

assert(
  engagement.includes('function scanForPiratePlayerAttack()') &&
    engagement.includes("'Korsaren-Abfangkurs'") &&
    engagement.includes('npcIsPiratePrey(candidate)') &&
    engagement.includes('function transferPirateLoot(') &&
    engagement.includes('remaining = 10'),
  'pirates must intercept travelling players, raid civilian ships and steal up to ten cargo units'
);

assert(
  starModel.includes('civilianTransponder: npc.pirate !== true') &&
    starModel.includes('pirate: npc.pirate === true'),
  'pirates must use pirate sensor detection instead of civilian transponders'
);

assert(
  insignia.includes("mark === 'broken-spear'") &&
    insignia.includes("'black-tide'") &&
    mapRenderer.includes('drawPirateInsignia') &&
    combatRenderer.includes('drawPirateInsignia'),
  'both gang insignia must render on the star map and during combat'
);

console.log('PASS Voidbound-equivalent pirate population, hunt, raid, intercept and insignia wiring');
