'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { economyResources } = load('src/data/economy/economy-resources.ts');
const { sectorPorts } = load('src/data/ports/sector-ports.ts');
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const { createEconomySimulationService } = load('src/systems/economy/economy-simulation-service.ts');
const { createMarketSituationService } = load('src/systems/economy/market-situation-service.ts');
const { createMarketIntelService } = load('src/systems/economy/market-intel-service.ts');
const { createNpcEconomyService } = load('src/systems/economy/npc-economy-service.ts');
const { captureCareerEconomySession, stageCareerEconomySession } = load(
  'src/systems/economy/career-economy-session.ts'
);

const seed = 61;
const player = { credits: 10000, cargo: {} };
const npc = {
  id: 'session-npc',
  role: 'freighter',
  locationId: sectorPorts[0].locationId,
  credits: 10000,
  cargoCapacity: 40,
  cargo: {},
  workResourceIds: [],
};
const situations = createMarketSituationService(sectorPorts, economyResources, seed);
const markets = createEconomyMarketService(sectorPorts, economyResources, {
  situationModifier: (locationId, resourceId) => situations.modifier(locationId, resourceId),
});
const simulation = createEconomySimulationService(markets, player, economyResources, seed, [npc]);
const intel = createMarketIntelService(markets);
const npcs = createNpcEconomyService(markets, simulation, economyResources, [npc]);
situations.advanceDay(4);
simulation.advanceDay(4);
npcs.advanceDay(4);
intel.recordHistory(4);
intel.observeLocation(npc.locationId, 4);
const checkpoint = captureCareerEconomySession({ markets, simulation, situations, intel, npcs });
const savedNpc = JSON.parse(JSON.stringify(npc));
const savedPlayer = JSON.parse(JSON.stringify(player));
const staged = stageCareerEconomySession(
  checkpoint, sectorPorts, economyResources, savedPlayer, [savedNpc], seed
);
assert.deepEqual(captureCareerEconomySession(staged), checkpoint);
assert.notStrictEqual(staged.markets, markets);
assert.notStrictEqual(staged.simulation.pools, simulation.pools);
staged.npcs.advanceDay(4);
assert.equal(savedNpc.credits, npc.credits, 'saved day must never re-charge operations');
staged.simulation.advanceDay(4);
assert.deepEqual(staged.simulation.exportState(), checkpoint.pools);
const bad = {
  ...checkpoint,
  npcEconomy: { ...checkpoint.npcEconomy, npcIds: ['missing-npc'] },
};
assert.throws(() =>
  stageCareerEconomySession(bad, sectorPorts, economyResources, savedPlayer, [savedNpc], seed)
);
assert.deepEqual(captureCareerEconomySession({ markets, simulation, situations, intel, npcs }),
  checkpoint, 'bad staging must not mutate the original economy');
console.log('PASS economic service group roundtrip keeps NPC day, market prices and resources');
