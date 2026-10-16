'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { collectStarMapPickOptions } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/map/star-map-contact-picking.ts'
);
const model = {
  locations: [{ id: 'planet', name: 'Varras Prime', kind: 'planet' }],
  npcShips: [{ id: 'freighter', name: 'Quint Quell', job: 'freighter' }],
};
const hitAreas = [
  { kind: 'npc', id: 'freighter', x: 100, y: 100, radius: 20 },
  { kind: 'location', id: 'planet', x: 100, y: 100, radius: 24 },
  { kind: 'npc', id: 'freighter', x: 100, y: 100, radius: 20 },
];

const overlap = collectStarMapPickOptions(hitAreas, model, 100, 100);
assert.deepEqual(
  overlap.map((option) => option.id),
  ['planet', 'freighter'],
  'same-position planet and ship must both be listed without duplicates'
);
assert.equal(overlap[0].name, 'Varras Prime');
assert.equal(overlap[1].detail, 'SCHIFF // FREIGHTER');

const planetOnly = collectStarMapPickOptions(hitAreas, model, 121, 100);
assert.deepEqual(planetOnly.map((option) => option.id), ['planet']);
assert.deepEqual(collectStarMapPickOptions(hitAreas, model, 200, 200), []);
console.log('PASS shared map hit-testing detects overlapping planet and ship');
