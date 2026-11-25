'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { readModuleSource } = require('../module-source.cjs');
const read = (file) => readModuleSource(root, file);

const data = read('src/data/economy/sector-npc-economy.ts');
const sector = read('src/systems/npcs/npc-sector-service.ts');
const routing = read('src/systems/npcs/npc-sector-routing.ts');
const engagement = read('src/systems/combat/star-map-engagement-service.ts');
const combatSetup = read('src/systems/combat/npc-combatant-setup.ts');
const starModel = read('src/app/game-controller-star-map.ts');
const mapRenderer = read('src/ui/map/npc-ship-map-renderer.ts');
const combatRenderer = read('src/ui/combat/fleet-native-combat-renderer.ts');
const insignia = read('src/ui/ships/pirate-insignia-renderer.ts');
const combatAi = loadStandaloneTypeScriptModule(root, 'src/systems/npcs/npc-combat-ai.ts');

assert(
  data.includes('const PIRATE_NAMES = [') &&
    data.includes('const PIRATE_HOMES = {') &&
    data.includes("pirates: 'blackjaw-outpost'") &&
    data.includes("pirates2: 'gallows-anchor'"),
  'pirate population must have two persistent gang homes'
);
const piratePopulation = loadStandaloneTypeScriptModule(
  root,
  'src/data/economy/sector-npc-economy.ts'
)
  .createSectorNpcEconomyStates()
  .filter((npc) => npc.pirate);
assert.equal(piratePopulation.length, 9, 'the sector retains nine persistent pirate captains');
assert.equal(
  piratePopulation.filter((npc) => npc.factionId === 'pirates').length,
  5,
  'the Broken Spear retains five captains'
);
assert.equal(
  piratePopulation.filter((npc) => npc.factionId === 'pirates2').length,
  4,
  'the Black Tide retains four captains'
);
assert.deepEqual(
  Object.fromEntries(
    ['raider', 'reaver', 'marauder'].map((kind) => [
      kind,
      piratePopulation.filter((npc) => npc.pirateClass === kind).length,
    ])
  ),
  { raider: 3, reaver: 3, marauder: 3 },
  'all three physical pirate classes must spawn without player-level scaling'
);
assert(
  piratePopulation.every((npc) => npc.job === 'pirate' && npc.aggression >= 50),
  'pirates must retain hostile combat behavior while allowing class-specific aggression'
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
  routing.includes('export function pirateHuntDestination(') &&
    routing.includes('estimatedOpportunity') &&
    routing.includes('cargoUnits') &&
    routing.includes('riskCost') &&
    routing.includes('patrols') &&
    routing.includes('rivals') &&
    routing.includes('fuelExpense') &&
    sector.includes("'Auf Beutezug · Jagdrevier'"),
  'pirates must choose traffic-rich hunt zones while avoiding clustering and patrol pressure'
);

assert(
  engagement.includes('function scanForPiratePlayerAttack(') &&
    engagement.includes("'Korsaren-Abfangkurs'") &&
    engagement.includes('npcMayTargetNpc(attacker, candidate)') &&
    engagement.includes('settleNpcCombatPirateLoot(entry.first, entry.second, model.winner)') &&
    combatSetup.includes('export function transferPirateLoot(') &&
    combatSetup.includes('Math.min(10, Math.max(0, Math.floor(pirate.cargoCapacity - cargoUsed)))'),
  'pirates must intercept travelling players, raid civilian ships and steal up to ten cargo units'
);

const recovery = readModuleSource(root, 'src/systems/npcs/npc-sector-combat-recovery.ts');
assert(
  sector.includes('beginNpcCombatRecovery(') &&
    recovery.includes("npc.activityId = 'repair'") &&
    engagement.includes('KAMPFUNFÄHIG · BESATZUNG UND SCHIFF WERDEN GEBORGEN'),
  'pirates and civilians must survive defeat as disabled ships and recover instead of dying'
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

console.log(
  'PASS Voidbound-equivalent pirate population, hunt, raid, intercept and insignia wiring'
);
