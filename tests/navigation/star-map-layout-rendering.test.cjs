'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const { readModuleSource } = require('../module-source.cjs');
const read = (file) => readModuleSource(root, file);

const camera = read('src/ui/map/map-camera.ts');
const renderer = read('src/ui/map/topdown-map-renderer.ts');
const map = read('src/data/maps/narrows-sector.ts');
const playerShip = read('src/ui/map/player-ship-renderer.ts');
const npcShips = read('src/ui/map/npc-ship-map-renderer.ts');
const stations = read('src/ui/space/procedural-station-renderer.ts');
const surfaces = read('src/ui/space/procedural-surface-textures.ts');

assert(camera.includes('const MIN_RELATIVE_ZOOM = 1;'));
assert(renderer.includes('rect.width >= 200 && rect.height >= 200'));
assert(map.includes('position: { x: 3100, y: mapY(0) }'));
assert(map.includes('position: { x: 2700, y: mapY(1200) }'));
assert(map.includes('position: { x: 3200, y: mapY(950) }'));
assert(playerShip.includes('preserveDetail: true'));
assert(npcShips.includes('preserveDetail: true'));
assert(stations.includes("globalCompositeOperation = 'destination-out'"));
assert(surfaces.includes("id === 'pale-reach'"));

console.log('PASS star map zoom, layout, station transparency and ship detail');
