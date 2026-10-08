'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const camera = read('src/ui/map/map-camera.ts');
const renderer = read('src/ui/map/topdown-map-renderer.ts');
const map = read('src/data/maps/narrows-sector.ts');
const playerShip = read('src/ui/map/player-ship-renderer.ts');
const npcShips = read('src/ui/map/npc-ship-map-renderer.ts');
const stations = read('src/ui/space/procedural-station-renderer.ts');
const surfaces = read('src/ui/space/procedural-surface-textures.ts');

assert(camera.includes('const MIN_RELATIVE_ZOOM = 1;'));
assert(renderer.includes('rect.width >= 200 && rect.height >= 200'));
assert(map.includes('position: { x: 3100, y: mapY(430) }'));
assert(map.includes('position: { x: 2960, y: mapY(1450) }'));
assert(map.includes('position: { x: 3105, y: mapY(1320) }'));
assert(playerShip.includes('preserveDetail: true'));
assert(npcShips.includes('preserveDetail: true'));
assert(stations.includes("globalCompositeOperation = 'destination-out'"));
assert(surfaces.includes("id === 'pale-reach'"));

console.log('PASS star map zoom, layout, station transparency and ship detail');
