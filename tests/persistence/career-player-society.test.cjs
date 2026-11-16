'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createSmugglingService } = load('src/systems/economy/smuggling-service.ts');
const { createTradeCharterService } = load('src/systems/economy/trade-charter-service.ts');
const { createFactionReputationService } = load(
  'src/systems/reputation/faction-reputation-service.ts'
);
const { captureCareerPlayerSociety, stageCareerPlayerSociety } = load(
  'src/systems/persistence/career-player-society.ts'
);

const player = { credits: 100000, cargo: {} };
const original = {
  charter: createTradeCharterService(player),
  smuggling: createSmugglingService(player, []),
  reputation: createFactionReputationService(['directorate', 'pirates']),
};
assert(original.reputation.change('pirates', -10));
original.smuggling.state.suspicion = 43;
original.smuggling.state.hiddenHoldIntel = true;
const saved = captureCareerPlayerSociety(original);
const credits = player.credits;
const next = stageCareerPlayerSociety(
  JSON.parse(JSON.stringify(saved)),
  player,
  [],
  ['test-ship'],
  ['directorate', 'pirates']
);
assert.deepEqual(captureCareerPlayerSociety(next), saved);
assert.equal(player.credits, credits, 'restore must not pay charter fees');
assert.equal(next.reputation.score('pirates'), -10);
next.smuggling.state.suspicion = 80;
assert.equal(original.smuggling.state.suspicion, 43);
const broken = JSON.parse(JSON.stringify(saved));
broken.reputation.scores.pirates = 300;
assert.throws(
  () => stageCareerPlayerSociety(broken, player, [], ['test-ship'], ['directorate', 'pirates']),
  /reputation/
);
console.log(
  'PASS player society: faction reputation, charter and smuggling resume without charges'
);
