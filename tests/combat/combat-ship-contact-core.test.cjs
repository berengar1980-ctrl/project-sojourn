'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { shipContact } = load('src/systems/combat/combat-ship-contact-geometry.ts');
const { resolveCombatantCollision } = load('src/systems/combat/combat-contact-response.ts');
const { collisionThreat } = load('src/systems/combat/combat-contact-review.ts');
const { applyCombatRamImpact } = load('src/systems/combat/combat-ram-impact.ts');
const shield = {
  centerOffset: { x: 0, y: 0 },
  radiusX: 32,
  radiusY: 22,
  modifier: 1,
};
function ship(x, y, headingRadians = 0, vx = 0) {
  return {
    position: { x, y },
    velocity: { x: vx, y: 0 },
    headingRadians,
    speed: Math.abs(vx),
    setup: { shipId: 'patrol-60m-variant-01', shieldGeometry: shield },
    shieldHp: 100,
    hullHp: 100,
    subsystems: { engine: 100 },
  };
}

const wide = ship(500, 600);
const other = ship(565, 600, Math.PI);
const actual = shipContact(wide, other);
assert(actual.required < 65, 'real physical hulls must not contact at nominal 86m');
resolveCombatantCollision(wide, other);
assert.equal(wide.position.x, 500, 'visible gap must not trigger phantom collision');
assert.equal(other.position.x, 565);
const runtime = { attacker: wide, defender: other, elapsedSeconds: 3, combatLog: [] };
wide.velocity.x = 130;
other.velocity.x = -130;
assert.equal(applyCombatRamImpact(runtime), 0, 'no ram damage before actual contact');

other.position.x = 550;
const overlap = shipContact(wide, other);
assert(overlap.distance < overlap.required);
resolveCombatantCollision(wide, other);
const resolved = shipContact(wide, other);
assert(resolved.distance >= resolved.required, 'physical collision separates hulls');
assert.equal(wide.velocity.y, 0, 'only normal impact velocity changes');

const flankA = ship(500, 500, 0);
const flankB = ship(500, 548, 0);
const flankContact = shipContact(flankA, flankB);
assert(flankContact.required < actual.required, 'ship contact depends on hull orientation');
assert.equal(collisionThreat(wide, ship(700, 600, 0, -90)), true);

console.log('PASS real oriented hull contact, no phantom wall, proper impulse and ram boundary');

// Physical definitions, not naming conventions, determine fallback hull size.
const namedHull = {
  position: { x: 0, y: 0 },
  setup: { shipId: 'custom-20m', nominalLengthMeters: 100 },
};
const sameHull = {
  position: { x: 100, y: 0 },
  setup: { shipId: 'no-length-in-id', nominalLengthMeters: 100 },
};
assert.equal(shipContact(namedHull, sameHull).required, 88);
const legacyHull = { ...sameHull, setup: { shipId: 'legacy-60m' } };
assert(Math.abs(shipContact(legacyHull, legacyHull).required - 52.8) < 1e-9);
