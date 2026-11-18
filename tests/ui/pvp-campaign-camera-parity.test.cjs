'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { CombatCamera } = load('src/ui/combat/combat-camera.ts');
const { PvPMapCamera } = load('src/ui/combat/pvp-map-camera.ts');
const dimensions = load('src/core/combat-map-dimensions.ts');

const width = dimensions.COMBAT_MAP_WIDTH;
const height = dimensions.COMBAT_MAP_HEIGHT;
assert.equal(width, 4200);
assert.equal(height, 2600);

const native = new CombatCamera();
const campaign = new PvPMapCamera(width, height);
campaign.setViewDimensions(1600, 900);
campaign.fit(1600, 900);
const point = { x: 1800, y: 900 };
assert.deepEqual(
  campaign.worldToScreen(point, 1600, 900),
  native.project(point, 1600, 900, width, height)
);

native.zoomAt(2, 700, 420, 1600, 900);
campaign.zoomAt(2, { x: 700, y: 420 }, 1600, 900);
native.pan(42, -35);
campaign.pan(42, -35);
const screen = campaign.worldToScreen(point, 1600, 900);
assert.deepEqual(screen, native.project(point, 1600, 900, width, height));
const aspectPoint = { x: 3100, y: 2400 };
const beforeAspect = native.project(aspectPoint, 1600, 900, width, height);
const nativeCenter = native.project(
  { x: width / 2, y: height / 2 },
  1600,
  900,
  width,
  height
);
const nativeScale = native.scale(1600, 900, width, height);
assert(
  Math.abs(beforeAspect.x - nativeCenter.x - (aspectPoint.x - width / 2) * nativeScale) < 1e-7
);
assert(
  Math.abs(beforeAspect.y - nativeCenter.y - (aspectPoint.y - height / 2) * nativeScale) < 1e-7
);
assert.equal(campaign.getZoom(), nativeScale);
const world = campaign.screenToWorld(screen, 1600, 900);
assert(Math.abs(world.x - point.x) < 1e-7);
assert(Math.abs(world.y - point.y) < 1e-7);

const mining = fs.readFileSync(
  path.join(root, 'src/ui/local-space/local-space-renderer.ts'),
  'utf8'
);
const salvage = fs.readFileSync(
  path.join(root, 'src/ui/salvage/salvage-space-renderer.ts'),
  'utf8'
);
for (const source of [mining, salvage]) {
  assert(source.includes('new PvPMapCamera(model.width, model.height)'));
  assert(source.includes('new StrategicCombatRenderer(this.canvas, model.combat)'));
}

console.log('PASS PvP camera and combat renderer shared with career maps');
