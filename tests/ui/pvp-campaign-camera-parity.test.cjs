'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { CombatCamera } = load('src/ui/combat/combat-camera.ts');
const { PvPMapCamera } = load('src/ui/combat/pvp-map-camera.ts');
const { COMBAT_MAP_WIDTH, COMBAT_MAP_HEIGHT } = load('src/core/combat-map-dimensions.ts');

assert.equal(COMBAT_MAP_WIDTH, 4200);
assert.equal(COMBAT_MAP_HEIGHT, 2600);

const native = new CombatCamera();
const campaign = new PvPMapCamera(COMBAT_MAP_WIDTH, COMBAT_MAP_HEIGHT);
const width = 1600;
const height = 900;
campaign.setViewDimensions(width, height);
campaign.fit(width, height);

for (const point of [
  { x: 0, y: 0 },
  { x: 2100, y: 1300 },
  { x: 4100, y: 2550 },
]) {
  const expected = native.project(point, width, height, COMBAT_MAP_WIDTH, COMBAT_MAP_HEIGHT);
  const actual = campaign.worldToScreen(point, width, height);
  assert.deepEqual(actual, expected, 'both modes use the same PvP projection');
  const roundTrip = campaign.screenToWorld(actual, width, height);
  assert(Math.abs(roundTrip.x - point.x) < 1e-7);
  assert(Math.abs(roundTrip.y - point.y) < 1e-7);
}

native.zoomAt(2, 700, 420, width, height);
campaign.zoomAt(2, { x: 700, y: 420 }, width, height);
native.pan(42, -35);
campaign.pan(42, -35);
for (const point of [{ x: 100, y: 200 }, { x: 2300, y: 1480 }]) {
  assert.deepEqual(
    campaign.worldToScreen(point, width, height),
    native.project(point, width, height, COMBAT_MAP_WIDTH, COMBAT_MAP_HEIGHT)
  );
}

for (const file of [
  'src/ui/local-space/local-space-renderer.ts',
  'src/ui/salvage/salvage-space-renderer.ts',
]) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert(source.includes('new PvPMapCamera(model.width, model.height)'));
  assert(source.includes('new StrategicCombatRenderer(this.canvas, model.combat)'));
}

console.log('PASS PvP camera and combat renderer are shared by career local maps');
