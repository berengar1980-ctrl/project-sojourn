'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { defaultMissionFilters, signalKind, filteredSignals } = load(
  'src/ui/map/star-map-event-filters.ts'
);

const distress = {
  id: 'distress',
  name: 'Notruf',
  kind: 'wreck',
  position: { x: 200, y: 0 },
  activities: { missions: true, salvage: true },
  dangerLevel: 3,
};
const salvage = {
  id: 'salvage',
  name: 'Wrack',
  kind: 'wreck',
  position: { x: 100, y: 0 },
  activities: { salvage: true, missions: false },
  dangerLevel: 1,
};
const port = {
  id: 'port',
  name: 'Hafen',
  kind: 'planet',
  position: { x: 10, y: 0 },
  activities: { missions: true, dock: true, trade: true },
  dangerLevel: 0,
};

assert.equal(signalKind(distress), 'distress');
assert.equal(signalKind(salvage), 'salvage');
assert.equal(signalKind(port), null);
assert.equal(signalKind({ ...distress, kind: 'planet' }), null);
assert.equal(signalKind({ ...distress, kind: 'moon' }), null);
assert.equal(signalKind({ ...distress, kind: 'station' }), null);
assert.equal(signalKind({ ...salvage, kind: 'planet' }), null);

const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const staticFalseAlarms = narrowsSector.locations.filter(
  (location) => location.kind !== 'wreck' && location.activities.missions
);
assert(staticFalseAlarms.length > 10, 'regression fixture must include mission-capable worlds');
assert(
  staticFalseAlarms.every((location) => signalKind(location) === null),
  'mission-capable planets, moons and stations are not active distress calls'
);
assert(
  narrowsSector.locations.some((location) => location.kind === 'wreck' && signalKind(location)),
  'real salvage sites must remain visible'
);

assert.equal(defaultMissionFilters('salvage').salvage, true);
assert.equal(defaultMissionFilters('freighter').salvage, false);
assert.equal(defaultMissionFilters('mining').campaign, true);
const all = { distress: true, salvage: true, campaign: true, sort: 'distance' };
const locations = [distress, salvage, port];
const ids = (filter) => filteredSignals(locations, filter, { x: 0, y: 0 }).map((item) => item.id);
assert.deepEqual(ids(all), ['salvage', 'distress']);
assert.deepEqual(ids({ ...all, distress: false }), ['salvage']);
assert.deepEqual(ids({ ...all, salvage: false }), ['distress']);
assert.deepEqual(ids({ ...all, distress: false, salvage: false }), []);
assert.deepEqual(ids({ ...all, sort: 'danger' }), ['distress', 'salvage']);
assert.deepEqual(ids({ ...all, sort: 'name' }), ['distress', 'salvage']);

const fs = require('node:fs');
const entry = fs.readFileSync(
  path.join(root, 'src/app/game-controller-location-entry.ts'),
  'utf8'
);
assert(entry.includes("currentLocationId?.startsWith('salvage-distress-')"));
assert(entry.includes('SIGNAL > KONTAKT ERLOSCHEN'));
assert(entry.includes('runSceneZoomTransition(context.root, mountSalvage)'));

console.log('PASS star map event kind filters, role defaults and sorting');
