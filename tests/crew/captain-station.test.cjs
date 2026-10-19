'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const player = loadStandaloneTypeScriptModule(root, 'src/core/player-profile.ts');
const crew = loadStandaloneTypeScriptModule(root, 'src/systems/crew/crew-roster-service.ts');
const ships = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-registry.ts');
const runtime = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-runtime.ts');
const ship = ships.getShipsByRole('salvage')[0];
assert(ship);

const profile = player.createPlayerProfile({
  portraitId: 1,
  captainName: 'Mara Voss',
  shipName: 'Die Wanderin',
  combatSkills: { ranged: 100, melee: 30 },
  stationSkills: {
    piloting: 75,
    sensors: 75,
    weapons: 25,
    engineering: 25,
    salvage: 20,
    mining: 15,
    logistics: 10,
  },
  stationId: 'sensor_station',
});
const roster = crew.createCrewRosterService(profile);
const captain = roster.member('player');
assert.equal(captain.name, 'Mara Voss');
assert.equal(captain.combatSkills.ranged, 100);
assert.equal(captain.combatSkills.melee, 30);
assert.equal(captain.skills.sensors, 75);
assert.equal(roster.assignments(ship).sensor_station, 'player');
assert.equal(roster.runtimeOptions(ship).assignments.sensor_station, 'player');
assert.equal(roster.dismiss('player'), null, 'captain is not dismissible');
assert.equal(roster.shareRate(), 0, 'captain takes no hireable crew share');

const before = runtime.resolveShipRuntimeSetup(ship, roster.runtimeOptions(ship));
const view = roster.member('player');
view.skills.sensors = 0;
view.combatSkills.ranged = 0;
const assignmentView = roster.assignments(ship);
assignmentView.sensor_station = 'fake';
assert.equal(roster.member('player').skills.sensors, 75);
assert.equal(roster.assignments(ship).sensor_station, 'player');

assert.equal(roster.assign(ship, 'helm', 'player'), true);
assert.equal(roster.assignments(ship).helm, 'player');
assert.equal(roster.assignments(ship).sensor_station, undefined);
const after = runtime.resolveShipRuntimeSetup(ship, roster.runtimeOptions(ship));
assert(after.stationSkills.piloting > before.stationSkills.piloting);
assert(after.stationSkills.sensors < before.stationSkills.sensors);
assert.equal(roster.assign(ship, 'invalid_station', 'player'), false);
assert.equal(roster.assignments(ship).helm, 'player');

const hired = roster.hire('torven_kray', ship);
assert(hired, 'captain must not count twice against crew capacity');
assert.equal(roster.assign(ship, 'sensor_station', 'torven_kray'), true);
assert.equal(roster.assignments(ship).helm, 'player');
console.log('PASS captain skill values, roster ownership and live station effects');
