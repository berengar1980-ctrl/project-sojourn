'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const {
  rotatePoint,
  distance,
  pointToSegmentDistanceSquared,
  predictsClosingContact,
  clampedSegmentProjection,
} = load('src/core/field-geometry.ts');
const {
  createShieldWorldGeometry,
  shipShieldGeometry,
  shieldWorldCenter,
  combatHullRadii,
  orientedHullRadius,
} = load('src/core/ship-contact-geometry.ts');

assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
const { stableHash } = load('src/core/stable-hash.ts');
assert.equal(stableHash(''), 2166136261);
assert.equal(stableHash('hello'), 1335831723);
const { wholeQuantity, applyMarketPurchase, applyMarketSale } = load(
  'src/core/economy-quantity.ts'
);
assert.equal(wholeQuantity(3.9), 3);
assert.equal(wholeQuantity(Infinity), 0);
assert.equal(wholeQuantity(-1), 0);
const entry = { stock: 20, demand: 0.5 };
applyMarketPurchase(entry, 5);
assert.equal(entry.stock, 15);
assert.equal(entry.demand, 0.501);
applyMarketSale(entry, 5);
assert.equal(entry.stock, 20);
assert.equal(entry.demand, 0.5);

const { quoteRefuel } = load('src/core/fuel-pricing.ts');
assert.deepEqual(quoteRefuel(0, 10, 37), { units: 3.7, cost: 37 });
assert.deepEqual(quoteRefuel(10, 10, 100), { units: 0, cost: 0 });
const { isServicedPort } = load('src/core/port-service-policy.ts');
assert(isServicedPort({ kind: 'station', activities: { dock: true } }));
assert(!isServicedPort({ kind: 'wreck', activities: { dock: true } }));

const { createLcgRandom, createXorshiftRandom, createMulberryRandom } = load(
  'src/core/seeded-random.ts'
);
const createLcgRandomSample = createLcgRandom(0);
assert.deepEqual(
  Array.from({ length: 4 }, () => createLcgRandomSample() * 4294967296),
  [1013904223, 1196435762, 3519870697, 2868466484]
);
const createXorshiftRandomSample = createXorshiftRandom(0);
assert.deepEqual(
  Array.from({ length: 4 }, () => createXorshiftRandomSample() * 4294967296),
  [270369, 67634689, 2647435461, 307599695]
);
const createMulberryRandomSample = createMulberryRandom(0);
assert.deepEqual(
  Array.from({ length: 4 }, () => createMulberryRandomSample() * 4294967296),
  [1144304738, 1416247, 958946056, 627933444]
);
const { clamp, wrapAngle } = load('src/core/numeric-geometry.ts');
assert.equal(clamp(-1, 0, 1), 0);
assert.equal(clamp(0.5, 0, 1), 0.5);
assert.equal(clamp(2, 0, 1), 1);
assert.equal(wrapAngle(3 * Math.PI), Math.PI);
assert.equal(wrapAngle(-3 * Math.PI), -Math.PI);

const { pirateHomePort, piratePortFaction } = load('src/core/pirate-ports.ts');
assert.equal(pirateHomePort('pirates'), 'blackjaw-outpost');
assert.equal(pirateHomePort('pirates2'), 'gallows-anchor');
assert.equal(pirateHomePort(undefined), 'blackjaw-outpost');
assert.equal(piratePortFaction('gallows-anchor'), 'pirates2');
assert.equal(piratePortFaction('haven'), null);

const rotated = rotatePoint({ x: 10, y: 0 }, Math.PI / 2);
assert(Math.abs(rotated.x) < 1e-10);
assert.equal(rotated.y, 10);
const start = { x: 0, y: 0 };
const end = { x: 10, y: 0 };
assert.equal(clampedSegmentProjection({ x: 5, y: 3 }, start, 10, 0, 100), 0.5);
assert.equal(clampedSegmentProjection({ x: -5, y: 0 }, start, 10, 0, 100), 0);
assert.equal(clampedSegmentProjection({ x: 15, y: 0 }, start, 10, 0, 100), 1);
assert.equal(clampedSegmentProjection({ x: 3, y: 4 }, start, 0, 0, 0), 0);
assert.equal(clampedSegmentProjection({ x: 0.5, y: 0 }, start, 0.5, 0, 1), 0.25);
assert.equal(pointToSegmentDistanceSquared({ x: 5, y: 3 }, start, end), 9);
assert.equal(pointToSegmentDistanceSquared({ x: 13, y: 4 }, start, end), 25);
assert.equal(pointToSegmentDistanceSquared({ x: 3, y: 4 }, start, start), 25);
assert(predictsClosingContact(100, 0, -40, 0, 20, 4));
assert(!predictsClosingContact(100, 0, 40, 0, 20, 4));
assert(!predictsClosingContact(100, 30, -40, 0, 20, 4));
assert(!predictsClosingContact(100, 0, -10, 0, 20, 4));
assert(predictsClosingContact(10, 0, -1, 0, 20, 4));
assert(!predictsClosingContact(10, 0, 1, 0, 20, 4));

const hardpoints = {
  sourceWidth: 100,
  pivot: { x: 50, y: 50 },
  shield: { centerX: 60, centerY: 50, radiusX: 40, radiusY: 20 },
};
const ship = { nominalLengthMeters: 200, sprite: { hardpoints } };
const geometry = shipShieldGeometry(ship);
assert.deepEqual(geometry, {
  centerOffset: { x: 20, y: 0 },
  radiusX: 80,
  radiusY: 40,
});
assert.equal(shipShieldGeometry(ship), geometry);
assert.deepEqual(createShieldWorldGeometry(hardpoints, 200), geometry);
assert.notEqual(shipShieldGeometry({ ...ship, nominalLengthMeters: 100 }), geometry);

assert.deepEqual(shieldWorldCenter({ x: 100, y: 100 }, Math.PI / 2, geometry), {
  x: 100,
  y: 120,
});
const hull = combatHullRadii(200, geometry);
assert.equal(hull.radiusX, 80 * 0.88);
assert.equal(hull.radiusY, 40 * 0.88);
assert.equal(orientedHullRadius(1, 0, 0, hull.radiusX, hull.radiusY), hull.radiusX);
assert.deepEqual(load('src/core/field-geometry.ts').contactAxis(0, 0), {
  distance: 0,
  normal: { x: 1, y: 0 },
});

const contactImpulse = load('src/core/contact-impulse.ts');
const firstBody = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, mass: 1 };
const secondBody = { position: { x: 30, y: 0 }, velocity: { x: 0, y: 0 }, mass: 2 };
contactImpulse.separateContactBodies(firstBody, secondBody, { x: 1, y: 0 }, 30);
assert.deepEqual(firstBody.position, { x: -20, y: 0 });
assert.deepEqual(secondBody.position, { x: 40, y: 0 });

console.log('PASS shared field geometry and definition-scoped shield cache');
