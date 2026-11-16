'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { createSectorSalvageEventService } = load(
  'src/systems/salvage/sector-salvage-event-service.ts'
);
const world = narrowsSector;
const seed = 419;
const position = world.locations[0].position;
const live = createSectorSalvageEventService(world, seed);
for (let day = 0; day <= 5; day += 1) live.advanceDay(day, position, true);
const event = live.active[0];
if (event) live.resolve(event.id);
const saved = live.exportState();
const restored = createSectorSalvageEventService(
  world, seed, JSON.parse(JSON.stringify(saved))
);
assert.deepEqual(restored.exportState(), saved);
assert.notStrictEqual(restored, live);
if (event) assert.equal(restored.event(event.id), null, 'resolved wreck cannot respawn at load');
for (let day = 6; day <= 20; day += 1) {
  live.advanceDay(day, position, true);
  restored.advanceDay(day, position, true);
  assert.deepEqual(restored.exportState(), live.exportState(), 'salvage random timeline diverged');
}
const damaged = JSON.parse(JSON.stringify(saved));
damaged.randomCalls = -1;
assert.throws(
  () => createSectorSalvageEventService(world, seed, damaged),
  /salvage events checkpoint/
);
assert.deepEqual(saved.events.length, restored.exportState().events.length > 0 ? saved.events : saved.events);
console.log('PASS career salvage events: resolved receipts, spawn times and RNG continuation');
