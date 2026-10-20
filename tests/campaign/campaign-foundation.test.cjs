'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const bus = loadStandaloneTypeScriptModule(root, 'src/systems/campaigns/campaign-event-bus.ts');
const runtime = loadStandaloneTypeScriptModule(root, 'src/systems/campaigns/campaign-runtime.ts');
const bridge = loadStandaloneTypeScriptModule(root, 'src/app/game-controller-campaign-events.ts');

const errors = [];
const events = bus.createCampaignEventBus((error) => errors.push(error));
const delivered = [];
const unsubscribe = events.subscribe((event) => {
  delivered.push(event.type);
  if (event.type === 'game.initialized') {
    events.emit({ type: 'location.arrived', fromLocationId: null, locationId: 'haven' });
  }
});
events.subscribe(() => {
  throw new Error('broken optional observer');
});
events.emit({
  type: 'game.initialized',
  captainName: 'Mara Voss',
  portraitId: 4,
  shipId: 'salvage-v1',
  stationId: 'helm',
});
assert.deepEqual(delivered, ['game.initialized', 'location.arrived'], 'events are FIFO');
assert.equal(errors.length, 2, 'faulty event listeners are isolated');
unsubscribe();
events.emit({
  type: 'combat.ended',
  attackerId: 'player',
  defenderId: 'enemy',
  winner: 'attacker',
  outcomeReason: 'destruction',
});
assert.equal(delivered.length, 2, 'unsubscribe removes event listeners');

const engineBus = bus.createCampaignEventBus();
const engine = runtime.createCampaignRuntime(engineBus);
const registration = {
  id: 'story_one',
  title: 'Story one',
  version: 1,
  category: 'core',
  onEvent(event, campaign) {
    if (event.type === 'game.initialized') {
      campaign.start();
      campaign.set('station', event.stationId);
    }
    if (event.type === 'location.arrived' && campaign.status() === 'active') {
      campaign.set('lastPlace', event.locationId);
    }
  },
};
engine.register(registration);
engine.register({
  id: 'story_two',
  title: 'Story two',
  version: 1,
  defaultEnabled: false,
  onEvent(_event, campaign) {
    campaign.start();
  },
});
assert.equal(engine.list().length, 2);
assert.throws(() => engine.register(registration), /Duplicate campaign/);
assert.equal(engine.setEnabled('story_one', false), false, 'core cannot be disabled');
assert.equal(engine.isEnabled('story_two'), false);
engineBus.emit({
  type: 'game.initialized',
  captainName: 'Mara Voss',
  portraitId: 4,
  shipId: 'salvage-v1',
  stationId: 'sensor_station',
});
assert.equal(engine.isActive('story_one'), true);
assert.equal(engine.get('story_one', 'station'), 'sensor_station');
assert.equal(engine.isActive('story_two'), false);
engineBus.emit({ type: 'location.arrived', locationId: 'station-2', fromLocationId: 'haven' });
assert.equal(engine.get('story_one', 'lastPlace'), 'station-2');
assert.equal(engine.complete('story_one', 'success'), true);
assert.equal(engine.complete('story_one', 'success'), false, 'completion happens once');
const save = engine.snapshot();
assert.equal(save.snapshotVersion, 1);
assert.equal(save.campaigns.story_one.outcome, 'success');
assert.equal(save.enabled.story_one, true);
assert.equal(save.enabled.story_two, false);
assert.equal(engine.setEnabled('story_two', true), true);
assert.equal(engine.snapshot().enabled.story_two, true);
assert.throws(() => engine.set('story_one', 'bad', 'value'), /inactive campaign/);
engine.destroy();

const unknown = JSON.parse(JSON.stringify(save));
unknown.campaigns.deleted_package = {
  version: 1,
  status: 'active',
  data: { chapter: 2 },
};
const loaded = runtime.createCampaignRuntime(bus.createCampaignEventBus(), unknown);
loaded.register(registration);
assert.deepEqual(
  loaded.unavailableIds(),
  ['story_two', 'deleted_package'],
  'all unregistered packages survive load'
);
assert.equal(loaded.get('story_one', 'station'), 'sensor_station');
assert.equal(loaded.start('story_one'), false, 'completed story must stay completed');
assert.equal(loaded.snapshot().campaigns.deleted_package.data.chapter, 2);
loaded.destroy();

const older = runtime.createCampaignRuntime(bus.createCampaignEventBus(), {
  snapshotVersion: 1,
  enabled: {},
  campaigns: { legacy: { version: 1, status: 'active', data: { chapter: 2 } } },
});
older.register({ id: 'legacy', title: 'Legacy', version: 2 });
assert.deepEqual(older.unavailableIds(), ['legacy'], 'incompatible data are not overwritten');
assert.equal(older.isEnabled('legacy'), false);
assert.equal(older.snapshot().campaigns.legacy.data.chapter, 2);
older.destroy();

const migratable = runtime.createCampaignRuntime(bus.createCampaignEventBus(), {
  snapshotVersion: 1,
  enabled: {},
  campaigns: { legacy: { version: 1, status: 'active', data: { chapter: 2 } } },
});
migratable.register({
  id: 'legacy',
  title: 'Legacy',
  version: 2,
  migrate: (previous) => ({
    ...previous,
    version: 2,
    data: { ...previous.data, migrated: true },
  }),
});
assert.equal(migratable.isActive('legacy'), true);
assert.equal(migratable.get('legacy', 'migrated'), true);
const detached = migratable.snapshot();
detached.campaigns.legacy.data.chapter = 999;
assert.equal(migratable.get('legacy', 'chapter'), 2, 'snapshots cannot mutate engine state');
assert.throws(() => migratable.set('legacy', 'invalid', Number.NaN), /Non-JSON/);
migratable.destroy();
assert.throws(
  () =>
    runtime.createCampaignRuntime(bus.createCampaignEventBus(), {
      snapshotVersion: 20,
      enabled: {},
      campaigns: {},
    }),
  /Unsupported campaign snapshot version/
);

const services = bridge.createControllerCampaignServices(
  { captainName: 'Mara', portraitId: 4, stationId: 'helm' },
  'salvage-v1',
  { currentLocationId: 'haven', isTravelling: false, isPursuing: false },
  [
    {
      id: 'startup',
      title: 'Startup',
      version: 1,
      category: 'core',
      onEvent(event, context) {
        if (event.type === 'game.initialized') {
          context.start();
          context.set('captain', event.captainName);
        }
      },
    },
  ]
);
assert.equal(services.campaigns.get('startup', 'captain'), 'Mara');
services.campaigns.destroy();

const navEvents = [];
const navBus = bus.createCampaignEventBus();
navBus.subscribe((event) => navEvents.push(event));
const initial = { currentLocationId: 'haven', isTravelling: false, isPursuing: false };
const tracker = bridge.createCampaignNavigationTracker(navBus, initial);
tracker.observe({
  ...initial,
  currentLocationId: null,
  isTravelling: true,
  destinationId: 'relay',
});
tracker.observe({
  ...initial,
  currentLocationId: null,
  isTravelling: true,
  destinationId: 'relay',
});
tracker.observe({ ...initial, currentLocationId: 'relay', isTravelling: false });
assert.deepEqual(navEvents, [
  { type: 'travel.started', fromLocationId: 'haven', destinationId: 'relay' },
  { type: 'location.arrived', fromLocationId: 'haven', locationId: 'relay' },
]);
bridge.emitCampaignCombatEnded(navBus, {
  attacker: { id: 'player' },
  defender: { id: 'pirate' },
  winner: 'attacker',
  outcomeReason: 'destruction',
});
assert.equal(navEvents[2].type, 'combat.ended');

const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');
const boarding = fs.readFileSync(
  path.join(root, 'src/app/game-controller-combat-boarding.ts'),
  'utf8'
);
assert.match(controller, /createControllerCampaignServices/);
assert.match(controller, /campaignNavigation\.observe\(navigationSnapshot\)/);
assert.match(controller, /emitCampaignCombatEnded\(/);
assert.match(
  fs.readFileSync(path.join(root, 'src/app/game-controller-campaign-events.ts'), 'utf8'),
  /type: 'game.initialized'/
);
assert.match(boarding, /type: 'boarding.ended'/);
console.log('PASS campaign event bus, isolated runtime, versioned snapshots and gameplay hooks');
