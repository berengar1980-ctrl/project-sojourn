'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');

const root = path.resolve(__dirname, '../..');
const { narrowsSector } = loadStandaloneTypeScriptModule(
  root, 'src/data/maps/narrows-sector.ts'
);
const geography = loadStandaloneTypeScriptModule(
  root, 'src/systems/navigation/fixed-danger-geography.ts'
);
const routing = loadStandaloneTypeScriptModule(
  root, 'src/systems/navigation/route-planner.ts'
);
const mapY = (y) => narrowsSector.height - y;
const bandAt = (x, y) =>
  geography.fixedDangerAtPoint(
    narrowsSector.regions, { x, y: mapY(y) }, narrowsSector.defaultDangerLevel
  );

// The geography itself — not just tinted circles on the renderer — has balanced area.
const samples = { green: 0, yellow: 0, red: 0 };
for (let y = 0; y < narrowsSector.height; y += 65) {
  for (let x = 0; x < narrowsSector.width; x += 65) {
    const level = bandAt(x + 32.5, narrowsSector.height - y - 32.5);
    samples[level >= 3 ? 'red' : level === 2 ? 'yellow' : 'green'] += 1;
  }
}
const count = Object.values(samples).reduce((a, b) => a + b, 0);
for (const [band, amount] of Object.entries(samples)) {
  const fraction = amount / count;
  assert(fraction >= 0.27 && fraction <= 0.39,
    band + ' covers ' + Math.round(fraction * 100) + '%; each band should occupy about a third');
}
assert(narrowsSector.regions.length >= 12, 'expect distinct connected rooms and red pockets');
assert(narrowsSector.regions.some((region) => (region.corridors?.length ?? 0) >= 3));
assert.equal(bandAt(750, 1050), 3, 'Blackjaw pirate harbour remains in a fixed red pocket');
assert.equal(bandAt(5650, 700), 3, 'Gallows pirate harbour remains in a fixed red pocket');
assert.equal(bandAt(3500, 4050), 1, 'Haven route is a genuine connected green corridor');
assert.equal(bandAt(2850, 2150), 2, 'inner sector includes a yellow passage');
assert.equal(bandAt(2240, 3220), 1, 'industrial route includes a green pocket');
assert.equal(bandAt(820, 4550), 3, 'Outer Shards retain red danger');

// Matching source and gameplay: both share one evaluator; no independent visual-only hazards.
assert(readModuleSource(root, 'src/ui/map/star-map-danger-regions.ts')
  .includes('fixedDangerAtPoint('));
assert(readModuleSource(root, 'src/systems/navigation/route-planner.ts')
  .includes('fixedDangerAtPoint('));
assert(readModuleSource(root, 'src/systems/npcs/npc-pirate-classes.ts')
  .includes('fixedDangerAtPoint('));

const a = narrowsSector.locations.find((location) => location.id === 'haven');
const b = narrowsSector.locations.find((location) => location.id === 'gallows-anchor');
assert(a && b, 'both real system travel destinations must exist');
const direct = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y);
for (const profile of ['fast', 'balanced', 'safe']) {
  const plan = routing.planRouteWithProfile(narrowsSector, a.id, b.id, profile);
  assert.equal(plan.profile, profile);
  assert(Number.isFinite(plan.distance) && plan.distance >= direct - 0.01);
  const limit = profile === 'safe' ? 1.75 : profile === 'balanced' ? 1.38 : 1.0001;
  assert(plan.distance <= direct * limit + 0.001,
    profile + ' must not create absurd sector-wide detours');
}
console.log('PASS one-third danger regions, connected corridors, real map/routing agreement and bounded red-zone crossings');
