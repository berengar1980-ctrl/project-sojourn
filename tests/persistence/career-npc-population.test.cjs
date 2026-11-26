'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createNpcPopulationService } = load('src/systems/npcs/npc-population-service.ts');
const { stageNpcPopulationCheckpoint } = load('src/systems/npcs/npc-population-checkpoint.ts');
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

const { npcWorkingCapital } = load('src/systems/economy/npc-operating-decisions.ts');
const poorMiner = createSectorNpcEconomyStates().find((entry) => entry.job === 'miner');
poorMiner.credits = 0;
const emptyFund = { version: 1, fundCredits: 0, replacementCount: 0 };
const continuity = createNpcPopulationService([poorMiner], markets, () => {}, emptyFund);
continuity.advanceDay(1);
continuity.advanceDay(3);
assert.equal(poorMiner.credits, 0);
continuity.advanceDay(4);
assert.equal(poorMiner.credits, npcWorkingCapital(poorMiner) * 3);
assert.equal(continuity.externalFunding, poorMiner.credits);
const funding = continuity.externalFunding;
continuity.advanceDay(4);
assert.equal(continuity.externalFunding, funding);
assert(continuity.scheduleDefeated(poorMiner, 4));
const due = poorMiner.retiredUntilDay;
assert(due >= 9 && due <= 19);
continuity.advanceDay(due - 1);
assert.equal(continuity.outstanding, 1);
continuity.advanceDay(due);
assert.equal(continuity.outstanding, 0);
assert.equal(poorMiner.hullHp, poorMiner.hullMaxHp);
assert.equal(poorMiner.replacementGeneration, 1);
assert.equal(continuity.fundCredits, 0);
assert(continuity.externalFunding > funding);
assert.deepEqual(
  stageNpcPopulationCheckpoint(JSON.parse(JSON.stringify(continuity.exportState()))),
  continuity.exportState()
);
for (const [job, min, max] of [
  ['patrol', 3, 10],
  ['pirate', 1, 4],
]) {
  const ship = createSectorNpcEconomyStates().find((entry) => entry.job === job);
  const service = createNpcPopulationService([ship], markets, () => {}, emptyFund);
  assert(service.scheduleDefeated(ship, 20));
  assert(ship.retiredUntilDay >= 20 + min && ship.retiredUntilDay <= 20 + max);
  service.advanceDay(ship.retiredUntilDay);
  assert.equal(ship.replacementGeneration, 1);
  assert.equal(service.outstanding, 0);
}
console.log('PASS guaranteed replacement, refinancing and persisted external funding');
