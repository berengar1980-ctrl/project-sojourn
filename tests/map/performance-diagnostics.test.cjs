'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const diagnostics = loadStandaloneTypeScriptModule(root, 'src/core/performance-diagnostics.ts');
const value = diagnostics.measurePerformance('test.operation', () => 42);
assert.equal(value, 42);
assert.deepEqual(diagnostics.performanceReport(), []);
assert.throws(
  () =>
    diagnostics.measurePerformance('test.exception', () => {
      throw new Error('expected');
    }),
  /expected/
);

const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const has = (file, fragment) => source(file).includes(fragment);
assert(has('src/app/game-controller-star-map.ts', 'input.select-location'));
assert(has('src/app/game-controller-star-map.ts', 'input.start-travel'));
assert(has('src/app/game-controller-fuel-forecast.ts', 'navigation.fuel-route-plan'));
assert(has('src/app/game-controller-scene-tick.ts', 'scene.combat.update'));
assert(has('src/app/game-controller-scene-tick.ts', 'scene.local.model'));
assert(has('src/app/game-controller-salvage.ts', 'scene.salvage.presentation'));
assert(has('src/ui/map/topdown-map-renderer.ts', 'canvas.star.draw'));
for (const section of ['background', 'danger-fog', 'locations', 'npc-ships']) {
  assert(has('src/ui/map/topdown-map-renderer.ts', 'canvas.star.' + section));
}
assert(has('src/ui/local-space/local-space-renderer.ts', 'canvas.local.draw'));
for (const section of ['background', 'backdrop', 'asteroids', 'npc-ships', 'player-ship']) {
  assert(has('src/ui/local-space/local-space-renderer.ts', 'canvas.local.' + section));
}
for (const section of ['sector', 'blockades', 'smuggling', 'salvage-events', 'economy']) {
  assert(has('src/app/game-controller-npc-tick.ts', 'sim.npcs.' + section));
}
for (const section of ['route-plan', 'route-plan-emergency', 'route-replan', 'positions']) {
  assert(has('src/systems/npcs/npc-sector-service.ts', 'sim.npcs.' + section));
}
assert(has('src/systems/economy/npc-economy-service.ts', 'sim.npcs.decision'));
assert(has('src/systems/economy/npc-economy-service.ts', 'decisionTravelQuotes'));
assert(has('src/app/bootstrap.ts', 'frame.interval'));
assert(has('src/app/bootstrap.ts', 'frame.controller'));
assert(has('src/app/game-controller-scene-tick.ts', 'sim.salvage-world'));
for (const section of ['field', 'traffic', 'workers', 'drift', 'checkpoint']) {
  assert(has('src/app/game-controller-salvage-drone-world.ts', 'sim.salvage-world.' + section));
}
assert(has('src/app/game-controller-scene-tick.ts', 'scene.local.physics'));
assert(has('src/app/game-controller-scene-tick.ts', 'scene.local.panel'));
for (const section of ['renderer', 'hud', 'overlay']) {
  assert(has('src/ui/local-space/local-space-panel.ts', 'scene.local.' + section));
}
console.log('PASS opt-in browser performance diagnostics');
