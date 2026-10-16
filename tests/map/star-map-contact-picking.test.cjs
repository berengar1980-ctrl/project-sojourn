'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const pickModule = loadStandaloneTypeScriptModule(root, 'src/ui/map/star-map-contact-picking.ts');
const pick = pickModule.collectStarMapPickOptions;

const model = { locations: [], npcShips: [] };
model.locations.push({ id: 'planet', name: 'Varras Prime', kind: 'planet' });
model.npcShips.push({ id: 'freighter', name: 'Quint Quell', job: 'freighter' });

const areas = [];
areas.push({ kind: 'npc', id: 'freighter', x: 100, y: 100, radius: 20 });
areas.push({ kind: 'location', id: 'planet', x: 100, y: 100, radius: 24 });
areas.push({ kind: 'npc', id: 'freighter', x: 100, y: 100, radius: 20 });

const overlap = pick(areas, model, 100, 100);
assert.deepEqual(overlap.map((option) => option.id), ['planet', 'freighter']);
assert.equal(overlap[0].name, 'Varras Prime');
assert.equal(overlap[1].detail, 'SCHIFF // FREIGHTER');

const planetOnly = pick(areas, model, 121, 100);
assert.deepEqual(planetOnly.map((option) => option.id), ['planet']);
assert.deepEqual(pick(areas, model, 200, 200), []);
console.log('PASS shared map hit-testing detects overlapping planet and ship');
