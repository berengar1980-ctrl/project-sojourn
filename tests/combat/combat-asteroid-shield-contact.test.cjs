'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { resolveCombatAsteroidContacts } = loadStandaloneTypeScriptModule(root, 'src/systems/combat/combat-asteroid-contacts.ts');
const ship = {
  setup: { shieldGeometry: { centerOffset: { x: 0, y: 0 }, radiusX: 50, radiusY: 20, modifier: 1 } },
  position: { x: 200, y: 200 }, velocity: { x: 30, y: 0 }, headingRadians: 0,
  shieldHp: 100, shieldMaxHp: 100, hullHp: 100, shieldImpacts: [], speed: 30,
};
const asteroid = { id: 'rock', kind: 'resource', position: { x: 274, y: 200 }, velocity: { x: 0, y: 0 }, radius: 30 };
resolveCombatAsteroidContacts(ship, { asteroids: [asteroid] });
assert(ship.position.x < 200, 'actual contact pushes the ship away from the asteroid');
assert(ship.shieldImpacts.length === 1, 'asteroid contact creates visible shield flash');
assert(ship.shieldHp < 100, 'impact deals shield damage');
const distantShip = { ...ship, position: { x: 200, y: 200 }, velocity: { x: 0, y: 0 }, shieldImpacts: [], shieldHp: 100 };
asteroid.position.y = 270;
resolveCombatAsteroidContacts(distantShip, { asteroids: [asteroid] });
assert.equal(distantShip.position.x, 200, 'no invisible circular wall outside narrow shield axis');
console.log('PASS elliptical shield asteroid contact and visual impact');
