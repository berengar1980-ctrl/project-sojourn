'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { getShipsByRole } = load('src/systems/ships/ship-registry.ts');
const { createCrewRosterService } = load('src/systems/crew/crew-roster-service.ts');
const { stageCareerCrewCheckpoint } = load('src/systems/crew/career-crew-checkpoint.ts');

const ship = getShipsByRole('mining')[0];
assert(ship);
const first = createCrewRosterService();
assert(first.hire('torven_kray', ship));
assert(first.assign(ship, 'helm', 'torven_kray'));
first.grantBoardingEquipment('medical-kit');
first.accrueCombatTraining('torven_kray', 'ranged', 60);
first.accrueStationTraining(ship, 24);
const saved = first.exportState();
const second = createCrewRosterService(undefined, JSON.parse(JSON.stringify(saved)));
assert.deepEqual(second.exportState(), saved);
assert.equal(second.assignments(ship).helm, 'torven_kray');
assert.deepEqual(second.boardingEquipment(), ['medical-kit']);
const experience = second.member('torven_kray');
assert.deepEqual(experience, first.member('torven_kray'));
second.grantBoardingEquipment('extra-kit');
assert.deepEqual(first.boardingEquipment(), ['medical-kit']);
assert.deepEqual(saved.boardingEquipment, ['medical-kit']);

const brokenStation = JSON.parse(JSON.stringify(saved));
brokenStation.assignments[ship.id].helm = 'missing-crew';
assert.throws(() => stageCareerCrewCheckpoint(brokenStation), /assignment/);
const badTraining = JSON.parse(JSON.stringify(saved));
badTraining.members[0].combatTraining.ranged = -1;
assert.throws(() => createCrewRosterService(undefined, badTraining), /crew member/);
const duplicate = JSON.parse(JSON.stringify(saved));
duplicate.members.push(duplicate.members[0]);
assert.throws(() => createCrewRosterService(undefined, duplicate), /Duplicate/);
assert.deepEqual(first.exportState(), saved, 'bad restore must not touch the active roster');
console.log('PASS career crew checkpoint: training, equipment, assignments and isolation');
