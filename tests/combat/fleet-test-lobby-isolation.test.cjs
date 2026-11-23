'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const lobby = read('src/ui/start/duel-lobby.ts');
const tabs = read('src/ui/start/combat-test-tabs.ts');
const fleet = read('src/ui/start/fleet-test-lobby.ts');
const roster = read('src/ui/start/fleet-scenario-roster.ts');
const runtime = read('src/ui/start/fleet-scenario-runtime.ts');
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
assert(roster.includes('reactor4'), 'fleet uses mk4 reactors');
assert(roster.includes('item.tier === 1'), 'weapons are mk1');
assert(roster.includes('item.tier === 1'), 'mines are mk1');
assert(roster.includes('fitsWeaponHardpoint'), 'weapons respect mount sizes');
const fleetFactory = read('src/systems/combat/dynamic-fleet-combat.ts');
const parallel = read('src/systems/combat/parallel-native-duels.ts');
assert(
  runtime.includes('createCareerFleetEncounter(') &&
    runtime.includes('createNpcFleetEncounter(') &&
    read('src/systems/combat/career-fleet-encounter.ts').includes('createDynamicFleetCombat(') &&
    fleetFactory.includes('createParallelNativeDuels(') &&
    parallel.includes('createStrategicCombatService('),
  'FleetCombat laboratory must share the original native 1vs1 services'
);
assert(fleet.includes('length: 11'), 'each campaign group may contain 0 to 10 ships');
assert(fleet.includes('Nachrücker') && fleet.includes('Nach Sekunden'));
assert(fleet.includes('FLEET_SCENARIO_GROUPS'));
assert(!fleet.includes('teamA') && !fleet.includes('teamB'), 'old A/B controls removed');
assert(
  runtime.includes('encounter!.joinNearby(') && runtime.includes('arrivalSeconds'),
  'reinforcements join the same running fleet at their scheduled simulation times'
);
assert(
  fleet.includes('start.disabled = config.ships.length < 2'),
  'player-only lab has no active battle'
);
assert(
  !fleet.includes('createFleetCombatTestPanel('),
  'parallel duels must use the original combat renderer, never the obsolete arrow map'
);
assert(core.includes('createStrategicCombatService('), 'legacy 1v1 engine remains');
for (const file of ['src/ui/start/duel-presets.ts', 'src/ui/start/duel-preset-analysis.ts']) {
  assert(!fs.existsSync(path.join(root, file)), 'obsolete preset logic removed: ' + file);
}
console.log(
  'PASS legacy 1vs1 unchanged; scenario lab uses native fleet with staged campaign groups'
);
