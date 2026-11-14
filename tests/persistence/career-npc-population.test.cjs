'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createNpcPopulationService } = load('src/systems/npcs/npc-population-service.ts');
const { stageNpcPopulationCheckpoint } = load(
  'src/systems/npcs/npc-population-checkpoint.ts'
);
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');

const markets = { snapshot: () => [], recalculate: () => {} };
const npcs = createSectorNpcEconomyStates();
const population = createNpcPopulationService(npcs, markets);
const initial = population.fundCredits;
population.collectTradeCommission(230);
assert.equal(population.fundCredits, initial + 230);
const npc = npcs.find((entry) => entry.job === 'freighter' && !entry.pirate);
assert(npc);
npc.credits = 0;
npc.combatDefeats = 3;
assert(population.scheduleDefeated(npc, 12));
const checkpoint = population.exportState();
assert.deepEqual(checkpoint, {
  version: 1,
  fundCredits: initial + 230,
  replacementCount: 0,
});
const staged = stageNpcPopulationCheckpoint(JSON.parse(JSON.stringify(checkpoint)));
const freshNpcs = JSON.parse(JSON.stringify(npcs));
const resumed = createNpcPopulationService(freshNpcs, markets, () => {}, staged);
assert.deepEqual(resumed.exportState(), checkpoint);
assert.equal(resumed.outstanding, 1);
resumed.advanceDay(16);
assert.equal(resumed.outstanding, 1, 'Early replacement must not occur');
assert.deepEqual(population.exportState(), checkpoint, 'Restoring must not touch live fund');
for (const bad of [
  { ...checkpoint, fundCredits: -1 },
  { ...checkpoint, fundCredits: Number.NaN },
  { ...checkpoint, replacementCount: 1.3 },
  { ...checkpoint, version: 99 },
]) {
  assert.throws(() => stageNpcPopulationCheckpoint(bad), /Populationsspielstand/);
  assert.throws(() => createNpcPopulationService(freshNpcs, markets, () => {}, bad));
}
assert.equal(population.fundCredits, initial + 230);
console.log('PASS population checkpoint: funds, pending retirements and validation');
