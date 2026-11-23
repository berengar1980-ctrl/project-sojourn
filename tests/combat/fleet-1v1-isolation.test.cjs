'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// Baselines verified byte-for-byte against main before Fleet-specific
// rendering was moved out. A deliberate original 1v1 change must explicitly
// review and update its baseline, rather than silently ride with FleetCombat.
const untouched = {
  'src/ui/combat/strategic-combat-renderer.ts': '616d2621',
  'src/ui/combat/strategic-combat-panel.ts': '21c14744',
  'src/ui/combat/combat-damage-visual.ts': 'a4630ccd',
  'src/ui/combat/combat-wreck-destruction-renderer.ts': 'c813581e',
};
for (const [file, baseline] of Object.entries(untouched)) {
  assert.equal(fnv1a(read(file)), baseline, 'original 1v1 file changed: ' + file);
}

const originalPanel = read('src/ui/combat/strategic-combat-panel.ts');
const duelLobby = read('src/ui/start/duel-lobby.ts');
const exercise = read('src/app/fleet-field-session.ts');
const fleetPanel = read('src/ui/combat/fleet-native-combat-panel.ts');
const fleetRenderer = read('src/ui/combat/fleet-native-combat-renderer.ts');
const originalRenderer = read('src/ui/combat/strategic-combat-renderer.ts');

assert(
  originalPanel.includes("from './strategic-combat-renderer'") &&
    duelLobby.includes('createFleetNativeCombatPanel(') &&
    fleetPanel.includes("from './fleet-native-combat-renderer'"),
  '1v1 and FleetCombat intentionally share the FleetNative renderer while native AI stays unchanged'
);
assert(
  exercise.includes('createGameController(') &&
    read('src/ui/local-space/local-space-renderer.ts').includes('new FleetNativeCombatRenderer(') &&
    fleetPanel.includes("from './fleet-native-combat-renderer'"),
  'FleetCombat and native 1v1 share the existing fleet renderer without an alternative AI'
);
assert(
  fleetRenderer.includes('paintParallelNativeDuels(') &&
    fleetRenderer.includes('fleetWreckEffects.draw(') &&
    !originalRenderer.includes('paintParallelNativeDuels(') &&
    !originalRenderer.includes('fleetWreckEffects.draw('),
  '1v1 uses native shared renderer but extra ships and wrecks stay isolated by the runtime snapshot'
);

const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const first = {
  id: 'isolated-a',
  name: 'Isolated A',
  shipId: 'patrol-60m',
  shieldHp: 250,
  hullHp: 300,
  weapons: [],
  hitChance: 0.7,
  dodgeChance: 0.1,
  damageMultiplier: 1,
  criticalChance: 0,
  cycleTimeMultiplier: 1,
  combatSpeed: 100,
  preferredTactic: 'fight',
};
const second = { ...first, id: 'isolated-b', name: 'Isolated B' };
const arena = () => ({ width: 4200, height: 2600, obstacles: [], asteroids: [] });
const normal = createStrategicCombatService(first, second, 3201, arena());
const explicitDefault = createStrategicCombatService(
  first,
  second,
  3201,
  arena(),
  undefined,
  false
);
assert.deepEqual(normal.getSnapshot(), explicitDefault.getSnapshot());
for (let i = 0; i < 30; i += 1) {
  assert.deepEqual(
    normal.tick(0.08),
    explicitDefault.tick(0.08),
    'ordinary 1v1 physics diverged from its default simulation path at tick ' + i
  );
}
console.log(
  'PASS original 1v1 AI/physics byte-identical; UI deliberately shares FleetNative renderer and native duel parity'
);
