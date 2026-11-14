'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createNavigationService } = load('src/systems/navigation/navigation-service.ts');
const { stageNavigationCheckpoint } = load('src/systems/navigation/navigation-persistence.ts');
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const locations = narrowsSector.locations;
assert(locations.length >= 2);
const from = locations[0].id;
const to = locations.find((location) => location.id !== from).id;
const fresh = () => createNavigationService(narrowsSector, from, 130);

const original = fresh();
original.selectDestination(to);
original.startTravel();
for (let i = 0; i < 40; i++) original.tick(0.1);
const during = original.getSnapshot();
assert(during.isTravelling, 'Travel must be active before capture');
const saved = original.exportState();
assert(saved.state.travel.distanceTravelled > 0);
assert.notStrictEqual(saved.state.currentPosition, during.currentPosition);
const restored = createNavigationService(narrowsSector, from, 130, saved);
assert.deepEqual(restored.getSnapshot(), original.getSnapshot());
for (let i = 0; i < 15; i++) {
  assert.deepEqual(restored.tick(0.1), original.tick(0.1));
}
const broken = JSON.parse(JSON.stringify(saved));
broken.state.travel.distanceTravelled = broken.state.travel.route.distance + 10;
assert.throws(() => stageNavigationCheckpoint(narrowsSector, broken), /Navigationszustand/);
assert(original.getSnapshot().isTravelling, 'Invalid save must not mutate the live runtime');
const wrongWorld = { ...narrowsSector, id: 'other-sector' };
assert.throws(() => stageNavigationCheckpoint(wrongWorld, saved), /Navigations-Spielstand/);
const pursuit = fresh();
pursuit.startPursuit('pirate-17', { x: 800, y: 900 });
pursuit.tick(0.1);
const chase = createNavigationService(narrowsSector, from, 130, pursuit.exportState());
assert.deepEqual(chase.getSnapshot(), pursuit.getSnapshot());
assert.deepEqual(chase.tick(0.1), pursuit.tick(0.1), 'Pursuit resumes without reset');
const idle = fresh();
const idleCopy = createNavigationService(narrowsSector, from, 130, idle.exportState());
assert.deepEqual(idleCopy.getSnapshot(), idle.getSnapshot());
console.log('PASS career navigation checkpoint');
