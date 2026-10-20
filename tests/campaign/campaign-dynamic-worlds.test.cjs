'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (name) => loadStandaloneTypeScriptModule(root, name);
const navModule = load('src/systems/navigation/navigation-service.ts');
const worldModule = load('src/systems/campaigns/campaign-world-service.ts');
const runtimeModule = load('src/systems/campaigns/campaign-runtime.ts');
const busModule = load('src/systems/campaigns/campaign-event-bus.ts');

function location(id, x, y) {
  return {
    id,
    name: id,
    kind: 'station',
    position: { x, y },
    radius: 12,
    description: 'Mission location',
    activities: { missions: true },
    dangerLevel: 0,
  };
}

function world(id, first, second) {
  return {
    id,
    name: id,
    width: 1200,
    height: 900,
    startLocationId: first.id,
    star: {
      id: 'star-' + id,
      name: 'Distant Star',
      position: { x: 600, y: 450 },
      radius: 35,
      colorCore: '#eeeeee',
      colorCorona: '#cccccc',
    },
    locations: [first, second],
    regions: [],
  };
}

const home = world('home-system', location('harbor', 100, 200), location('relay', 900, 300));
const far = world(
  'distant-system',
  location('remote-entry', 100, 200),
  location('remote-exit', 900, 300)
);
const nav = navModule.createNavigationService(home, 'harbor', 100);
const registry = worldModule.createCampaignWorldService(home, nav);

assert.equal(registry.world().locations.length, 2);
assert.equal(registry.addLocation('story_a', location('mission-one', 450, 280)), true);
assert.equal(registry.addLocation('story_b', location('mission-one', 430, 280)), false);
assert.equal(registry.addLocation('story_a', location('harbor', 450, 280)), false);
assert.equal(registry.addLocation('story_a', location('mission-two', -10, 280)), false);
assert.equal(
  registry.addLocation('story_a', {
    ...location('mission-shop', 300, 300),
    activities: { missions: true, trade: true },
  }),
  false,
  'campaign place cannot advertise an unregistered trade service'
);
assert.equal(registry.world().locations.length, 3);
nav.selectDestination('mission-one');
assert.equal(nav.getSnapshot().selectedDestinationId, 'mission-one');
const shot = registry.snapshot();
shot.locations.story_a[0].position.x = 9000;
assert.equal(registry.world().locations[2].position.x, 450, 'snapshot must be detached');

assert.equal(
  registry.addSystem('story_a', {
    map: far,
    entryLocationId: 'remote-entry',
    exitLocationId: 'remote-exit',
  }),
  true
);
assert.equal(
  registry.addSystem('story_b', {
    map: far,
    entryLocationId: 'remote-entry',
    exitLocationId: 'remote-exit',
  }),
  false,
  'system IDs are globally unique'
);
assert.equal(registry.enterSystem('story_a', 'distant-system'), true);
assert.equal(registry.inForeignSystem(), true);
assert.equal(nav.getSnapshot().currentLocationId, 'remote-entry');
assert.equal(registry.world().id, 'distant-system');
assert.equal(registry.exitLocationId(), 'remote-exit');
assert.equal(registry.returnFromSystem('story_b'), false, 'other packages cannot eject player');
assert.equal(registry.returnFromSystem('story_a'), false, 'must visit an exit gate');
nav.selectDestination('remote-exit');
nav.startTravel();
assert.equal(registry.enterSystem('story_a', 'distant-system'), false);
for (let i = 0; i < 2500 && nav.getSnapshot().isTravelling; i += 1) nav.tick(0.1);
assert.equal(nav.getSnapshot().currentLocationId, 'remote-exit');
assert.equal(registry.returnFromSystem('story_a'), true);
assert.equal(registry.inForeignSystem(), false);
assert.equal(nav.getSnapshot().currentLocationId, 'harbor');
assert.equal(registry.world().locations.length, 3);

nav.selectDestination('mission-one');
nav.startTravel();
assert.equal(nav.getSnapshot().isTravelling, true);
registry.releaseCampaign('story_a');
assert.equal(registry.world().locations.length, 2);
assert.equal(nav.getSnapshot().isTravelling, false, 'removed destination aborts voyage');
assert.equal(nav.getSnapshot().selectedDestinationId, null, 'orphan selection disappears');
assert.equal(registry.snapshot().systems.story_a, undefined);
assert.equal(registry.addLocation('story_a', location('mission-one', 420, 280)), true);

const missionPort = {
  apply(action, campaignId) {
    if (action.type === 'world.location.add') {
      return registry.addLocation(campaignId, action.location);
    }
    if (action.type === 'world.system.add') {
      return registry.addSystem(campaignId, {
        map: action.map,
        entryLocationId: action.entryLocationId,
        exitLocationId: action.exitLocationId,
      });
    }
    if (action.type === 'world.system.enter') {
      return registry.enterSystem(campaignId, action.systemId);
    }
    if (action.type === 'world.system.return') return registry.returnFromSystem(campaignId);
    return false;
  },
  releaseCampaign: (id) => registry.releaseCampaign(id),
};
const runtime = runtimeModule.createCampaignRuntime(
  busModule.createCampaignEventBus(),
  undefined,
  undefined,
  missionPort
);
runtime.register({ id: 'story_c', title: 'Story C', version: 1 });
runtime.start('story_c');
assert.equal(
  runtime.applyAction('story_c', 'place:one', {
    type: 'world.location.add',
    location: location('mission-three', 550, 280),
  }),
  'applied'
);
assert.equal(
  runtime.applyAction('story_c', 'place:one', {
    type: 'world.location.add',
    location: location('mission-four', 600, 280),
  }),
  'already_applied'
);
assert.equal(
  runtime.applyAction('story_c', 'system:new', {
    type: 'world.system.add',
    map: world(
      'other-system',
      location('other-entry', 100, 200),
      location('other-exit', 800, 300)
    ),
    entryLocationId: 'other-entry',
    exitLocationId: 'other-exit',
  }),
  'applied'
);
assert.equal(
  runtime.applyAction('story_c', 'system:enter', {
    type: 'world.system.enter',
    systemId: 'other-system',
  }),
  'applied'
);
assert.equal(registry.inForeignSystem(), true);
assert.equal(runtime.complete('story_c', 'finished'), true);
assert.equal(registry.inForeignSystem(), false, 'completion ejects player safely');
assert.equal(nav.getSnapshot().currentLocationId, 'harbor');
assert.equal(registry.world().locations.some((entry) => entry.id === 'mission-three'), false);
runtime.destroy();
console.log('PASS campaign world overlays, remote system travel, receipts and cleanup');
