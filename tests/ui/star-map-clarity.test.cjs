'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { narrowsSector } = loadStandaloneTypeScriptModule(
  root,
  'src/data/maps/narrows-sector.ts'
);

const byId = (id) => {
  const location = narrowsSector.locations.find((entry) => entry.id === id);
  assert(location, 'missing location ' + id);
  return location;
};
const star = narrowsSector.star.position;
const ember = byId('ember');
const relay = byId('ember-relay');
const pale = byId('pale-reach');
const leviathan = byId('leviathan');

assert(star.y - ember.position.y > 1000, 'Ember must sit clearly north of the solar core');
assert(star.y - relay.position.y > 1100, 'Ember Relay must sit clearly north of the solar core');
assert(
  Math.abs(pale.position.x - star.x) < 80 && star.y - pale.position.y > 2200,
  'Pale Reach must occupy the open upper-middle outer system'
);
assert.equal(pale.ringStyle, 'broad', 'Pale Reach must keep its broad rings');
assert.equal(leviathan.ringStyle, 'thin', 'Leviathan must keep its thin rings');
assert(
  Math.hypot(
    pale.position.x - leviathan.position.x,
    pale.position.y - leviathan.position.y
  ) > 3500,
  'the two ringed gas giants must remain spatially distinct'
);

const surfaces = fs.readFileSync(
  path.join(root, 'src/ui/space/procedural-surface-textures.ts'),
  'utf8'
);
const lighting = fs.readFileSync(
  path.join(root, 'src/ui/ships/ship-lighting-renderer.ts'),
  'utf8'
);
const npcShips = fs.readFileSync(
  path.join(root, 'src/ui/map/npc-ship-map-renderer.ts'),
  'utf8'
);

assert(
  surfaces.includes('paintPaleReachGasGiantPixel') &&
    surfaces.includes("id === 'pale-reach'"),
  'Pale Reach must use a distinct gas-giant texture instead of Leviathan banding'
);
assert(
  lighting.includes('options.preserveDetail ? 2.4') &&
    lighting.includes('options.preserveDetail && options.width < 18') &&
    npcShips.includes('Math.max(\n        10,'),
  'star-map ship sprites must keep sharp high-detail rendering until they are genuinely tiny'
);

console.log('PASS star-map layout and distant ship clarity');
