'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { projectOrbitalMapShip } = load('src/ui/map/orbital-map-projection.ts');
const { mapLocationVisualRadius } = load('src/ui/map/map-visual-scale.ts');

const haven = {
  id: 'haven',
  kind: 'planet',
  position: { x: 400, y: 400 },
  radius: 76,
};
const orbit = { x: 500, y: 400 };
const camera = (zoom) => ({
  getRelativeZoom: () => zoom,
  worldToScreen: (point) => ({ x: point.x * zoom, y: point.y * zoom }),
});

const overview = projectOrbitalMapShip(orbit, haven, camera(1), 1200, 900, 22, true);
const center = camera(1).worldToScreen(haven.position);
const visualDistance = Math.hypot(overview.x - center.x, overview.y - center.y);
const rim = mapLocationVisualRadius(haven, 1) + 9;
assert(visualDistance > rim, 'idle ship must be positioned outside the blue selection ring');
assert(visualDistance < rim + 15, 'idle ship must remain near the displayed orbit rim');

const physicalAtHighZoom = camera(3.3).worldToScreen(orbit);
const zoomedIn = projectOrbitalMapShip(orbit, haven, camera(3.3), 1200, 900, 22, true);
assert.deepEqual(zoomedIn, physicalAtHighZoom, 'high zoom must use the true world position');

const travelling = projectOrbitalMapShip(orbit, haven, camera(1), 1200, 900, 22, false);
assert.deepEqual(travelling, orbit, 'travelling NPCs must never use a cosmetic orbit');
const field = { ...haven, kind: 'asteroid-field' };
const mining = projectOrbitalMapShip(orbit, field, camera(1), 1200, 900, 22, true);
assert.deepEqual(mining, orbit, 'working miners stay in their real asteroid-field positions');
assert.deepEqual(orbit, { x: 500, y: 400 }, 'the true position cannot be modified');

const map = readModuleSource(root, 'src/ui/map/topdown-map-renderer.ts');
const contacts = readModuleSource(root, 'src/ui/map/npc-ship-map-renderer.ts');
const state = readModuleSource(root, 'src/app/game-controller-star-map.ts');
const tick = readModuleSource(root, 'src/app/game-controller-scene-tick.ts');
assert(map.includes('projectOrbitalMapShip('), 'player ship must use the same map projection');
assert(contacts.includes('projectOrbitalMapShip('), 'NPC contacts must use the projection');
assert(contacts.includes('const to = projectOrbitalMapShip('), 'pursuit line must follow contact');
assert(contacts.includes('if (labelsVisible) {'), 'ship names must be eligible at overview zoom');
assert(state.includes('locationId: npc.locationId'), 'a parked NPC needs a real location ID');
assert(tick.includes('STAR_MAP_MIN_FRAME_MS'), 'map rendering must be frame-rate limited');
assert(tick.includes('state.panels.star?.update(controllerStarModel(context))'));
console.log('PASS visual-only orbital projection, visible labels and capped star-map rendering');
