'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');

const root = path.resolve(__dirname, '../..');
const { narrowsSector } = loadStandaloneTypeScriptModule(root, 'src/data/maps/narrows-sector.ts');
const geography = loadStandaloneTypeScriptModule(
  root,
  'src/systems/navigation/fixed-danger-geography.ts'
);
const routing = loadStandaloneTypeScriptModule(root, 'src/systems/navigation/route-planner.ts');
const mapY = (y) => narrowsSector.height - y;
const bandAt = (x, y) =>
  geography.fixedDangerAtPoint(
    narrowsSector.regions,
    { x, y: mapY(y) },
    narrowsSector.defaultDangerLevel
  );

// The geography itself — not just tinted circles on the renderer — has balanced area.
// The renderer fits the inhabited location bounds (+180 world units), not empty
// bookkeeping margins of the 6200x5200 coordinate rectangle.
const positions = narrowsSector.locations.map((location) => location.position);
const bounds = {
  minX: Math.min(...positions.map((point) => point.x)) - 180,
  maxX: Math.max(...positions.map((point) => point.x)) + 180,
  minY: Math.min(...positions.map((point) => point.y)) - 180,
  maxY: Math.max(...positions.map((point) => point.y)) + 180,
};
const samples = { green: 0, yellow: 0, red: 0 };
for (let y = bounds.minY + 32.5; y <= bounds.maxY; y += 65) {
  for (let x = bounds.minX + 32.5; x <= bounds.maxX; x += 65) {
    const level = geography.fixedDangerAtPoint(
      narrowsSector.regions,
      { x, y },
      narrowsSector.defaultDangerLevel
    );
    samples[level >= 3 ? 'red' : level === 2 ? 'yellow' : 'green'] += 1;
  }
}
const count = Object.values(samples).reduce((a, b) => a + b, 0);
for (const [band, amount] of Object.entries(samples)) {
  const fraction = amount / count;
  assert(
    fraction >= 0.27 && fraction <= 0.39,
    band + ' covers ' + Math.round(fraction * 100) + '%; each band should occupy about a third'
  );
}
assert(narrowsSector.regions.length >= 14, 'expect distinct connected rooms and red pockets');
assert(narrowsSector.regions.some((region) => (region.corridors?.length ?? 0) >= 3));
assert.equal(bandAt(750, 1050), 3, 'Blackjaw pirate harbour remains in a fixed red pocket');
assert.equal(bandAt(5650, 700), 3, 'Gallows pirate harbour remains in a fixed red pocket');
assert.equal(bandAt(3500, 4050), 1, 'Haven route is a genuine connected green corridor');
assert.equal(bandAt(2400, 1900), 2, 'inner sector includes a yellow passage');
assert.equal(bandAt(2240, 3220), 1, 'industrial route includes a green pocket');
assert.equal(bandAt(820, 4550), 3, 'Outer Shards retain red danger');
assert.equal(bandAt(3100, 2600), 3, 'Solis red crossing forces meaningful route choices');

// Matching source and gameplay: both share one evaluator; no independent visual-only hazards.
assert(
  readModuleSource(root, 'src/ui/map/star-map-danger-regions.ts').includes('fixedDangerAtPoint(')
);
assert(
  readModuleSource(root, 'src/systems/navigation/route-planner.ts').includes('fixedDangerAtPoint(')
);
assert(
  readModuleSource(root, 'src/systems/npcs/npc-pirate-classes.ts').includes('fixedDangerAtPoint(')
);

const a = narrowsSector.locations.find((location) => location.id === 'haven');
const b = narrowsSector.locations.find((location) => location.id === 'gallows-anchor');
assert(a && b, 'both real system travel destinations must exist');
const direct = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y);
for (const profile of ['fast', 'balanced', 'safe']) {
  const plan = routing.planRouteWithProfile(narrowsSector, a.id, b.id, profile);
  assert.equal(plan.profile, profile);
  assert(Number.isFinite(plan.distance) && plan.distance >= direct - 0.01);
  const limit = profile === 'safe' ? 1.75 : profile === 'balanced' ? 1.38 : 1.0001;
  assert(
    plan.distance <= direct * limit + 0.001,
    profile + ' must not create absurd sector-wide detours'
  );
}

// When no reasonable detour exists, even a safe pilot must cross the red band.
const forcedCrossing = {
  id: 'red-shortcut-is-unavoidable',
  name: 'Red Shortcut',
  width: 2800,
  height: 850,
  defaultDangerLevel: 1,
  startLocationId: 'from',
  star: {
    id: 'sun',
    name: 'Sun',
    position: { x: 1400, y: 80 },
    radius: 10,
    colorCore: '#fff',
    colorCorona: '#ccc',
  },
  locations: [
    {
      id: 'from',
      name: 'From',
      kind: 'station',
      position: { x: 150, y: 430 },
      radius: 10,
      activities: {},
      description: '',
      dangerLevel: 1,
    },
    {
      id: 'to',
      name: 'To',
      kind: 'station',
      position: { x: 2650, y: 430 },
      radius: 10,
      activities: {},
      description: '',
      dangerLevel: 1,
    },
  ],
  regions: [
    {
      id: 'red-barrier',
      name: 'Red Barrier',
      dangerLevel: 3,
      center: { x: 1400, y: 430 },
      radius: 250,
      lobes: [{ center: { x: 1400, y: 430 }, radiusX: 690, radiusY: 1600 }],
    },
  ],
};
const unavoidable = routing.planRouteWithProfile(forcedCrossing, 'from', 'to', 'safe');
assert.equal(unavoidable.dangerLevel, 3, 'safe routes must sometimes cross red territory');
assert(unavoidable.distance <= 2500 * 1.75 + 0.001, 'no sector-wide red bypass');
console.log(
  'PASS one-third danger regions, connected corridors, real map/routing agreement and bounded red-zone crossings'
);
