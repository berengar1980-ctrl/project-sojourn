'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createCampaignRuntime } = load('src/systems/campaigns/campaign-runtime.ts');
const { createCampaignEventBus } = load('src/systems/campaigns/campaign-event-bus.ts');
const { captureCareerCampaigns, stageCareerCampaigns } = load(
  'src/systems/persistence/career-campaign-session.ts'
);

const quest = { id: 'save_quest', title: 'Career quest', version: 1, category: 'core' };
let grants = 0;
const port = {
  apply(action) {
    if (action.type !== 'credits.grant') return false;
    grants += action.amount;
    return true;
  },
};
const original = createCampaignRuntime(createCampaignEventBus(), undefined, undefined, port);
original.register(quest);
assert(original.start('save_quest'));
assert.equal(
  original.applyAction('save_quest', 'reward_one', { type: 'credits.grant', amount: 42 }),
  'applied'
);
assert.equal(grants, 42);
const saved = captureCareerCampaigns(original);
const staged = stageCareerCampaigns(JSON.parse(JSON.stringify(saved)), [quest], port);
assert.deepEqual(captureCareerCampaigns(staged.campaigns), saved);
assert.equal(
  staged.campaigns.applyAction('save_quest', 'reward_one', { type: 'credits.grant', amount: 42 }),
  'already_applied'
);
assert.equal(grants, 42, 'restore must never replay previously granted reward');
assert.equal(
  staged.campaigns.applyAction('save_quest', 'reward_two', { type: 'credits.grant', amount: 11 }),
  'rejected'
);
staged.activate();
assert.equal(
  staged.campaigns.applyAction('save_quest', 'reward_two', { type: 'credits.grant', amount: 11 }),
  'applied'
);
assert.equal(grants, 53);
const changed = captureCareerCampaigns(staged.campaigns);
assert.deepEqual(changed.campaigns.save_quest.appliedActionIds, ['reward_one', 'reward_two']);

const damaged = JSON.parse(JSON.stringify(saved));
damaged.campaigns.save_quest.appliedActionIds.push('reward_one');
assert.throws(() => stageCareerCampaigns(damaged, [quest], port), /receipts/);
assert.throws(() => stageCareerCampaigns(saved, [], port), /unavailable/);
assert.equal(grants, 53, 'failed staging must not pay rewards');
assert.deepEqual(captureCareerCampaigns(original), saved);
staged.campaigns.destroy();
original.destroy();
console.log('PASS campaign receipt restore, staged reward gating and corruption rejection');
