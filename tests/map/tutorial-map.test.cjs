'use strict';

const { readModuleSource } = require('../module-source.cjs');

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const data = readModuleSource(root, 'src/data/maps/narrows-sector.ts');
const renderer = readModuleSource(root, 'src/ui/map/topdown-map-renderer.ts');
const navRenderer = fs.readFileSync(path.join(root, 'src/ui/map/nav-map-renderer.ts'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/ui/map/star-map-panel.ts'), 'utf8');

assert(data.includes("id: 'solis'"), 'sector needs a central star');
assert(data.includes('star: {'), 'star must be a world object, not a travel location');
assert(data.includes("planetBiome: 'scorched'"), 'inner system needs scorched rocky worlds');
assert(data.includes("planetBiome: 'desert'"), 'inner system needs desert worlds');
assert(data.includes("planetBiome: 'temperate'"), 'habitable band needs temperate worlds');
assert(data.includes("planetBiome: 'ice'"), 'outer system needs ice worlds');
assert(data.includes("planetBiome: 'gas-giant'"), 'outer system needs a gas giant');
assert(data.includes("ringStyle: 'broad'"), 'sector needs a prominent ringed planet');
assert(data.includes("ringStyle: 'asteroid'"), 'sector needs a rocky planetary ring');
assert(data.includes("kind: 'moon'"), 'sector must contain moons');
assert(data.includes("parentLocationId: 'pale-reach'"), 'the remaining moon must orbit Pale Reach');
assert(data.includes('mine: true'), 'sector needs mining locations');
assert(data.includes('salvage: true'), 'sector needs salvage locations');
assert(data.includes("id: 'blackjaw-outpost'"), 'sector needs a pirate port');
assert(data.includes("id: 'gallows-anchor'"), 'sector needs more than one pirate port');
assert(
  renderer.includes('drawDangerRegions(width, height)') &&
    renderer.includes('setDangerOverlay(visible: boolean)') &&
    renderer.includes('setDangerBand('),
  'the star map must expose fixed green/yellow/red danger overlays and toggles'
);
assert(renderer.includes('drawStar'), 'renderer must draw the system star');
assert(renderer.includes('drawOrbits'), 'renderer must support orbital structure');
assert(
  renderer.includes('location.parentLocationId'),
  'renderer must draw moon and station orbits around parent bodies'
);
assert(renderer.includes('class TopdownMapRenderer'), 'top-down renderer missing');
assert(renderer.includes('shouldDrawLabel'), 'renderer must reduce minor labels at overview zoom');
assert(
  renderer.includes('this.stations.draw(') &&
    navRenderer.includes('location.stationType') &&
    navRenderer.includes('spokes[stationType]'),
  'stations must retain type-specific symbols in physical and NAV views'
);
assert(
  !/\.(?:currentLocationId|selectedDestinationId|destinationId)\s*=(?!=)/.test(renderer),
  'renderer must not mutate player navigation state'
);
assert(panel.includes("'WERFT'"), 'star map must identify shipyard locations');
assert(
  panel.includes('map-mode-toggle') &&
    panel.includes("preferredDisplayMode === 'physical' ? 'nav' : 'physical'"),
  'star map must expose a live physical/NAV comparison toggle'
);
assert(
  renderer.includes("export type StarMapDisplayMode = 'physical' | 'nav'") &&
    renderer.includes('NavMapRenderer'),
  'star map must delegate NAV mode to a separate renderer'
);
assert(
  navRenderer.includes('drawBackground') &&
    navRenderer.includes('drawLocation') &&
    navRenderer.includes('drawShip'),
  'NAV mode must use a distinct sensor rendering path'
);
assert(!panel.includes('<aside'), 'star map must not contain a permanent sidebar');

console.log('PASS expanded sector star-map contract');
