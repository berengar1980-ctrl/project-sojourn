'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { controllerWorldEvents } = load('src/app/game-controller-world-events.ts');
const { visibleWorldEvents, eventRelevant } = load('src/ui/map/star-map-world-events.ts');
const { defaultMissionFilters, saveMissionFilters, loadMissionFilters } = load(
  'src/ui/map/star-map-event-filters.ts'
);
const world = {
  locations: [
    { id: 'dock', name: 'Dock', position: { x: 100, y: 0 }, dangerLevel: 0 },
    { id: 'field', name: 'Field', position: { x: 200, y: 0 }, dangerLevel: 2 },
  ],
};
const economy = {
  situations: { currentDay: 6, active: () => [
    { id: 'shortage', name: 'Engpass', description: 'Knappheit',
      scope: 'local', locationId: 'dock' },
  ] },
  blockades: { snapshot: () => ({ orders: [
    { id: 'visible', locationId: 'dock', ownerId: 'npc', pirateIds: ['pirate-1'],
      phase: 'active' },
    { id: 'secret', locationId: 'dock', ownerId: 'npc', pirateIds: ['pirate-2'],
      phase: 'active' },
  ] }) },
  patrol: { snapshot: () => ({ assignments: [
    { id: 'assignment', targetId: 'dock', status: 'active', deadline: 8 },
  ] }) },
  asteroidClaims: { snapshot: () => ({ claims: [
    { locationId: 'field', asteroidId: 'a1' }, { locationId: 'field', asteroidId: 'a2' },
  ] }) },
  wreckClaims: { snapshot: () => [
    { fieldId: 'field', wreckId: 'w1', expiresDay: 9 },
  ] },
};
const known = [
  { id: 'pirate-1', job: 'pirate', name: 'Korsar', activity: 'Blockade',
    combatMode: null },
  { id: 'patrol-1', job: 'patrol', name: 'Sicherheit', activity: 'Patrouilliert',
    combatMode: null },
];
const entries = controllerWorldEvents(economy, world, known);
assert.equal(entries.filter((event) => event.kind === 'blockade').length, 1);
assert.equal(entries.find((event) => event.kind === 'mining').detail, '2 registrierte Abbaurechte');
assert(entries.some((event) => event.kind === 'trade'));
assert(entries.some((event) => event.kind === 'patrol'));
assert(entries.some((event) => event.kind === 'salvage'));
assert(entries.every((event) => !event.id.includes('secret')));
assert.equal(eventRelevant('mining', 'mining'), true);
assert.equal(eventRelevant('mining', 'freighter'), false);
const model = {
  worldEvents: entries,
  locations: world.locations,
  playerShip: { role: 'mining', position: { x: 0, y: 0 } },
};
const filters = { ...defaultMissionFilters('mining'), trade: true, blockade: true };
const visible = visibleWorldEvents(model, filters);
assert(visible.some((entry) => entry.kind === 'trade'));
assert(visible.every((entry) => filters[entry.kind]));
assert.equal(visible[0].kind, 'mining', 'relevant entries must precede unrelated reports');
const fakeStore = new Map();
global.localStorage = {
  getItem: (key) => fakeStore.get(key) ?? null,
  setItem: (key, value) => fakeStore.set(key, value),
};
saveMissionFilters('mining', { ...filters, trade: true, relevantFirst: false, sort: 'danger' });
const reloaded = loadMissionFilters('mining');
assert.equal(reloaded.trade, true);
assert.equal(reloaded.relevantFirst, false);
assert.equal(reloaded.sort, 'danger');
assert.equal(loadMissionFilters('freighter').mining, false);
const pane = fs.readFileSync(path.join(root, 'src/ui/map/star-map-mission-pane.ts'), 'utf8');
assert(pane.includes('const panes = new WeakMap'), 'mission controls must be reused between ticks');
assert(pane.includes('if (!state || state.role !== role)'));
assert(pane.includes('saveMissionFilters(state.role, next)'));
assert(!pane.includes('options.container.replaceChildren(controls, journalPane, signalsPane)'));

console.log('PASS actual event sources, ship relevance and persistent stable menu filters');
