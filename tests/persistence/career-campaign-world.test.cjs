'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createNavigationService } = load('src/systems/navigation/navigation-service.ts');
const { createCampaignWorldService } = load('src/systems/campaigns/campaign-world-service.ts');

function location(id, x, y) {
  return {
    id,
    name: id,
    kind: 'station',
    position: { x, y },
    radius: 12,
    description: 'Career mission',
    activities: { missions: true },
    dangerLevel: 0,
  };
}
function world(id, a, b) {
  return {
    id,
    name: id,
    width: 1200,
    height: 900,
    startLocationId: a.id,
    star: {
      id: 'star-' + id,
      name: 'Star',
      position: { x: 600, y: 450 },
      radius: 35,
      colorCore: '#ffffff',
      colorCorona: '#aaaaaa',
    },
    locations: [a, b],
    regions: [],
  };
}
const home = world('home-system', location('home', 100, 200), location('relay', 900, 300));
const far = world('foreign-system', location('entry', 100, 200), location('exit', 900, 300));
const nav = createNavigationService(home, 'home', 100);
const first = createCampaignWorldService(home, nav);
assert(first.addLocation('story', location('mission-port', 500, 500)));
assert(
  first.addSystem('story', {
    map: far,
    entryLocationId: 'entry',
    exitLocationId: 'exit',
  })
);
assert(first.enterSystem('story', 'foreign-system'));
const saved = first.exportCareerState();
assert.equal(saved.active.returnLocationId, 'home');
const freshNavigation = createNavigationService(far, 'entry', 100);
const second = createCampaignWorldService(
  home,
  freshNavigation,
  JSON.parse(JSON.stringify(saved))
);
assert.deepEqual(second.exportCareerState(), saved);
assert.equal(second.world().id, far.id);
assert.equal(second.exitLocationId(), 'exit');
assert.equal(second.returnFromSystem('story'), false);
freshNavigation.selectDestination('exit');
assert(freshNavigation.startTravel());
for (let i = 0; i < 2500 && freshNavigation.getSnapshot().isTravelling; i += 1) {
  freshNavigation.tick(0.1);
}
assert.equal(freshNavigation.getSnapshot().currentLocationId, 'exit');
assert(second.returnFromSystem('story'));
assert.equal(freshNavigation.getSnapshot().currentLocationId, 'home');
assert(second.world().locations.some((entry) => entry.id === 'mission-port'));

const invalid = JSON.parse(JSON.stringify(saved));
invalid.active.returnLocationId = 'unknown';
assert.throws(
  () => createCampaignWorldService(home, createNavigationService(far, 'entry', 100), invalid),
  /return point/
);
assert.deepEqual(first.exportCareerState(), saved);
console.log('PASS campaign world: foreign system, mission overlays and saved home return');
