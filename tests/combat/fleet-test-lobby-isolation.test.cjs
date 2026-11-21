'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const lobby = read('src/ui/start/duel-lobby.ts');
const tabs = read('src/ui/start/combat-test-tabs.ts');
const fleet = read('src/ui/start/fleet-test-lobby.ts');
const bootstrap = read('src/app/bootstrap.ts');
const core = read('src/systems/combat/strategic-combat-service.ts');
assert(!lobby.includes('DUEL_ENCOUNTERS'));
assert(!lobby.includes('attachAnalysisControls'));
assert(!lobby.includes('Vorgefertigtes Testgefecht'));
assert(
  lobby.includes('createStrategicCombatService('),
  'existing free 1vs1 still launches native combat'
);
assert(lobby.includes('createDuelArena('), 'free 1vs1 retains maps and procedural seed');
assert(tabs.includes('createDuelLobby(') && tabs.includes('createFleetTestLobby('));
assert(bootstrap.includes('createCombatTestTabs('));
assert(fleet.includes('DUEL_MAPS'), 'fleet supports existing five maps');
assert(fleet.includes('reactor4'), 'fleet uses mk4 reactors');
assert(fleet.includes('item.tier === 1'), 'weapons are mk1');
assert(fleet.includes('item.tier === 1'), 'mines are mk1');
assert(fleet.includes('fitsWeaponHardpoint'), 'weapons respect mount sizes');
assert(
  fleet.includes('createFleetTestScenario('),
  'test laboratory retains the existing fleet scenario configuration'
);
assert(
  !fleet.includes('createFleetCombatTestPanel('),
  'test laboratory cannot launch a separate map or diagnostic view'
);
assert(
  !fleet.includes('createFleetPrototype('),
  'no unused UI-owned fleet simulation factory survives'
);
for (const file of [
  'src/ui/start/fleet-combat-test-panel.ts',
  'src/ui/start/fleet-combat-map-renderer.ts',
]) {
  assert(
    !fs.existsSync(path.join(root, file)),
    'obsolete standalone FleetCombat screen must stay deleted: ' + file
  );
}
assert(core.includes('createStrategicCombatService('), 'legacy 1v1 engine remains');
for (const file of ['src/ui/start/duel-presets.ts', 'src/ui/start/duel-preset-analysis.ts']) {
  assert(!fs.existsSync(path.join(root, file)), 'obsolete preset logic removed: ' + file);
}
console.log('PASS native 1vs1 UI untouched; no standalone FleetCombat scene or dead renderer');
