'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const projection = load('src/ui/map/orbital-map-projection.ts');
const project = projection.projectOrbitalMapShip;
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

for (const zoom of [1, 1.4, 2.6, 3.3, 4.6]) {
  const center = camera(zoom).worldToScreen(haven.position);
  const ship = project(orbit, haven, camera(zoom), 1200, 900, 22, true);
  const distance = Math.hypot(ship.x - center.x, ship.y - center.y);
  const rim = mapLocationVisualRadius(haven, zoom) + 9;
  assert.equal(Math.round((distance - rim) * 100) / 100, 15);

  const physical = camera(zoom).worldToScreen(orbit);
  const travelling = project(orbit, haven, camera(zoom), 1200, 900, 22, false);
  assert.deepEqual(travelling, physical, 'flight must always use world coordinates');
}

const field = { ...haven, kind: 'asteroid-field' };
const mining = project(orbit, field, camera(1), 1200, 900, 22, true);
assert.deepEqual(mining, orbit, 'fields do not use cosmetic dock positions');

const transitions = new projection.OrbitalMapTransitions();
assert.equal(transitions.blend('npc-01', false, 1000), 0);
assert.equal(transitions.blend('npc-01', true, 1000), 0);
const halfArrival = transitions.blend('npc-01', true, 1275);
assert(Math.abs(halfArrival - 0.5) < 0.001);
assert.equal(transitions.blend('npc-01', true, 1550), 1);
assert.equal(transitions.blend('npc-01', false, 1600), 1);
const halfDeparture = transitions.blend('npc-01', false, 1875);
assert(Math.abs(halfDeparture - 0.5) < 0.001);
assert.equal(transitions.blend('npc-01', false, 2150), 0);
transitions.reset();
assert.equal(transitions.blend('npc-01', true, 2200), 1);
assert.equal(transitions.angle('npc-01', 1.25), 1.25);
assert.equal(transitions.angle('npc-01', undefined), 1.25);
transitions.reset();
assert.equal(transitions.angle('npc-01', undefined), undefined);

const { OrbitalMapSceneProjection } = load('src/ui/map/orbital-map-scene-projection.ts');
const sceneTransition = new OrbitalMapSceneProjection();
const dockedPlayer = {
  playerShip: { position: orbit, nominalLengthMeters: 100, isTravelling: false },
  navigation: { currentLocationId: 'haven' },
  locations: [haven],
  npcShips: [],
};
const initialAngles = sceneTransition.angles(dockedPlayer, camera(1));
const initialPlayerPoint = sceneTransition.playerPoint(
  dockedPlayer,
  camera(1),
  1200,
  900,
  initialAngles
);
const leavingPlayer = {
  ...dockedPlayer,
  playerShip: { ...dockedPlayer.playerShip, isTravelling: true },
  navigation: { currentLocationId: null },
};
const leavingAngles = sceneTransition.angles(leavingPlayer, camera(1));
const departingPlayerPoint = sceneTransition.playerPoint(
  leavingPlayer,
  camera(1),
  1200,
  900,
  leavingAngles
);
assert(
  Math.hypot(
    departingPlayerPoint.x - initialPlayerPoint.x,
    departingPlayerPoint.y - initialPlayerPoint.y
  ) < 5,
  'player must retain the last orbital port during departure, even with a null current port'
);

const contacts = [
  { id: 'player', locationId: 'haven', position: orbit, shipWidth: 22, stationary: true },
  { id: 'npc-01', locationId: 'haven', position: orbit, shipWidth: 22, stationary: true },
  { id: 'npc-02', locationId: 'haven', position: orbit, shipWidth: 22, stationary: true },
  { id: 'npc-03', locationId: 'haven', position: orbit, shipWidth: 22, stationary: true },
];
for (const zoom of [1, 2.6, 4.6]) {
  const angles = projection.layoutOrbitalShipAngles(contacts, [haven], zoom);
  assert.equal(angles.size, contacts.length);
  const points = contacts.map((contact) => {
    const angle = angles.get(contact.id);
    return project(orbit, haven, camera(zoom), 1200, 900, 22, true, 1, angle);
  });
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      assert(Math.hypot(dx, dy) > 20, 'ships at the same dock must not stack');
    }
  }
}

const map = readModuleSource(root, 'src/ui/map/topdown-map-renderer.ts');
const contactsSource = readModuleSource(root, 'src/ui/map/npc-ship-map-renderer.ts');
const scene = readModuleSource(root, 'src/ui/map/orbital-map-scene-projection.ts');
assert(scene.includes('layoutOrbitalShipAngles('));
assert(scene.includes('projectOrbitalMapShip('));
assert(map.includes('this.orbitalProjection.playerPoint('));
assert(contactsSource.includes('const to = projectOrbitalMapShip('));
assert(contactsSource.includes('orbitalAngles.get(npc.id)'));
assert(contactsSource.includes('this.orbitalTransitions.blend('));
assert(map.includes('this.drawRoute(width, height, playerPoint)'));
assert(map.includes('this.drawPlayerShip(width, height, playerPoint)'));
assert.deepEqual(orbit, { x: 500, y: 400 });
console.log('PASS consistent orbital rings, separated ships and smooth state transitions');
