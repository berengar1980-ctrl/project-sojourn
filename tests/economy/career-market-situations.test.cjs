'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { createMarketSituationService } = loadStandaloneTypeScriptModule(
  root, 'src/systems/economy/market-situation-service.ts'
);
const { sectorPorts } = loadStandaloneTypeScriptModule(root, 'src/data/ports/sector-ports.ts');
const { economyResources } = loadStandaloneTypeScriptModule(
  root, 'src/data/economy/economy-resources.ts'
);

const live = createMarketSituationService(sectorPorts, economyResources, 17);
live.advanceDay(12);
const checkpoint = live.exportState();
assert.equal(checkpoint.currentDay, 12);
const restored = createMarketSituationService(sectorPorts, economyResources, 17, checkpoint);
assert.deepEqual(restored.exportState(), checkpoint);
restored.advanceDay(12);
assert.deepEqual(restored.exportState(), checkpoint, 'replayed day must not regenerate events');
live.advanceDay(20);
restored.advanceDay(20);
assert.deepEqual(restored.exportState(), live.exportState(), 'future market events remain deterministic');
if (checkpoint.situations.length) {
  const item = checkpoint.situations[0];
  assert(item);
  const invalid = { ...checkpoint, situations: [
    { ...item, resourceModifiers: { 'unknown-resource': 0.5 } },
  ] };
  assert.throws(() => createMarketSituationService(sectorPorts, economyResources, 17, invalid));
  const altered = createMarketSituationService(sectorPorts, economyResources, 17, checkpoint);
  const exported = altered.exportState();
  if (exported.situations.length) {
    exported.situations[0].resourceModifiers[economyResources[0].id] = 0.2;
    assert.deepEqual(altered.exportState(), checkpoint, 'checkpoint export must be detached');
  }
}
assert.throws(() =>
  createMarketSituationService(sectorPorts, economyResources, 17, { ...checkpoint, currentDay: -7 })
);
assert.throws(() =>
  createMarketSituationService(sectorPorts, economyResources, 17, { ...checkpoint, situations: [null] })
);
console.log('PASS market situation checkpoint restores current events without replay or aliasing');
