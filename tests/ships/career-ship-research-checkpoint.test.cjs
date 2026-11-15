'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createShipyardResearchService, stageCareerShipyardResearch } = load(
  'src/systems/ships/shipyard-research-service.ts'
);
const live = createShipyardResearchService();
assert(live.registerComponent('weapon', 'special_performance_12_weapon1'));
const saved = live.snapshot();
const staged = stageCareerShipyardResearch(saved);
assert.deepEqual(staged.snapshot(), saved);
assert.notStrictEqual(staged.snapshot()['weapon:weapon1'], live.snapshot()['weapon:weapon1']);
assert.equal(staged.registerComponent('weapon', 'special_performance_20_weapon1'), true);
assert.equal(live.snapshot()['weapon:weapon1'].performance, 12);
for (const invalid of [
  { 'weapon:missing': { efficiency: 0, performance: 12 } },
  { 'weapon:weapon1': { efficiency: -1, performance: 12 } },
  { 'weapon:weapon1': { efficiency: 0, performance: Infinity } },
  { 'weapon:weapon1': { efficiency: 0, performance: 101 } },
]) {
  assert.throws(() => stageCareerShipyardResearch(invalid));
}
console.log('PASS career research checkpoint: detached tiers and validation');
