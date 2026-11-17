'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const file = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const { createTimedMapReportCache } = loadStandaloneTypeScriptModule(
  root,
  'src/app/game-controller-star-map-report-cache.ts'
);
const read = createTimedMapReportCache(700);
const session = {};
const otherSession = {};
let builds = 0;
const build = () => ++builds;

assert.equal(read(session, 'sector:day1', build, 1000), 1);
assert.equal(read(session, 'sector:day1', build, 1050), 1);
assert.equal(read(session, 'sector:day1', build, 1699), 1);
assert.equal(read(session, 'sector:day1', build, 1700), 2);
assert.equal(read(session, 'sector:day2', build, 1710), 3);
assert.equal(read(otherSession, 'sector:day2', build, 1710), 4);
assert.equal(read(session, 'sector:day2', build, 1715), 3);
assert.equal(builds, 4);

const scene = file('src/app/game-controller-scene-tick.ts');
assert(scene.includes('LOCAL_MAP_MIN_FRAME_MS'));
assert(scene.includes('COMBAT_MAP_MIN_FRAME_MS'));
assert(scene.includes('shouldUpdate(lastCombatUpdate'));
assert(scene.includes('shouldUpdate(lastLocalUpdate'));
assert(scene.includes('state.localSpace.tick(deltaSeconds)'));
assert(scene.includes('state.salvageScene?.tick(deltaSeconds)'));
const models = file('src/app/game-controller-models.ts');
assert(models.includes('journey || nav.isTravelling ? null : forecastPlayerFuelRoute(context)'));
const map = file('src/app/game-controller-star-map.ts');
assert(map.includes('return readCargoReport(economy, key'));
assert(map.includes('readWorldEventReport(economy,'));
const operations = file('src/ui/operations/operations.css');
assert(operations.includes('body:has(.star-map-shell) .operations-launch'));
assert(operations.includes('body:has(.port-shell) .operations-launch'));
const renderer = file('src/ui/map/topdown-map-renderer.ts');
assert(renderer.includes('Math.min(2, Math.max(1, window.devicePixelRatio || 1))'));
assert(renderer.includes('resizeMapCanvasBackingStore(this.canvas, this.context'));
const { resizeMapCanvasBackingStore } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/map/map-canvas-backing-store.ts'
);
const fakeCanvas = { width: 0, height: 0 };
let bufferResets = 0;
const fakeContext = {
  setTransform: () => {
    bufferResets += 1;
  },
};
resizeMapCanvasBackingStore(fakeCanvas, fakeContext, 100, 90, 2);
resizeMapCanvasBackingStore(fakeCanvas, fakeContext, 100, 90, 2);
assert.equal(bufferResets, 1, 'unchanged canvas dimensions must not reallocate');
assert.deepEqual([fakeCanvas.width, fakeCanvas.height], [200, 180]);
resizeMapCanvasBackingStore(fakeCanvas, fakeContext, 120, 90, 2);
assert.equal(bufferResets, 2);
const salvage = file('src/app/game-controller-salvage.ts');
assert(salvage.includes('SALVAGE_PRESENTATION_INTERVAL_MS'));
assert(salvage.includes('npcSalvage.tick(deltaSeconds)'));
assert(salvage.includes('lastSalvagePresentation.set(context, now)'));
const planner = file('src/systems/navigation/fuel-route-planner.ts');
assert(planner.includes('const legCache = new Map<string, RoutePlan>()'));
assert(planner.includes('const state = nextState(request, current, id, routeLeg, minimumDistance)'));
assert(planner.includes('if (minimumFuel * FUEL_RESERVE > current.fuel + 1e-6) return null;'));
assert(
  planner.indexOf('if (minimumFuel * FUEL_RESERVE > current.fuel + 1e-6) return null;') <
    planner.indexOf('const segment = routeLeg(current.at, next);')
);
console.log('PASS map reporting cache, scene frame budgets, routed travel, operations visibility');
