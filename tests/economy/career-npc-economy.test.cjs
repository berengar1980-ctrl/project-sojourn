'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createNpcEconomyService } = load('src/systems/economy/npc-economy-service.ts');
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const { economyResources } = load('src/data/economy/economy-resources.ts');
const { sectorPorts } = load('src/data/ports/sector-ports.ts');
const markets = createEconomyMarketService(sectorPorts, economyResources);
const allocator = {
  createMinedResource: () => 0,
  allocatePhysicalResource: () => 0,
};
const npc = {
  id: 'checkpoint-trader',
  role: 'freighter',
  locationId: sectorPorts[0].locationId,
  credits: 10000,
  cargoCapacity: 10,
  cargo: {},
  workResourceIds: [],
};
const first = createNpcEconomyService(markets, allocator, economyResources, [npc]);
first.advanceDay(3);
const saved = first.exportState();
const credits = npc.credits;
const intel = JSON.stringify(npc.marketIntel);
const restoredNpc = JSON.parse(JSON.stringify(npc));
const second = createNpcEconomyService(
  markets,
  allocator,
  economyResources,
  [restoredNpc],
  {},
  saved
);
assert.deepEqual(second.exportState(), saved);
assert.equal(JSON.stringify(restoredNpc.marketIntel), intel);
second.advanceDay(3);
assert.equal(restoredNpc.credits, credits, 'restore must not charge already processed days');
second.advanceDay(4);
assert(restoredNpc.credits <= credits);
assert.equal(second.exportState().lastDay, 4);
assert.throws(
  () =>
    createNpcEconomyService(markets, allocator, economyResources, [restoredNpc], {}, {
      ...saved,
      npcIds: ['unknown'],
    }),
  /identity mismatch/
);
assert.throws(() =>
  createNpcEconomyService(markets, allocator, economyResources, [restoredNpc], {}, {
    ...saved,
    lastDay: -8,
  })
);
console.log('PASS NPC economy checkpoint keeps daily settlements and market intel idempotent');
