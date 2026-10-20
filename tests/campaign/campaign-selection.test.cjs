'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (name) => loadStandaloneTypeScriptModule(root, name);
const { createCampaignSelection } = load('src/systems/campaigns/campaign-selection.ts');
const { silentSignalCampaign } = load('src/data/campaigns/silent-signal.ts');
const { createControllerCampaignServices } = load('src/app/game-controller-campaign-events.ts');

const required = { id: 'required', title: 'Required', version: 1, category: 'core' };
const optional = { id: 'another', title: 'Another', version: 2, category: 'optional' };
const registry = [silentSignalCampaign, required, optional];
const selected = createCampaignSelection(registry);

assert.equal(selected.list().length, registry.length, 'all registered packages must be listed');
assert.deepEqual(
  selected.list().map((entry) => entry.id),
  registry.map((definition) => definition.id),
  'menu order follows the manifest'
);
assert.equal(selected.list()[0].description, silentSignalCampaign.description);
assert.equal(selected.list()[0].category, 'development');
assert.equal(selected.list()[0].enabled, false, 'reference story must start disabled');
assert.equal(selected.list()[1].enabled, true);
assert.equal(selected.list()[2].enabled, true);
assert.equal(selected.setEnabled('absent', true), false, 'unregistered selection must be rejected');
assert.equal(selected.setEnabled('required', false), false, 'core packages cannot be disabled');
assert.equal(selected.snapshot().required, true);
assert.equal(selected.setEnabled('another', false), true);
assert.equal(selected.setEnabled('silent-signal', true), true);
const firstLaunch = selected.snapshot();
assert.deepEqual(firstLaunch, { 'silent-signal': true, required: true, another: false });
firstLaunch.required = false;
assert.equal(selected.snapshot().required, true, 'snapshot cannot mutate menu selection');
assert.equal(selected.setEnabled('silent-signal', false), true);
assert.equal(firstLaunch['silent-signal'], true, 'earlier launch selection is detached');
assert.throws(() => createCampaignSelection([optional, optional]), /Duplicate campaign/);

function bootWith(selection) {
  let additions = 0;
  const services = createControllerCampaignServices(
    { captainName: 'Mara', portraitId: 1, stationId: 'helm' },
    'salvage-100m-variant-01',
    { currentLocationId: 'haven', isTravelling: false, isPursuing: false },
    [silentSignalCampaign],
    {
      apply(action) {
        if (action.type !== 'world.location.add') return false;
        additions += 1;
        return true;
      },
    },
    selection
  );
  return { ...services, additions: () => additions };
}

const disabled = bootWith(selected.snapshot());
assert.equal(disabled.campaigns.isEnabled('silent-signal'), false);
assert.equal(disabled.campaigns.isActive('silent-signal'), false);
assert.equal(disabled.campaigns.journal('haven').length, 0);
assert.equal(disabled.additions(), 0, 'disabled story must not spawn a mission location');
disabled.campaigns.destroy();

const enabled = bootWith(firstLaunch);
assert.equal(enabled.campaigns.isEnabled('silent-signal'), true);
assert.equal(enabled.campaigns.isActive('silent-signal'), true);
assert.equal(enabled.additions(), 1, 'selected story must initialize on new game');
assert.equal(enabled.campaigns.journal('haven')[0].title, 'Das verstummte Signal');
enabled.campaigns.destroy();

const manifest = fs.readFileSync(path.join(root, 'src/data/campaigns/manifest.ts'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'src/app/bootstrap.ts'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');
assert(manifest.includes('silentSignalCampaign'), 'the manifest is the package registry');
assert(bootstrap.includes('createCampaignSelection(campaignPackages)'));
assert(bootstrap.includes('campaignSelection: selection.snapshot()'));
assert(controller.includes('options'), 'game controller receives game options');
console.log('PASS campaign selection: manifest, core locking, startup and detached state');
